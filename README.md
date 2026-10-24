# Strength & Performance Tracker

The app uses Clerk sign-up/sign-in/sign-out and links each signed-in Clerk account to one private row in PostgreSQL's `users` table. Signed-in users can create, view, edit, and delete their own strength and running workouts.

## Database setup

Replit provides a managed PostgreSQL database for development and supplies its private `DATABASE_URL` to the server. On startup in development, the server creates the `users` table if it is missing and applies the idempotent migrations in `server/migrations/` for workouts, goals, and fractional-second precision for run-goal pace.

Production startup checks that the expected tables and fractional-precision goal pace column exist; it never applies migrations. For production schema changes, merge the code so the development schema is current, then use Replit's Publish flow to review and apply its development-to-production schema diff before the updated app is released. Do not connect a development process to production or copy a development database URL into production.

For local development outside Replit, provide your own PostgreSQL connection string as `DATABASE_URL`.

## Run locally

1. Create a Clerk application and provide its keys in your local environment.
2. Copy `.env.example` to `.env` and provide your PostgreSQL `DATABASE_URL`. Do not commit `.env`.
3. Install dependencies with `npm install`.
4. Start the app with `npm run dev`.

Vite serves the interface on port 5000 and forwards `/api` requests to the Express server on port 3000. Every workout endpoint derives ownership from the server-verified Clerk session; the browser never supplies an owner ID. Workout detail and child-record queries also include the authenticated owner's ID.

## Data-isolation test

Run `npm run test:data-isolation`. It starts the real Express workout router against a temporary in-memory SQL test double, not the configured development or production database, and sends requests as two separate authenticated test users. The test confirms the second user gets an empty list and a `404` for the first user's known workout ID. For example, removing `AND user_id = $1` from the list query or `AND user_id = $2` from the detail query would make the corresponding assertion fail. The injected test identity header exists only in this test harness; production continues to use Clerk's verified session.

## Environment

- `VITE_CLERK_PUBLISHABLE_KEY`: public key used by the React Clerk provider.
- `CLERK_PUBLISHABLE_KEY`: Clerk publishable key used by the Express middleware.
- `CLERK_SECRET_KEY`: private Clerk server key.
- `DATABASE_URL`: PostgreSQL connection string.
- `PORT`: optional server port (defaults to 3000).
