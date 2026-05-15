// models/index.js
import mongoose from "mongoose";

// ─── AllowedUsers ─────────────────────────────────────────────────────────────
const allowedUsersSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
});
export const AllowedUsers = mongoose.model("AllowedUsers", allowedUsersSchema);

// ─── User ─────────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
    {
        googleId: { type: String, required: true, unique: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        name: { type: String, required: true },
        role: { type: String, enum: ["ORGANIZER", "PARTICIPANT"], default: "PARTICIPANT" },
        avatar_url: { type: String, default: null },
        score: { type: Number, default: 0 },
    },
    { timestamps: true }
);
export const User = mongoose.model("User", userSchema);

// ─── Round ────────────────────────────────────────────────────────────────────
const roundSchema = new mongoose.Schema(
    {
        roundNumber: { type: Number, required: true, unique: true, index: true },
        startedAt: { type: Date, required: true },
        endsAt: { type: Date, required: true },
    },
    { timestamps: true }
);

roundSchema.virtual('id').get(function () {
    return this.roundNumber
})

roundSchema.set('toJSON', { virtuals: true })
roundSchema.set('toObject', { virtuals: true })

export const Round = mongoose.model("Round", roundSchema);

// ─── Question ─────────────────────────────────────────────────────────────────
const questionSchema = new mongoose.Schema(
    {
        roundId: { type: mongoose.Schema.Types.ObjectId, ref: "Round", required: true, index: true },
        text: { type: String, required: true },
        options: { type: mongoose.Schema.Types.Mixed, default: null }, // array or object
        answer: { type: String, required: true },
        link: { type: String, default: null },
        reward: { type: Number, required: true },
       
    },
    { timestamps: true }
);
export const Question = mongoose.model("Question", questionSchema);

// ─── Response ─────────────────────────────────────────────────────────────────
const responseSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
        roundId: { type: mongoose.Schema.Types.ObjectId, ref: "Round", required: true, index: true },
        submittedAnswer: { type: String, required: true },
        isCorrect: { type: Boolean, required: true },
        pointsEarned: { type: Number, required: true },
    },
    { timestamps: true }
);
// Unique: one response per user per question
responseSchema.index({ userId: 1, questionId: 1 }, { unique: true });
export const Response = mongoose.model("Response", responseSchema);

// ─── RoundResult ──────────────────────────────────────────────────────────────
const roundResultSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        roundId: { type: mongoose.Schema.Types.ObjectId, ref: "Round", required: true, index: true },
        startTime: { type: Date, required: true },
        endTime: { type: Date, default: null },
        totalTime: { type: Number, default: null },
        totalScore: { type: Number, default: 0 },
        finished: { type: Boolean, default: false },
    },
    { timestamps: true }
);
// Unique: one result per user per round
roundResultSchema.index({ userId: 1, roundId: 1 }, { unique: true });
export const RoundResult = mongoose.model("RoundResult", roundResultSchema);

// ─── Leaderboard ─────────────────────────────────────────────────────────────
const leaderboardEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  email: String,
  avatar_url: String,
  totalPoints: Number,
  totalTime: Number,
  rank: Number
}, { _id: false })

const leaderboardSchema = new mongoose.Schema({
  entries: [leaderboardEntrySchema],
  generatedAt: { type: Date, default: Date.now }
})

export const Leaderboard = mongoose.model("Leaderboard", leaderboardSchema)