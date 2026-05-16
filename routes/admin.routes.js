import { Router } from "express"
import { truncateTables } from "../controllers/admin.controller.js"
import { requireOrganizer } from "../middleware/auth.middleware.js"

const router = Router()

router.post("/truncate", requireOrganizer, truncateTables)

export default router