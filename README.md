# Strength & Performance Tracker

A personal training log for strength workouts and runs. The app uses Clerk for sign-up, sign-in, and sign-out, and keeps each signed-in user's records private.

## What the app does

- Create, view, edit, and delete strength and running workouts.
- Set lift goals for weight and reps, and running goals for distance and pace.
- Create reusable strength and running templates, including templates saved from a workout, and star templates for quick access.
- Search, filter, and sort workout history.
- View training charts and summary stats, including workouts this week, heaviest set, and longest run.

See [schema.md](schema.md) for the database tables, columns, relationships, and differences from the planned schema.

## Live URL

There is no live URL yet. Replit currently reports that this project has no active deployment. Publish the app in Replit to create a production URL, then add that URL here.

## Tools used

- **React and TypeScript** for the interface.
- **Node.js and Express** for the server and API.
- **Clerk** for authentication.
- **Replit-managed PostgreSQL** for persistent data.
- **Recharts** for progress charts.
- **Vite** for development and production builds.
- **Node's test runner and Playwright** for automated tests.
- **Replit** for the development workspace and deployment.

## Database setup

Replit provides a managed PostgreSQL database for development and supplies its private `DATABASE_URL` to the server. On startup in development, the server creates the `users` table if it is missing and applies the idempotent migrations in `server/migrations/` for workouts, goals, and fractional-second precision for run-goal pace.

Production startup checks that the expected tables and fractional-precision goal pace column exist; it never applies migrations. For production schema changes, merge the code so the development schema is current, then use Replit's Publish flow to review and apply its development-to-production schema diff before the updated app is released. Do not connect a development process to production or copy a development database URL into production.

For local development outside Replit, provide your own PostgreSQL connection string as `DATABASE_URL`.

## Run locally

1. Install Node.js and npm.
2. Install dependencies with `npm install`.
3. Create a Clerk application, copy `.env.example` to `.env`, and provide the Clerk keys and a PostgreSQL `DATABASE_URL`. Do not commit `.env`.
4. Start the app with `npm run dev`.

Vite serves the interface on port 5000 and forwards `/api` requests to the Express server on port 3000. In Replit, the managed development database supplies `DATABASE_URL` to the server automatically. On startup, the development server creates the `users` table and applies the SQL files in `server/migrations/`.

Every authenticated data endpoint derives ownership from the server-verified Clerk session; the browser never supplies an owner ID. Keep `DATABASE_URL` server-side and private.

## Data-isolation test

Run `npm run test:data-isolation`. It starts the real Express workout router against a temporary in-memory SQL test double, not the configured development or production database, and sends requests as two separate authenticated test users. The test confirms the second user gets an empty list and a `404` for the first user's known workout ID. For example, removing `AND user_id = $1` from the list query or `AND user_id = $2` from the detail query would make the corresponding assertion fail. The injected test identity header exists only in this test harness; production continues to use Clerk's verified session.

## Environment

- `VITE_CLERK_PUBLISHABLE_KEY`: public key used by the React Clerk provider.
- `CLERK_PUBLISHABLE_KEY`: Clerk publishable key used by the Express middleware.
- `CLERK_SECRET_KEY`: private Clerk server key.
- `DATABASE_URL`: PostgreSQL connection string.
- `PORT`: optional server port (defaults to 3000).
