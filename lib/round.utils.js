import mongoose from "mongoose"
import { Round } from "../models/index.js"

export const isNumericRoundId = (value) => {
  return typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))
}

export const isObjectIdString = (value) => {
  return typeof value === "string" && mongoose.Types.ObjectId.isValid(value)
}

export const findRoundByExternalId = async (externalId) => {
  if (isNumericRoundId(externalId)) {
    return await Round.findOne({ roundNumber: Number(externalId) }).lean()
  }

  if (isObjectIdString(externalId)) {
    return await Round.findById(externalId).lean()
  }

  return null
}

export const resolveRoundObjectId = async (externalId) => {
  const round = await findRoundByExternalId(externalId)
  return round?._id ?? null
}

export const getNextRoundNumber = async () => {
  const latest = await Round.findOne({ roundNumber: { $exists: true } })
    .sort({ roundNumber: -1 })
    .lean()

  return latest?.roundNumber ? latest.roundNumber + 1 : 1
}

export const attachRoundNumericId = (round) => {
  if (!round) return null
  return {
    ...round,
    id: round.roundNumber ?? (round._id ? round._id.toString() : undefined),
  }
}

export const areAllRoundsFinished = async () => {
  const now = new Date()

  const lastRound = await Round.findOne({}, { endsAt: 1 })
    .sort({ endsAt: -1 })
    .lean()

  if (!lastRound) return false

  return now > lastRound.endsAt
}