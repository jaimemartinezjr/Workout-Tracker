# Strength & Performance Tracker

The first feature adds Clerk sign-up/sign-in/sign-out and links each signed-in Clerk account to one private row in PostgreSQL's `users` table.

## Database setup

Replit provides a managed PostgreSQL database for development and supplies its private `DATABASE_URL` to the server. On startup in development, the server connects and creates the `users` table if it is missing. In production, the server only checks the database and expects the schema to have been applied through Replit's Publish flow. Do not copy the development URL into production or overwrite production data unless you intend to replace it.

For local development outside Replit, provide your own PostgreSQL connection string as `DATABASE_URL`.

## Run locally

1. Create a Clerk application and provide its keys in your local environment.
2. Copy `.env.example` to `.env` and provide your PostgreSQL `DATABASE_URL`. Do not commit `.env`.
3. Install dependencies with `npm install`.
4. Start the app with `npm run dev`.

Vite serves the interface on port 5000 and forwards `/api` requests to the Express server on port 3000. Each authenticated request to `/api/me` uses the verified Clerk user ID as the database key; clients cannot choose another account's ID.

## Environment

- `VITE_CLERK_PUBLISHABLE_KEY`: public key used by the React Clerk provider.
- `CLERK_PUBLISHABLE_KEY`: Clerk publishable key used by the Express middleware.
- `CLERK_SECRET_KEY`: private Clerk server key.
- `DATABASE_URL`: PostgreSQL connection string.
- `PORT`: optional server port (defaults to 3000).
