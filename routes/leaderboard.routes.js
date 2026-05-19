import { Router } from "express"
import { getLeaderboard, getMyRank } from "../controllers/leaderboard.controller.js"
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router()

router.get("/", getLeaderboard)
router.get("/me", requireAuth, getMyRank);

export default router