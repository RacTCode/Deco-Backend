import { areAllRoundsFinished } from "../lib/round.utils.js"
import { Leaderboard, Round, RoundResult } from "../models/index.js"

export const getLeaderboard = async (req, res) => {
  try {
    const isFinished = await areAllRoundsFinished()

    if (!isFinished) {
      const lastRound = await Round.findOne({}, { endsAt: 1 })
        .sort({ endsAt: -1 })
        .lean()

      return res.json({
        status: true,
        data: [],
        availableAt: lastRound?.endsAt
      })
    }

    let leaderboard = await Leaderboard.findOne().lean()

    if (!leaderboard && isFinished) {
      await generateLeaderboard()
      leaderboard = await Leaderboard.findOne().lean()
    }

    if (!leaderboard) {
      return res.json({
        status: true,
        data: [],
        message: "Leaderboard not generated yet"
      })
    }
    
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20

    const start = (page - 1) * limit
    const end = start + limit
    
    const paginatedEntries = leaderboard.entries.slice(start, end)
    
    return res.json({
      status: true,
      data: paginatedEntries,
      totalEntries: leaderboard.entries.length,
      totalPages: Math.ceil(leaderboard.entries.length / limit),
      currentPage: page
    })

  } catch (err) {
    res.status(500).json({ status: false, message: err.message })
  }
}

export const generateLeaderboard = async () => {
  const isFinished = await areAllRoundsFinished()
  if (!isFinished) return null

  // prevent duplicate generation
  const existing = await Leaderboard.findOne()
  if (existing) return existing

  const results = await RoundResult.find({ finished: true })
    .populate("userId", "name email avatar_url")
    .lean()

  const map = {}

  for (const r of results) {
    const user = r.userId
    const uid = user._id.toString()

    if (!map[uid]) {
      map[uid] = {
        userId: uid,
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url,
        totalPoints: 0,
        totalTime: 0
      }
    }

    map[uid].totalPoints += r.totalScore ?? 0
    map[uid].totalTime += r.totalTime ?? 0
  }

  const leaderboard = Object.values(map)

  leaderboard.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    return a.totalTime - b.totalTime
  })

  // ranks
  if (leaderboard.length > 0) leaderboard[0].rank = 1

  for (let i = 1; i < leaderboard.length; i++) {
    const prev = leaderboard[i - 1]
    const curr = leaderboard[i]

    if (
      curr.totalPoints === prev.totalPoints &&
      curr.totalTime === prev.totalTime
    ) {
      curr.rank = prev.rank
    } else {
      curr.rank = i + 1
    }
  }

  const saved = await Leaderboard.create({ entries: leaderboard })

  return saved
}

// controllers/leaderboard.controller.js

export const getMyRank = async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "User not authenticated"
      })
    }

    // Check if all rounds are finished
    const isFinished = await areAllRoundsFinished()
    if (!isFinished) {
      const lastRound = await Round.findOne({}, { endsAt: 1 })
        .sort({ endsAt: -1 })
        .lean()

      return res.json({
        status: true,
        message: "Leaderboard not available yet",
        availableAt: lastRound?.endsAt,
        isAvailable: false
      })
    }

    // Get leaderboard
    const leaderboard = await Leaderboard.findOne().lean()

    if (!leaderboard) {
      return res.json({
        status: true,
        message: "Leaderboard not generated yet",
        isAvailable: false
      })
    }

    // Find current user in leaderboard
    const userId = req.user._id.toString()
    const userEntry = leaderboard.entries.find(
      (e) => e.userId.toString() === userId
    )

    if (!userEntry) {
      return res.json({
        status: true,
        message: "User not found in leaderboard",
        isAvailable: false,
        user: {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email
        }
      })
    }

    // Get users around current user (2 above and 2 below)
    const userIndex = leaderboard.entries.findIndex(
      (e) => e.userId.toString() === userId
    )
    
    const startNeighbor = Math.max(0, userIndex - 2)
    const endNeighbor = Math.min(leaderboard.entries.length, userIndex + 3)
    const nearbyUsers = leaderboard.entries.slice(startNeighbor, endNeighbor)

    // Calculate page where user appears (for pagination)
    const limit = 20
    const userPage = Math.ceil((userIndex + 1) / limit)

    return res.json({
      status: true,
      isAvailable: true,
      rank: userEntry.rank,
      totalPoints: userEntry.totalPoints,
      totalTime: userEntry.totalTime,
      name: userEntry.name,
      email: userEntry.email,
      avatar_url: userEntry.avatar_url,
      userId: userEntry.userId,
      totalParticipants: leaderboard.entries.length,
      userPage: userPage,  // Which page the user is on
      nearbyUsers: nearbyUsers,  // Optional: users around you
      position: userIndex + 1,  // Exact position (1-indexed)
      topPerformers: leaderboard.entries.slice(0, 3)  // Top 3 for reference
    })

  } catch (err) {
    console.error('Get my rank error:', err)
    res.status(500).json({ 
      status: false, 
      message: err.message 
    })
  }
}