# Deco Backend Setup & Deployment Guide

## 1. Prerequisites

Make sure the following are installed on your system:

- **Node.js** (v18 or newer recommended)
- **npm** (comes with Node)
- **Git**
- **MongoDB** instance (local or Atlas)
- A **Google Cloud project** with OAuth 2.0 credentials

Check installations:

```bash
node -v
npm -v
git --version
```

---

## 2. Clone the Repository

```bash
git clone https://github.com/RacTCode/deco-backend.git
cd deco-backend
```

---

## 3. Install Dependencies

```bash
npm install
```

---

## 4. Environment Variables

Create a `.env` file in the project root by copying `.exampleenv`:

```bash
cp .exampleenv .env
```

Fill in the required values:

```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/deco

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

SESSION_SECRET=your-session-secret
CLIENT_URL=http://localhost:5173
```

---

## 5. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Set application type to **Web application**
6. Add the following under **Authorized redirect URIs**:
   - `http://localhost:5000/api/auth/google/callback` (development)
   - `https://your-domain.com/api/auth/google/callback` (production)
7. Copy the **Client ID** and **Client Secret** into your `.env`

---

## 6. MongoDB Setup

**Local:**
- Install and start MongoDB: `mongod --dbpath /data/db`
- Set `MONGODB_URI=mongodb://localhost:27017/deco`

