import test from "node:test";
import assert from "node:assert/strict";
import { clerkClient } from "@clerk/express";
import { prisma } from "../lib/prisma.js";
import { requireAllowedEmail, requireOrganizer } from "../middleware/auth.middleware.js";

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return res;
};

test("requireOrganizer returns 401 when req.user missing", () => {
  const req = {};
  const res = createRes();
  let nextCalled = false;

  requireOrganizer(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, "USER_MISSING");
});

test("requireOrganizer returns 403 when user is not organizer", () => {
  const req = { user: { role: "PARTICIPANT" } };
  const res = createRes();
  let nextCalled = false;

  requireOrganizer(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, "ORGANIZER_REQUIRED");
});

test("requireOrganizer allows organizer", () => {
  const req = { user: { role: "ORGANIZER" } };
  const res = createRes();
  let nextCalled = false;

  requireOrganizer(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("requireAllowedEmail returns 401 when userId missing", async () => {
  const req = {
    auth: async () => ({}),
  };
  const res = createRes();
  let nextCalled = false;

  await requireAllowedEmail(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, "AUTH_NO_USER_ID");
});

test("requireAllowedEmail returns 403 when email is not approved", async () => {
  const originalGetUser = clerkClient.users.getUser;
  const originalFindAllowed = prisma.allowedUsers.findUnique;

  clerkClient.users.getUser = async () => ({
    emailAddresses: [{ emailAddress: "not-approved@example.com" }],
    fullName: "No Access",
  });
  prisma.allowedUsers.findUnique = async () => null;

  const req = {
    auth: async () => ({ userId: "user_123" }),
  };
  const res = createRes();
  let nextCalled = false;

  try {
    await requireAllowedEmail(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, "EMAIL_NOT_ALLOWED");
  } finally {
    clerkClient.users.getUser = originalGetUser;
    prisma.allowedUsers.findUnique = originalFindAllowed;
  }
});

test("requireAllowedEmail allows approved users and sets req.user", async () => {
  const originalGetUser = clerkClient.users.getUser;
  const originalFindAllowed = prisma.allowedUsers.findUnique;
  const originalFindUser = prisma.user.findUnique;

  const existingUser = {
    id: 10,
    clerkId: "user_approved",
    email: "approved@example.com",
    role: "PARTICIPANT",
    name: "Approved User",
    avatar_url: null,
  };

  clerkClient.users.getUser = async () => ({
    emailAddresses: [{ emailAddress: "approved@example.com" }],
    fullName: "Approved User",
  });
  prisma.allowedUsers.findUnique = async () => ({ id: 1, email: "approved@example.com" });
  prisma.user.findUnique = async () => existingUser;

  const req = {
    auth: async () => ({ userId: "user_approved" }),
  };
  const res = createRes();
  let nextCalled = false;

  try {
    await requireAllowedEmail(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(req.user, existingUser);
  } finally {
    clerkClient.users.getUser = originalGetUser;
    prisma.allowedUsers.findUnique = originalFindAllowed;
    prisma.user.findUnique = originalFindUser;
  }
});
