# Deco Backend Setup & Deployment Guide

## 1. Prerequisites

Make sure the following are installed on your system:

-   **Node.js** (v18 or newer recommended)
-   **npm** (comes with Node)
-   **Git**
-   **PostgreSQL** database (required for Prisma)

Check installations:

``` bash
node -v
npm -v
git --version
psql --version  # Check PostgreSQL
```

------------------------------------------------------------------------

# 2. Clone the Repository

``` bash
git clone <repository-url>
cd deco-backend
```

Example:

``` bash
git clone https://github.com/RacTCode/deco-backend.git
cd deco-backend
```

------------------------------------------------------------------------

# 3. Install Dependencies

Install all required packages:

``` bash
npm install
```

------------------------------------------------------------------------

# 4. Environment Variables

Create a `.env` file in the project root by copying `.exampleenv`:

``` bash
cp .exampleenv .env
```

Fill in the required values in `.env` 


- Ensure your PostgreSQL database is running and accessible

------------------------------------------------------------------------


# 5. Prisma Setup

Generate Prisma client:

``` bash
npx prisma generate
```

Run migrations (for development):

``` bash
npx prisma migrate dev --name init
```

For production deployments:

``` bash
npx prisma migrate deploy
```

**Note**: The project uses PostgreSQL. Ensure your DATABASE_URL points to a valid PostgreSQL instance.

------------------------------------------------------------------------

# 6. Database Seeding

After running migrations, seed the database with allowed users for authentication:

1. Open Prisma Studio:
   ``` bash
   npx prisma studio
   ```

2. Navigate to the `AllowedUsers` table
3. Add email addresses of users who should have access to the backend
4. Set roles in the `User` table if needed (default is PARTICIPANT, ORGANIZER for admins)

------------------------------------------------------------------------

# 6.1 Authentication Flow (Frontend + Backend)

This backend expects **Clerk session tokens** on every API request.

## End-to-end flow

1. Frontend opens Clerk sign-in UI (email/password, magic link, or OTP based on Clerk config).
2. User authenticates with Clerk.
3. Frontend gets a Clerk session token and sends it in:

```http
Authorization: Bearer <clerk_session_token>
```

4. Backend validates token through `requireAuth()`.
5. Backend loads Clerk user email and checks `AllowedUsers` table (`requireAllowedEmail`).
6. If email is approved, backend creates/loads local `User` and stores it on `req.user`.
7. Route-level role middleware (`requireOrganizer`) blocks organizer-only APIs.

## What frontend should call after sign-in

- `GET /api/auth/session`
  - Any authenticated + approved user
  - Returns local user profile + role for app bootstrap

- `GET /api/auth/me`
  - Organizer-only check
  - Use this for organizer route guard if needed

## Approval workflow endpoints (organizer only)

- `GET /api/auth/allowed-users`
  - List approved emails

- `POST /api/auth/allowed-users`
  - Body: `{ "email": "user@example.com" }`
  - Approves an email

- `DELETE /api/auth/allowed-users/:email`
  - Revokes an approved email

If a signed-in Clerk user is not approved, backend returns `403 Access denied. Email not allowed.`

Detailed frontend integration contract:
- `docs/frontend-auth-contract.md`

------------------------------------------------------------------------

------------------------------------------------------------------------

# 7. Running the Backend (Development)

Start the development server:

``` bash
npm run dev
```

or if the project uses a normal start script:

``` bash
npm start
```

Typical dev server runs at:

    http://localhost:5000

------------------------------------------------------------------------


# 8. Deployment (Generic VPS / Cloud)

Steps:

1.  SSH into your server
2.  Clone the repository
3.  Install dependencies
4.  Configure environment variables
5.  Run Prisma migrations
6.  Start the server

Example:

