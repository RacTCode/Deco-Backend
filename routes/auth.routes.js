import { Router } from "express"
import { requireOrganizer } from "../middleware/auth.middleware.js";
import { prisma } from "../lib/prisma.js";
import { sendError, sendSuccess } from "../lib/http-response.js";




const router = Router()

const isValidEmail = (email) => {
    return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.get("/session", async (req, res) => {
    if (!req.user) {
        return sendError(res, 401, "USER_MISSING", "User missing");
    }

    return sendSuccess(res, 200, {
        authenticated: true,
        user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            role: req.user.role,
            avatar_url: req.user.avatar_url
        }
    });
});

router.get("/me", requireOrganizer, async (req, res) => {
    return sendSuccess(res, 200, {
        message: "Backend connected successfully",
        user: req.user
    });
});

router.get("/allowed-users", requireOrganizer, async (req, res) => {
    try {
        const allowedUsers = await prisma.allowedUsers.findMany({
            orderBy: { email: "asc" }
        });

        return sendSuccess(res, 200, {
            count: allowedUsers.length,
            data: allowedUsers
        });
    } catch (error) {
        return sendError(res, 500, "SERVER_ERROR", "Server error");
    }
});

router.post("/allowed-users", requireOrganizer, async (req, res) => {
    try {
        const email = req.body?.email?.toLowerCase?.().trim?.();

        if (!isValidEmail(email)) {
            return sendError(res, 400, "INVALID_EMAIL", "Valid email is required");
        }

        const created = await prisma.allowedUsers.upsert({
            where: { email },
            create: { email },
            update: {}
        });

        return sendSuccess(res, 201, {
            message: "Email approved",
            data: created
        });
    } catch (error) {
        return sendError(res, 500, "SERVER_ERROR", "Server error");
    }
});

router.delete("/allowed-users/:email", requireOrganizer, async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email || "").toLowerCase().trim();

        if (!isValidEmail(email)) {
            return sendError(res, 400, "INVALID_EMAIL", "Valid email is required");
        }

        const existing = await prisma.allowedUsers.findUnique({
            where: { email }
        });

        if (!existing) {
            return sendError(res, 404, "EMAIL_NOT_FOUND", "Email not found in allowed list");
        }

        await prisma.allowedUsers.delete({
            where: { email }
        });

        return sendSuccess(res, 200, { message: "Email access revoked" });
    } catch (error) {
        return sendError(res, 500, "SERVER_ERROR", "Server error");
    }
});

export default router
