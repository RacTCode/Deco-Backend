// app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import roundRoutes from "./routes/round.routes.js";
import responseRoutes from "./routes/response.routes.js";
import questionRoutes from "./routes/question.routes.js";
import leaderboardRoutes from "./routes/leaderboard.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import limiter from "./middleware/ratelimiter.js";
import { requireAuth } from "./middleware/auth.middleware.js";
import { generateLeaderboard } from "./controllers/leaderboard.controller.js";
import mongoose from "mongoose";

dotenv.config();

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

  
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.warn(`CORS blocked request from origin: ${origin}`);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return cors(corsOptions)(req, res, next);
  next();
});

// Health endpoint for load balancer and monitoring
app.get("/health", (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.json({ status: "ok", dbConnected });
});

app.use(limiter);
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Public routes ────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);          // login, callback, logout are public
app.use("/api/leaderboard", leaderboardRoutes);

// ─── Protected routes ─────────────────────────────────────────────────────────
app.use("/api/round",    requireAuth, roundRoutes);
app.use("/api/response", requireAuth, responseRoutes);
app.use("/api/question", requireAuth, questionRoutes);
app.use("/api/admin",    requireAuth, adminRoutes);


export default app;