// middleware/auth.middleware.js
import { clerkClient } from "@clerk/express";
import { prisma } from "../lib/prisma.js";
import { sendError } from "../lib/http-response.js";

export const requireAllowedEmail = async (req, res, next) => {
  try {
    const { userId } = await req.auth()
    if (!userId) {
      return sendError(res, 401, "AUTH_NO_USER_ID", "Authorization error: no userId");
    }

    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.emailAddresses[0].emailAddress;

    // Check whitelist in Prisma with retry logic
    let allowed = null;
    try {
      allowed = await prisma.allowedUsers.findUnique({ where: { email } });
    } catch (dbErr) {
      console.error("Database connection error:", dbErr.code, dbErr.message);
      
      // If connection refused, try to reconnect
      if (dbErr.code === 'ECONNREFUSED' || dbErr.code === 'ENOTFOUND') {
        console.log("Attempting to reconnect to database...");
        // Force reconnect
        await prisma.$disconnect();
        await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
        try {
          allowed = await prisma.allowedUsers.findUnique({ where: { email } });
        } catch (retryErr) {
          console.error("Database reconnect failed:", retryErr.message);
          return sendError(
            res,
            503,
            "DB_UNAVAILABLE",
            "Database connection error. Please try again."
          );
        }
      } else {
        throw dbErr;
      }
    }
    
    if (!allowed) {
      return sendError(res, 403, "EMAIL_NOT_ALLOWED", "Access denied. Email not allowed.");
    }

    // Auto-create user in Prisma if needed
    let user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          clerkId: userId,
          email,
          name: clerkUser.fullName || email,
        },
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return sendError(res, 500, "AUTHORIZATION_ERROR", "Authorization error");
  }
};

// Middleware to allow only organizers
export const requireOrganizer = (req, res, next) => {
  if (!req.user) {
    return sendError(res, 401, "USER_MISSING", "User missing");
  }

  if (req.user.role !== "ORGANIZER") {
    return sendError(res, 403, "ORGANIZER_REQUIRED", "Only organizers allowed");
  }
  

  next();
};
