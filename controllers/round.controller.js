// controllers/round.controller.js
import { Round, RoundResult, Response } from "../models/index.js"
import { findRoundByExternalId, resolveRoundObjectId, attachRoundNumericId, getNextRoundNumber, areAllRoundsFinished } from "../lib/round.utils.js"
import { generateLeaderboard } from "./leaderboard.controller.js"

// Get active round the user hasn't completed yet
export const getActiveRound = async (req, res) => {
  try {
    const userId = req.user._id
    const now = new Date()

    const activeRounds = await Round.find({
      startedAt: { $lte: now },
      endsAt: { $gte: now }
    }).sort({ startedAt: 1 }).lean()
    
    const userResults = await RoundResult.find({ userId }, { roundId: 1, finished: 1 }).lean()
    const completedIds = new Set(
      userResults.filter(r => r.finished).map(r => r.roundId.toString())
    )

    const availableRound = activeRounds.find(r => !completedIds.has(r._id.toString()))
    
    return res.json(attachRoundNumericId(availableRound))
  } catch (error) {
    return res.status(500).json({ message: "Server error" })
  }
}

// Get upcoming round (or next available active round user hasn't done)
export const getUpcomingRound = async (req, res) => {
  try {
    const userId = req.user._id
    const now = new Date()

    const activeRounds = await Round.find({
      startedAt: { $lte: now },
      endsAt: { $gte: now }
    }).sort({ startedAt: 1 }).lean()

    const userResults = await RoundResult.find({ userId }, { roundId: 1, finished: 1 }).lean()
    const completedIds = new Set(
      userResults.filter(r => r.finished).map(r => r.roundId.toString())
    )

    const availableActive = activeRounds.find(r => !completedIds.has(r._id.toString()))
    if (availableActive) return res.json(attachRoundNumericId(availableActive))

    const nextUpcoming = await Round.findOne({ startedAt: { $gt: now } })
      .sort({ startedAt: 1 })
      .lean()

    return res.json(attachRoundNumericId(nextUpcoming))
  } catch (error) {
    return res.status(500).json({ message: "Server error" })
  }
}

// Detailed round info for waiting screen
export const getRoundInfo = async (req, res) => {
  try {
    const userId = req.user._id
    const now = new Date()

    const activeRounds = await Round.find({
      startedAt: { $lte: now },
      endsAt: { $gte: now }
    }).sort({ startedAt: 1 }).lean()

    const userResults = await RoundResult.find({ userId }, { roundId: 1, finished: 1 }).lean()
    const completedIds = new Set(
      userResults.filter(r => r.finished).map(r => r.roundId.toString())
    )

    const currentRound = activeRounds.find(r => !completedIds.has(r._id.toString())) ?? null

    const nextRound = await Round.findOne({ startedAt: { $gt: now } })
      .sort({ startedAt: 1 })
      .lean() ?? null

    return res.json({
      current: attachRoundNumericId(currentRound),
      next: attachRoundNumericId(nextRound),
      now: now.toISOString(),
    })
  } catch (error) {
    return res.status(500).json({ message: "Server error" })
  }
}

// Participant starts a round
export const startRound = async (req, res) => {
  const userId = req.user._id
  const { roundId } = req.params

  try {
    const round = await findRoundByExternalId(roundId)
    if (!round) return res.status(404).json({ message: "Round not found" })

    const now = new Date()
    if (now < round.startedAt || now > round.endsAt) {
      return res.status(400).json({ message: "Round not active" })
    }

    const existing = await RoundResult.findOne({ userId, roundId: round._id }).lean()
    if (existing) return res.status(400).json({ message: "Round already started" })

    await RoundResult.create({ userId, roundId: round._id, startTime: now, finished: false })

    return res.json({ message: "Round started" })
  } catch (error) {
    return res.status(500).json({ message: "Server error" })
  }
}

