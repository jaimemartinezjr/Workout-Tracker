# Strength & Performance Tracker

The first feature adds Clerk sign-up/sign-in/sign-out and links each signed-in Clerk account to one private row in PostgreSQL's `users` table.

## Database setup

Replit provides separate managed PostgreSQL databases for development and production. The app uses Replit's `DATABASE_URL` in each environment; do not copy the development URL into production. The development database has the `users` table used by sign-in. When you publish, Replit's Publish flow can create the production database and apply the development schema to it. Do not overwrite production data unless you intend to replace it.

For local development outside Replit, provide your own PostgreSQL connection string as `DATABASE_URL`.

## Run locally

1. Create a Clerk application and provide its keys in your local environment.
2. Copy `.env.example` to `.env` and provide your PostgreSQL `DATABASE_URL`. Do not commit `.env`.
3. Install dependencies with `npm install`.
4. Start the app with `npm run dev`.

Vite serves the interface on port 5173 and forwards `/api` requests to the Express server on port 3000. Each authenticated request to `/api/me` uses the verified Clerk user ID as the database key; clients cannot choose another account's ID. Production schema changes are applied through Replit's Publish flow, not at server startup.

## Environment

- `VITE_CLERK_PUBLISHABLE_KEY`: public key used by the React Clerk provider.
- `CLERK_PUBLISHABLE_KEY`: Clerk publishable key used by the Express middleware.
- `CLERK_SECRET_KEY`: private Clerk server key.
- `DATABASE_URL`: PostgreSQL connection string.
- `PORT`: optional server port (defaults to 3000).