**Atlas (recommended for production):**
1. Create a free cluster at [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create a database user under **Database Access**
3. Whitelist your IP under **Network Access**
4. Copy the connection string into `MONGODB_URI`

---

## 7. Database Seeding (Allowed Users)

After the server is running, seed the `AllowedUsers` collection with emails that should have access:

You can do this via **MongoDB Compass**, the **Atlas UI**, or a quick script:

```js
// seed.js
import mongoose from 'mongoose';
import AllowedUser from './models/AllowedUser.js';

await mongoose.connect(process.env.MONGODB_URI);

await AllowedUser.insertMany([
  { email: 'user@example.com' },
  { email: 'admin@example.com' },
]);

console.log('Seeded allowed users');
process.exit();
```

To set organizer role, update the `role` field on the relevant `User` document to `ORGANIZER` (default is `PARTICIPANT`).

---

## 8. Running the Backend (Development)

```bash
npm run dev
```

Server runs at: `http://localhost:5000`

---

## 9. Deployment (Generic VPS / Cloud)

```bash
git clone <repo>
cd deco-backend
npm install
# Configure .env
npm start
```

For production, use a process manager like **PM2**:

```bash
npm install -g pm2
pm2 start index.js --name deco-backend
pm2 save
```

Make sure your Google OAuth callback URL and `CLIENT_URL` in `.env` are updated to your production domain.

---

## 10. Troubleshooting

### MongoDB Connection Error
- Verify `MONGODB_URI` is correct
- Check that your IP is whitelisted (Atlas) or `mongod` is running (local)

### Google OAuth Redirect Mismatch
- The redirect URI in `.env` must exactly match what's registered in Google Cloud Console
- Include the protocol (`http`/`https`) and port if non-standard

### Session Not Persisting
- Ensure `SESSION_SECRET` is set
- In production, confirm your cookie settings (`secure: true`, `sameSite`) match your deployment setup

### Port Already In Use
```env
PORT=5001
```

---

## 11. Project Structure

```
deco-backend/
│
├── models/
│   ├── User.js
│   ├── AllowedUser.js
│   ├── Round.js
│   ├── Question.js
│   ├── Response.js
│   └── RoundResult.js
│
├── controllers/
│   ├── auth.controller.js
│   ├── round.controller.js
│   ├── question.controller.js
│   ├── response.controller.js
│   └── leaderboard.controller.js
│
├── routes/
│   ├── auth.routes.js
│   ├── round.routes.js
│   ├── question.routes.js
│   ├── response.routes.js
│   └── leaderboard.routes.js
│
├── middleware/
│   ├── auth.middleware.js
│   ├── ratelimiter.js
│   └── validate.middleware.js
│
├── schemas/
│   ├── round.schema.js
│   ├── question.schema.js
│   ├── response.schema.js
│   └── leaderboard.schema.js
│
├── lib/
│   └── db.js
│
├── app.js
├── index.js
├── package.json
├── .env
└── .exampleenv
```

---

## 12. Notes

- Never commit `.env` files to version control.
- Use environment variables for all secrets and configuration.
- Google OAuth requires HTTPS in production — use a reverse proxy (Nginx, Caddy) or a platform like Railway/Render that provides it.
- The backend uses role-based access: `ORGANIZER` for admin functions, `PARTICIPANT` for regular users.
- Rate limiting is enabled by default (100 requests per 15 minutes per IP).
- Session cookies are used for auth. Ensure `CLIENT_URL` is set correctly so CORS and cookie policies work.

---

---

# Backend API Documentation & Complete Event Lifecycle

---

# 🧠 Core Architectural Principle

The system is designed as a **server-time-driven event engine**.

Rounds do not require manual activation or closing.

Every state transition is derived from:

- `startedAt`
- `endsAt`
- Current **server time**

Server time is the single source of truth.
Frontend timers are visual only.
Backend enforces all lifecycle constraints.

---

# 🔐 Authentication Routes

**Base Path:** `/api/auth`

---

## Google OAuth Login

Redirects the user to Google's OAuth consent screen.

```
GET /api/auth/google
```

---

## Google OAuth Callback

Google redirects here after the user grants access. The backend verifies the email against `AllowedUsers`, creates or retrieves the user, and establishes a session.

```
GET /api/auth/google/callback
```

**If allowed:** Redirects to `CLIENT_URL` (quiz dashboard)

**If not allowed:**
```
Redirects to CLIENT_URL/not-registered
```

---

## Get Current User

Returns the authenticated user from the active session.

```
GET /api/auth/me
```

**Success (200)**
```json
{
  "_id": "...",
  "email": "user@example.com",
  "name": "User Name",
  "avatar_url": "https://...",
  "role": "PARTICIPANT"
}
```

**Not logged in (401)**
```json
{ "message": "Not authenticated" }
```

---

## Check If User Is Allowed

Checks whether the currently logged-in user's email is in the `AllowedUsers` list.

```
GET /api/auth/allowed
```

**Allowed (200)**
```json
{ "message": "Authorized" }
```

**Not allowed (403)**
```json
{ "message": "Access denied. Email not allowed." }
```

---

## Logout

Destroys the session and clears the cookie.

```
POST /api/auth/logout
```

**Success (200)**
```json
{ "message": "Logged out" }
```

---

# 🔄 ROUND STATE MODEL

Each round contains:

- `_id` (MongoDB ObjectId)
- `startedAt`
- `endsAt`

Round state is derived dynamically:

| Condition | Derived State |
|---|---|
| currentTime < startedAt | UPCOMING |
| startedAt ≤ currentTime ≤ endsAt | ACTIVE |
| currentTime > endsAt | COMPLETED |

State is not stored. State is calculated.

---

# 🔄 ROUND ROUTES

**Base Path:** `/api/round`

---

## 1️⃣ Get Active Round

Returns the currently ACTIVE round based on server time.

```
GET /api/round/active
```

**Success (200)**
```json
{
  "_id": "664abc...",
  "startedAt": "2026-03-05T10:00:00.000Z",
  "endsAt": "2026-03-05T10:30:00.000Z"
}
```

**No active round (404)**
```json
{ "message": "No active round" }
```

---

## 2️⃣ Start Round (Participant)

Registers that the authenticated user has started a round.

```
POST /api/round/:roundId/start
```

**Preconditions**
- Round exists
- startedAt ≤ now ≤ endsAt
- User has not started already

**Success (200)**
```json
{ "message": "Round started" }
```

**Errors**
```json
{ "message": "Round not found" }
{ "message": "Round not active" }
{ "message": "Round already started" }
```

---

## 3️⃣ Finish Round (Participant)

Marks the round as completed for the authenticated user.

```
POST /api/round/:roundId/finish
```

Effective finish time is capped at `round.endsAt`:

```
effectiveEndTime = min(currentTime, round.endsAt)
totalTime = effectiveEndTime - startTime
```

**Success (200)**
```json
{ "message": "Round finished" }
```

**Errors**
```json
{ "message": "Invalid finish request" }
{ "message": "Round not found" }
{ "message": "Round not started yet" }
```

---

## 4️⃣ Create Round (Organizer)

```
POST /api/round
```

**Request**
```json
{
  "startedAt": "2026-03-05T10:00:00.000Z",
  "endsAt": "2026-03-05T10:30:00.000Z"
}
```

**Success (201)**
```json
{
  "message": "Round created successfully",
  "round": {
    "_id": "664abc...",
    "startedAt": "...",
    "endsAt": "..."
  }
}
```

---

## 5️⃣ Get All Rounds (Organizer)

```
GET /api/round/admin/all
```

**Success (200)**
```json
[
  {
    "_id": "664abc...",
    "startedAt": "...",
    "endsAt": "...",
    "status": "ACTIVE",
    "totalQuestions": 10,
    "totalParticipants": 50,
    "finishedCount": 30
  }
]
```

---

## 6️⃣ Get User Round Status

Returns whether the authenticated user has started or finished a round. Used for refresh recovery and game state restoration.

```
GET /api/round/:id/status
```

**Success (200)**
```json
{ "started": false, "finished": false }
{ "started": true,  "finished": false }
{ "started": true,  "finished": true  }
```

**Refresh recovery flow:**
```
GET /api/round/active
GET /api/round/:roundId/status
GET /api/question/round/:roundId
GET /api/response/:roundId/me
```

---

# ❓ QUESTION ROUTES

**Base Path:** `/api/question`

---

## 1️⃣ Create Question (Organizer)

```
POST /api/question
```

**Request**
```json
{
  "roundId": "664abc...",
  "text": "What is the capital of France?",
  "options": { "A": "Paris", "B": "Berlin", "C": "Madrid", "D": "Rome" },
  "answer": "A",
  "link": null,
  "reward": 10
}
```

**Success (201)**
```json
{
  "status": true,
  "data": {
    "_id": "664def...",
    "roundId": "664abc...",
    "text": "What is the capital of France?",
    "options": { "A": "Paris", "B": "Berlin", "C": "Madrid", "D": "Rome" },
    "answer": "A",
    "link": null,
    "reward": 10
  }
}
```

---

## 2️⃣ Get Questions By Round

```
GET /api/question/round/:roundId
```

**Success (200)**
```json
{
  "status": true,
  "data": [
    {
      "_id": "664def...",
      "roundId": "664abc...",
      "text": "What is the capital of France?",
      "options": { "A": "Paris", "B": "Berlin", "C": "Madrid", "D": "Rome" },
      "link": null,
      "reward": 10
    }
  ]
}
```

---

## 3️⃣ Update Question (Organizer)

```
PATCH /api/question/:id
```

**Request** (any subset of fields)
```json
{
  "text": "Updated question text",
  "options": { "A": "Option 1", "B": "Option 2" },
  "answer": "A",
  "link": "https://example.com",
  "reward": 20
}
```

**Success (200)**
```json
{ "status": true, "data": { ... } }
```

---

## 4️⃣ Delete Question (Organizer)

```
DELETE /api/question/:id
```

**Success (200)**
```json
{ "status": true, "message": "Question deleted" }
```

---

# 📝 RESPONSE ROUTES

**Base Path:** `/api/response`

---

## Submit Answer

```
POST /api/response
```

**Request**
```json
{
  "questionId": "664def...",
  "submittedAnswer": "A"
}
```

**Backend validation:**
- Round is ACTIVE
- User has started
- currentTime ≤ endsAt
- User not finished

**Success (200)**
```json
{
  "message": "Saved",
  "isCorrect": true,
  "pointsEarned": 10
}
```

**After endsAt:**
```json
{ "message": "Round already ended" }
```

---

## Get User Responses For Round

Returns all answers submitted by the authenticated user for a specific round. Primarily used for state recovery on page refresh.

```
GET /api/response/:roundId/me
```

**Success (200)**
```json
[
  {
    "_id": "...",
    "questionId": "664def...",
    "submittedAnswer": "A",
    "isCorrect": true,
    "pointsEarned": 10
  },
  {
    "_id": "...",
    "questionId": "664dff...",
    "submittedAnswer": "C",
    "isCorrect": false,
    "pointsEarned": 0
  }
]
```

---

# 🏆 LEADERBOARD ROUTES

---

## Get Final Leaderboard

```
GET /api/leaderboard
```

Includes only completed rounds (`currentTime > endsAt`) and only users who finished.

**Ranking priority:**
1. Higher `totalPoints`
2. Lower `totalTime`

**Success (200)**
```json
{
  "status": true,
  "data": [
    {
      "rank": 1,
      "userId": "...",
      "name": "User A",
      "email": "user@email.com",
      "avatar_url": "https://...",
      "totalPoints": 100,
      "totalTime": 540
    }
  ]
}
```

---

# 🔁 COMPLETE EVENT FLOW

---

## 🏛 Global Round Lifecycle (Server Controlled)

1. Organizer creates round.
2. Until `startedAt` → Round is UPCOMING.
3. At `startedAt` → Automatically becomes ACTIVE.
4. At `endsAt` → Automatically becomes COMPLETED.
5. No API call required for state change.
6. Server determines state at every request.

---

## 👤 User Participation Lifecycle

**Step 1: Sign In**
User is redirected to `GET /api/auth/google` → Google consent → callback → session established.

**Step 2: Page Load**
```
GET /api/auth/me       → confirm session
GET /api/auth/allowed  → confirm access
GET /api/round/active  → check for active round
```

**Step 3: Start Round**
```
POST /api/round/:roundId/start
```

**Step 4: Answer Questions**
```
GET /api/question/round/:roundId
POST /api/response  (per answer)
```

**Step 5: Finish Round**
```
POST /api/round/:roundId/finish
```

---

## 🔄 Refresh Handling

On refresh, the frontend must:
1. Re-fetch active round
2. Check if user already started via `/api/round/:id/status`
3. Recompute remaining time: `endsAt - currentServerTime`

Never trust the client clock.

---

## ⚠️ Edge Cases Handled

- User tries to start after `endsAt` → Rejected
- User tries to submit after finish → Rejected
- User tries to submit after `endsAt` → Rejected
- User refreshes at 1 second left → Time enforced by server
- User finishes after `endsAt` → Time capped automatically

---

# 🔐 Access Control

Access is restricted to emails in the `AllowedUsers` collection.

**Flow:**
1. User signs in via Google OAuth.
2. Backend retrieves their email from the Google profile.
3. Backend checks `AllowedUsers` for that email.
4. If found → user record created/retrieved, session established, redirected to quiz.
5. If not found → **403**, redirected to "Not Registered" page.

Users who are not registered cannot access any quiz endpoints.

---

`Due to the majority of backend team's request here's an age old question -> Rishi kaha hai?`
