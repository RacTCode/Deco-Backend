import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import authRoutes from "../routes/auth.routes.js";
import { prisma } from "../lib/prisma.js";

const createApp = (getUser) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const user = getUser();
    if (user) {
      req.user = user;
    }
    next();
  });
  app.use("/api/auth", authRoutes);
  return app;
};

test("GET /api/auth/session returns 401 when user is missing", async () => {
  const app = createApp(() => null);

  const res = await request(app).get("/api/auth/session");

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, "USER_MISSING");
});

test("GET /api/auth/session returns user profile for authenticated participant", async () => {
  const app = createApp(() => ({
    id: 22,
    email: "player@example.com",
    name: "Player",
    role: "PARTICIPANT",
    avatar_url: null,
  }));

  const res = await request(app).get("/api/auth/session");

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.user.role, "PARTICIPANT");
});

test("GET /api/auth/me returns 403 for participant", async () => {
  const app = createApp(() => ({
    id: 22,
    email: "player@example.com",
    name: "Player",
    role: "PARTICIPANT",
    avatar_url: null,
  }));

  const res = await request(app).get("/api/auth/me");

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, "ORGANIZER_REQUIRED");
});

test("GET /api/auth/me returns 200 for organizer", async () => {
  const app = createApp(() => ({
    id: 1,
    email: "organizer@example.com",
    name: "Organizer",
    role: "ORGANIZER",
    avatar_url: null,
  }));

  const res = await request(app).get("/api/auth/me");

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.user.role, "ORGANIZER");
});

test("GET /api/auth/allowed-users returns 403 for participant", async () => {
  const app = createApp(() => ({
    id: 22,
    email: "player@example.com",
    name: "Player",
    role: "PARTICIPANT",
    avatar_url: null,
  }));

  const res = await request(app).get("/api/auth/allowed-users");

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, "ORGANIZER_REQUIRED");
});

test("GET /api/auth/allowed-users returns list for organizer", async () => {
  const originalFindMany = prisma.allowedUsers.findMany;

  prisma.allowedUsers.findMany = async () => [
    { id: 1, email: "a@example.com" },
    { id: 2, email: "b@example.com" },
  ];

  const app = createApp(() => ({
    id: 1,
    email: "organizer@example.com",
    name: "Organizer",
    role: "ORGANIZER",
    avatar_url: null,
  }));

  try {
    const res = await request(app).get("/api/auth/allowed-users");

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.count, 2);
  } finally {
    prisma.allowedUsers.findMany = originalFindMany;
  }
});

test("POST /api/auth/allowed-users validates email", async () => {
  const app = createApp(() => ({
    id: 1,
    email: "organizer@example.com",
    name: "Organizer",
    role: "ORGANIZER",
    avatar_url: null,
  }));

  const res = await request(app)
    .post("/api/auth/allowed-users")
    .send({ email: "invalid-email" });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, "INVALID_EMAIL");
});

test("POST /api/auth/allowed-users approves valid email", async () => {
  const originalUpsert = prisma.allowedUsers.upsert;
  prisma.allowedUsers.upsert = async ({ create }) => ({ id: 3, email: create.email });

  const app = createApp(() => ({
    id: 1,
    email: "organizer@example.com",
    name: "Organizer",
    role: "ORGANIZER",
    avatar_url: null,
  }));

  try {
    const res = await request(app)
      .post("/api/auth/allowed-users")
      .send({ email: "newuser@example.com" });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.email, "newuser@example.com");
  } finally {
    prisma.allowedUsers.upsert = originalUpsert;
  }
});

test("DELETE /api/auth/allowed-users/:email returns 404 when email is missing in whitelist", async () => {
  const originalFindUnique = prisma.allowedUsers.findUnique;
  prisma.allowedUsers.findUnique = async () => null;

  const app = createApp(() => ({
    id: 1,
    email: "organizer@example.com",
    name: "Organizer",
    role: "ORGANIZER",
    avatar_url: null,
  }));

  try {
    const res = await request(app).delete("/api/auth/allowed-users/missing@example.com");

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, "EMAIL_NOT_FOUND");
  } finally {
    prisma.allowedUsers.findUnique = originalFindUnique;
  }
});
