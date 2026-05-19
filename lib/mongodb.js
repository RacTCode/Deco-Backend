// lib/mongodb.js
import mongoose from "mongoose";

let isConnected = false;

export const connectDB = async () => {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI environment variable is not set");

  // Allow tuning pool size via env var, fallback to sensible default
  const maxPoolSize = process.env.MONGODB_MAX_POOL_SIZE
    ? Number(process.env.MONGODB_MAX_POOL_SIZE)
    : 50;

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize,
  });

  isConnected = true;
  console.log("MongoDB connected");
};

export const isDbConnected = () => {
  // 1 = connected
  return mongoose.connection.readyState === 1;
};

// Call this once in your server entrypoint (e.g. server.js / index.js):
//   import { connectDB } from "./lib/mongodb.js";
//   await connectDB();