// Participant finishes a round
export const finishRound = async (req, res) => {
  const userId = req.user._id
  const { roundId } = req.params

  try {
    const round = await findRoundByExternalId(roundId)
    if (!round) return res.status(404).json({ message: "Round not found" })

    const result = await RoundResult.findOne({ userId, roundId: round._id })
    if (!result || result.finished) {
      return res.status(400).json({ message: "Invalid finish request" })
    }

    const now = new Date()
    if (now < round.startedAt) return res.status(400).json({ message: "Round not started yet" })
    if (now > round.endsAt) return res.status(400).json({ message: "Round already ended" })

    const totalTime = Math.floor((now - result.startTime) / 1000)

    const responses = await Response.find({ userId, roundId: round._id }).lean()
    const totalScore = responses.reduce((sum, r) => sum + r.pointsEarned, 0)

    result.endTime = now
    result.totalTime = totalTime
    result.totalScore = totalScore
    result.finished = true
    await result.save()

    res.json({ message: "Round finished" })

    if (areAllRoundsFinished()) {
      generateLeaderboard();
    }

  } catch (error) {
    return res.status(500).json({ message: "Server error" })
  }
}

// Admin creates a new round
export const createRound = async (req, res) => {
  const { startedAt, endsAt } = req.body

  try {
    if (new Date(startedAt) >= new Date(endsAt)) {
      return res.status(400).json({ message: "End time must be after start time" })
    }

    const roundNumber = await getNextRoundNumber()
    const round = await Round.create({
      roundNumber,
      startedAt: new Date(startedAt),
      endsAt: new Date(endsAt)
    })

    return res.status(201).json({ message: "Round created successfully", round: attachRoundNumericId(round.toObject()) })
  } catch (error) {
    return res.status(500).json({ message: "Server error" })
  }
}

// Admin: get all rounds with participant/question stats
export const getAllRoundsAdmin = async (req, res) => {
  try {
    const now = new Date()

    const rounds = await Round.find({}).sort({ _id: -1 }).lean()
    const roundIds = rounds.map(r => r._id)

    // Fetch question counts and result counts in parallel
    const [questionCounts, resultDocs] = await Promise.all([
      // Group questions by roundId
      (await import("../models/index.js")).Question.aggregate([
        { $match: { roundId: { $in: roundIds } } },
        { $group: { _id: "$roundId", count: { $sum: 1 } } }
      ]),
      // Fetch all results for these rounds
      RoundResult.find({ roundId: { $in: roundIds } }, { roundId: 1, finished: 1 }).lean()
    ])

    const questionCountMap = Object.fromEntries(questionCounts.map(q => [q._id.toString(), q.count]))
    const resultsByRound = {}
    for (const r of resultDocs) {
      const key = r.roundId.toString()
      if (!resultsByRound[key]) resultsByRound[key] = []
      resultsByRound[key].push(r)
    }

    const formatted = rounds.map(round => {
      const id = round._id.toString()
      let status

      if (now < round.startedAt) status = "UPCOMING"
      else if (now <= round.endsAt) status = "ACTIVE"
      else status = "COMPLETED"

      const results = resultsByRound[id] ?? []
      const numericId = round.roundNumber ?? null

      return {
        id: numericId ?? round._id.toString(),
        roundNumber: numericId,
        _id: round._id,
        startedAt: round.startedAt,
        endsAt: round.endsAt,
        status,
        totalQuestions: questionCountMap[id] ?? 0,
        totalParticipants: results.length,
        finishedCount: results.filter(r => r.finished).length
      }
    })

    return res.json(formatted)
  } catch (error) {
    console.error("getAllRoundsAdmin error:", error)
    return res.status(500).json({ message: "Server error" })
  }
}

// Get user's start/finish status for a round
export const getRoundStatus = async (req, res) => {
  const userId = req.user._id
  const { id: roundId } = req.params

  try {
const resolvedId = await resolveRoundObjectId(roundId)
  if (!resolvedId) return res.status(404).json({ message: "Round not found" })

  const result = await RoundResult.findOne({ userId, roundId: resolvedId }).lean()

    if (!result) return res.json({ started: false, finished: false })

    return res.json({ started: true, finished: result.finished })
  } catch (err) {
    return res.status(500).json({ message: "Server error" })
  }
}