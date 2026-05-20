// routes/auth.routes.js
import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import { isUserAllowed, requireAuth } from "../middleware/auth.middleware.js";
import { configDotenv } from 'dotenv';
configDotenv();

const router = Router();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL;

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day

const oauthClient = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// ─── GET /api/auth/login ──────────────────────────────────────────────────────
router.get("/login", (req, res) => {
    const url = oauthClient.generateAuthUrl({
        access_type: "offline",
        scope: ["profile", "email"],
        prompt: "select_account",
    });
    res.redirect(url);
});

// ─── GET /api/auth/callback ───────────────────────────────────────────────────
router.get("/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).json({ message: "Missing OAuth code" });

    try {
        const { tokens } = await oauthClient.getToken(code);
        oauthClient.setCredentials(tokens);

        const ticket = await oauthClient.verifyIdToken({
            idToken: tokens.id_token,
            audience: CLIENT_ID,
        });
        const { sub: googleId, email, name, picture } = ticket.getPayload();

        const allowed = await isUserAllowed(email);

        let token;

        if (allowed) {
            // Upsert user
            const user = await User.findOneAndUpdate(
                { email: email.toLowerCase() },
                {
                    $set: {
                        googleId,
                        name: name || email,
                        avatar_url: picture || null,
                    },
                    $setOnInsert: {
                        role: "PARTICIPANT",
                        score: 0,
                    },
                },
                { upsert: true, returnDocument: true }
            );

            // Sign JWT with userId
            token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "1d" });
            
        } else {
            // User not authorized - create temporary JWT without adding to User table
            const tempPayload = { email: email.toLowerCase(), name, picture };
            token = jwt.sign(tempPayload, JWT_SECRET, { expiresIn: "1d" });
            
        }

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            path: "/",
            domain: undefined,
            maxAge: SESSION_DURATION_MS,
        });

        

        res.redirect(FRONTEND_URL);
    } catch (err) {
        
        res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", requireAuth, (req, res) => {
    const { email, ...safeUser } = req.user;
    
    return res.status(200).json({
        message: "Backend connected successfully",
        user: safeUser,
    });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post("/logout", requireAuth, (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
        domain: undefined,
    });
    return res.status(200).json({ message: "Logged out successfully" });
});

// ─── GET /api/auth/allowed ────────────────────────────────────────────────────
router.get("/allowed", requireAuth, async (req, res) => {

    const allowed = await isUserAllowed(req.user.email);
    return res.status(200).json({
        allowed
    });
});

export default router;