``` bash
git clone <repo>
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

------------------------------------------------------------------------

# 9. Troubleshooting

### Prisma Client Errors

Run:

``` bash
npx prisma generate
```

### Database Connection Issues

Verify:

-   DATABASE_URL is correct
-   PostgreSQL server is running
-   Correct credentials and database exists

### Port Already In Use

Change port in `.env`:

``` env
PORT=5001
```

------------------------------------------------------------------------

# 10. Project Structure

    deco-backend/
    │
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    │
    ├── controllers/
    │   ├── round.controller.js
    │   ├── question.controller.js
    │   ├── response.controller.js
    │   └── leaderboard.controller.js
    │
    ├── routes/
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
    │   └── prisma.js
    │
    ├── app.js
    ├── index.js
    ├── package.json
    ├── .env
    └── .exampleenv

------------------------------------------------------------------------

# 11. Notes

-   Never commit `.env` files to version control.
-   Use environment variables for all secrets and configuration.
-   Always run Prisma migrations before starting the server in production.
-   Clerk authentication requires users to be whitelisted in the `AllowedUsers` table.
-   The backend uses role-based access: ORGANIZER for admin functions, PARTICIPANT for regular users.
-   Rate limiting is enabled by default (100 requests per 15 minutes per IP).

------------------------------------------------------------------------
------------------------------------------------------------------------
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

# 🔄 ROUND STATE MODEL

Each round contains:

- `id`
- `startedAt`
- `endsAt`

Round state is derived dynamically:

| Condition | Derived State |
|------------|--------------|
| currentTime < startedAt | UPCOMING |
| startedAt ≤ currentTime ≤ endsAt | ACTIVE |
| currentTime > endsAt | COMPLETED |

State is not stored.
State is calculated.

---

# 🔄 ROUND ROUTES
**Base Path:** `/api/round`

---

## 1️⃣ Get Active Round

Returns the currently ACTIVE round based on server time.

### Endpoint
```
GET /api/round/active
```

### Success Response (200)
```json
{
  "id": 1,
  "startedAt": "2026-03-05T10:00:00.000Z",
  "endsAt": "2026-03-05T10:30:00.000Z"
}
```

### No Active Round (404)
```json
{
  "message": "No active round"
}
```

### Backend Logic
```
WHERE startedAt <= now AND endsAt >= now
```

Only one active round is expected at a time.

---

## 2️⃣ Start Round (Participant)

Registers that a specific user has started a round.

### Endpoint
```
POST /api/round/:roundId/start
```

### Preconditions
- Round exists
- startedAt ≤ now ≤ endsAt
- User has not started already

### Success Response (200)
```json
{
  "message": "Round started"
}
```

### Error Responses

```json
{ "message": "Round not found" }
```

```json
{ "message": "Round not active" }
```

```json
{ "message": "Round already started" }
```

### What Backend Does
- Creates row in `roundResult`
- Stores:
  - userId
  - roundId
  - startTime = now
  - finished = false

---

## 3️⃣ Finish Round (Participant)

Marks the round as completed for the user.

### Endpoint
```
POST /api/round/:roundId/finish
```

### Preconditions
- User has started round
- Not already finished

### Time Handling

Effective finish time is:

```
effectiveEndTime = min(currentTime, round.endsAt)
```

Total time is:

```
effectiveEndTime - startTime
```

This prevents finishing after round ends.

### Success Response (200)
```json
{
  "message": "Round finished"
}
```

### Error Responses

```json
{ "message": "Invalid finish request" }
```

```json
{ "message": "Round not found" }
```

```json
{ "message": "Round not started yet" }
```

---

## 4️⃣ Create Round (Organizer)

Creates a new round.

### Endpoint
```
POST /api/round
```

### Request
```json
{
  "startedAt": "2026-03-05T10:00:00.000Z",
  "endsAt": "2026-03-05T10:30:00.000Z"
}
```

### Validation
- endsAt > startedAt

### Success (201)
```json
{
  "message": "Round created successfully",
  "round": {
    "id": 1,
    "startedAt": "...",
    "endsAt": "..."
  }
}
```

---

## 5️⃣ Get All Rounds (Organizer)

Returns rounds with computed state.

### Endpoint
```
GET /api/round/admin/all
```

### Success Response
```json
[
  {
    "id": 1,
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

Returns the participation status of the authenticated user for a specific round.

This endpoint allows the frontend to determine whether the user has already
started or finished the round. It is primarily used for **refresh recovery**
and **game state restoration**.

---

### Endpoint

```
GET /api/round/:id/status
```

---

### Success Response (200)

If the user **has not started the round**:

```json
{
  "started": false,
  "finished": false
}
```

If the user **has started but not finished**:

```json
{
  "started": true,
  "finished": false
}
```

If the user **has already finished**:

```json
{
  "started": true,
  "finished": true
}
```

---


### Typical Frontend Usage

This endpoint is used to determine what screen the user should see.

Example page load flow:

```
GET /api/round/active
GET /api/round/:roundId/status
```


### Refresh Recovery Example

If a user refreshes their browser during a round:

1. Frontend checks the active round
2. Frontend calls this endpoint
3. If `started: true`, the frontend restores the round state

Example recovery flow:

```
GET /api/round/active
GET /api/round/:roundId/status
GET /api/question/round/:roundId
GET /api/response/:roundId/me
```
---

# ❓ QUESTION ROUTES
**Base Path:** `/api/question`

These endpoints allow organizers to manage questions for rounds and allow
participants to retrieve questions during gameplay.

---

# 1️⃣ Create Question (Organizer)

Creates a new question for a specific round.

### Endpoint
```
POST /api/question
```

### Authentication
Required. Organizer role only.

```
Authorization: Bearer <Clerk Session Token>
```

### Request Body
```json
{
  "roundId": 1,
  "text": "What is the capital of France?",
  "options": {
    "A": "Paris",
    "B": "Berlin",
    "C": "Madrid",
    "D": "Rome"
  },
  "answer": "A",
  "link": null,
  "reward": 10
}
```

---

### Success Response (201)

```json
{
  "status": true,
  "data": {
    "id": 12,
    "roundId": 1,
    "text": "What is the capital of France?",
    "options": {
      "A": "Paris",
      "B": "Berlin",
      "C": "Madrid",
      "D": "Rome"
    },
    "answer": "A",
    "link": null,
    "reward": 10
  }
}
```

---

### Error Responses

Missing question text

```json
{
  "status": false,
  "message": "Question text is required"
}
```

Server error

```json
{
  "status": false,
  "message": "Server error"
}
```

---

# 2️⃣ Get Questions By Round

Returns all questions belonging to a specific round.

### Endpoint
```
GET /api/question/round/:roundId
```

---

### Success Response (200)

```json
{
  "status": true,
  "data": [
    {
      "id": 1,
      "roundId": 1,
      "text": "What is the capital of France?",
      "options": {
        "A": "Paris",
        "B": "Berlin",
        "C": "Madrid",
        "D": "Rome"
      },
      "link": null,
      "reward": 10
    }
  ]
}
```

---

### Typical Frontend Usage

This endpoint is called after a user starts a round.

Example:

```
GET /api/question/round/1
```

The returned questions are displayed to the participant.

---

# 3️⃣ Update Question (Organizer)

Updates an existing question.

### Endpoint
```
PATCH /api/question/:id
```

### Authentication
Organizer only.

---

### Request Body

Any subset of these fields may be provided:

```json
{
  "text": "Updated question text",
  "options": {
    "A": "Option 1",
    "B": "Option 2"
  },
  "answer": "A",
  "link": "https://example.com",
  "reward": 20
}
```

---

### Success Response (200)

```json
{
  "status": true,
  "data": {
    "id": 1,
    "roundId": 1,
    "text": "Updated question text",
    "options": {
      "A": "Option 1",
      "B": "Option 2"
    },
    "answer": "A",
    "link": "https://example.com",
    "reward": 20
  }
}
```

---

### Error Response

```json
{
  "status": false,
  "message": "Server error"
}
```

---

# 4️⃣ Delete Question (Organizer)

Deletes a question permanently.

### Endpoint
```
DELETE /api/question/:id
```

### Authentication
Organizer only.

---

### Success Response (200)

```json
{
  "status": true,
  "message": "Question deleted"
}
```

---

### Error Response

```json
{
  "status": false,
  "message": "Server error"
}
```

---



# 📝 RESPONSE ROUTES
**Base Path:** `/api/response`

---

## Submit Answer

```
POST /api/response
```

### Request
```json
{
  "questionId": 1,
  "submittedAnswer": "A"
}
```

### Backend Validation
- Round is ACTIVE
- User has started
- currentTime ≤ endsAt
- User not finished

### Success Response
```json
{
  "message": "Saved",
  "isCorrect": true,
  "pointsEarned": 10
}
```

If after endsAt:
```json
{ "message": "Round already ended" }
```
---
## Get User Responses For Round

Returns all answers submitted by the authenticated user for a specific round.

This endpoint is primarily used for **state recovery**, allowing the frontend
to restore previously submitted answers when the user refreshes the page or
reopens the round.

### Endpoint
```
GET /api/response/:roundId/me
```

### Request
```json
[
  {
    "id": 21,
    "questionId": 1,
    "submittedAnswer": "A",
    "isCorrect": true,
    "pointsEarned": 10
  },
  {
    "id": 22,
    "questionId": 2,
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

Includes:
- Only rounds where currentTime > endsAt
- Only users who finished

Ranking Priority:
1. Higher totalPoints
2. Lower totalTime
3. Competition ranking

### Success Response
```json
{
  "status": true,
  "data": [
    {
      "rank": 1,
      "userId": 12,
      "name": "User A",
      "email": "user@email.com",
      "avatar_url": null,
      "totalPoints": 100,
      "totalTime": 540
    }
  ]
}
```

---

# 🔁 COMPLETE EVENT FLOW (DETAILED)

There are two synchronized but independent systems:

---

# 🏛 GLOBAL ROUND LIFECYCLE (Server Controlled)

1. Organizer creates round.
2. Until startedAt → Round is UPCOMING.
3. At startedAt → Automatically becomes ACTIVE.
4. At endsAt → Automatically becomes COMPLETED.
5. No API call required for state change.
6. Server determines state at every request.

No frontend trigger required.

---

# 👤 USER PARTICIPATION LIFECYCLE

## Step 1: Page Load

Frontend calls:
```
GET /api/round/active
```

If 200:
- Store startedAt
- Store endsAt
- Start countdown UI

If 404:
- Show waiting state
- Poll periodically

---

## Step 2: User Auto-Start

If:
- Active round exists
- User has not started

Frontend calls:
```
POST /api/round/:roundId/start
```

Backend validates time window.

---

## Step 3: Question Interaction

Frontend fetches:
```
GET /api/question/round/:roundId
```

Answers submitted via:
```
POST /api/response
```

Each submission revalidated server-side.

---

## Step 4: Auto Finish

At earliest of:
- User clicks finish
- currentTime ≥ endsAt

Frontend calls:
```
POST /api/round/:roundId/finish
```

Backend caps time automatically.

---

# 🔄 REFRESH HANDLING

On refresh:

Frontend must:
1. Re-fetch active round
2. Check if user already started
3. Recompute remaining time:
   ```
   endsAt - currentServerTime
   ```

Never trust client clock.

---

# ⚠️ EDGE CASES HANDLED

- User tries to start after endsAt → Rejected
- User tries to submit after finish → Rejected
- User tries to submit after endsAt → Rejected
- User refreshes at 1 second left → Time enforced by server
- User finishes after endsAt → Time capped automatically

---
# 🔐 Allowed Users Access Control

The platform restricts quiz access to a predefined list of allowed email addresses.

Only users whose email exists in the **AllowedUsers** database table are permitted
to access the quiz system.

All other users are blocked from participation.

---


# 🚦 Access Flow

After a user logs in through Clerk authentication, the backend performs
an authorization check against the whitelist.

### Authentication Sequence

1. User signs in using Clerk.
2. Backend retrieves the authenticated user's email from Clerk.
3. Backend checks if the email exists in the `AllowedUsers` table.
4. Access decision is made based on the result.

---

# ✅ Allowed User Flow

If the email **exists in the whitelist**:

1. Backend allows the request.
2. Backend ensures a corresponding `User` record exists.
3. If the user does not exist yet, it is automatically created.
4. The user is redirected to the **quiz platform**.

Example backend result:

```json
{
  "message": "Authorized"
}
```

Frontend behavior:
```
Redirect user to quiz dashboard
```

---

# ❌ Not Allowed User Flow

If the email **does not exist in the whitelist**:

The backend rejects the request.

### Response

HTTP Status: **403**

```json
{
  "message": "Access denied. Email not allowed."
}
```

Frontend behavior:
```
Redirect user to "Not Registered" page
Display message:
"You are not registered for this quiz event."
```

Users who are not registered **cannot access any quiz endpoints**.

---

`Due to the majority of backend team's request here's an age old question ->  
Rishi kaha hai?`
