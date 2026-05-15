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

    return res.json({
      status: true,
      data: leaderboard.entries
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

