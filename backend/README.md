# Skill Recommendation System Backend

Express backend for the Skill Recommendation System frontend.

## What it provides

- `POST /api/auth/signup`:
  - Input: `{ name, email, password }`
  - Output: `{ token, user }`
- `POST /api/auth/login`:
  - Input: `{ email, password }`
  - Output: `{ token, user }`
- `POST /api/ai/recommendations`:
  - Input: `{ quizAnswers }`
  - Output: `{ summary, recommendations }`
- `POST /api/ai/chat`:
  - Input: `{ message }`
  - Output: `{ reply }`
- `GET /api/health`:
  - Health check with DB connection status
- `GET /api/db/status`:
  - Dedicated DB status endpoint
- `POST /api/users/profile`:
  - Upsert profile in MongoDB Atlas for the authenticated user (`savedSkills`, `enrolledCourses`, `activityLog`, `recommendationHistory`, etc.)
- `GET /api/users/profile/me`:
  - Fetch saved profile for the authenticated user

## Run locally

1. Install dependencies:
   - `npm install`
2. Create env file:
   - Copy `.env.example` to `.env`
3. Start the server:
   - `npm run dev`

By default the backend runs on `http://localhost:4000`.

## Run frontend + backend

1. Start backend from `backend/`:
   - `npm run dev`
2. Open browser:
   - `http://localhost:4000`

## Optional AI provider integration

`/api/ai/chat` supports Gemini and Anthropic.

- `AI_PROVIDER=gemini` -> prefers Gemini
- `AI_PROVIDER=anthropic` -> prefers Anthropic
- `AI_PROVIDER=auto` -> tries Gemini first, then Anthropic

If no AI key is available (or providers fail), it falls back to a local rule-based advisor reply.

## MongoDB Atlas setup

1. Create Atlas project and cluster.
2. Create a DB user:
   - Atlas `Database Access` -> `Add New Database User`
3. Allow your IP:
   - Atlas `Network Access` -> add your current IP (or temporary `0.0.0.0/0` for testing)
4. Get connection string:
   - Atlas `Connect` -> `Drivers` -> copy URI
5. Set env values in `backend/.env`:
   - `MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster-url>/?retryWrites=true&w=majority`
   - `MONGODB_DB_NAME=skill_recommendation_system`
   - `JWT_SECRET=<strong-random-secret>`
   - `REQUIRE_DATABASE=true` (optional, forces startup failure if DB is unreachable)
6. Restart backend.

## Verify DB connection

- `GET http://localhost:4000/api/health`
- `GET http://localhost:4000/api/db/status`

When connected, `database.connected` should be `true`.

