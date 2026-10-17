# Strength & Performance Tracker

The first feature adds Clerk sign-up/sign-in/sign-out and links each signed-in Clerk account to one private row in PostgreSQL's `users` table.

## Local setup

1. Create a Clerk application and a PostgreSQL database.
2. Copy `.env.example` to `.env` and fill in your own values. Do not commit `.env`.
3. Install dependencies with `npm install`.
4. Start the app with `npm run dev`.

Vite serves the interface on port 5173 and forwards `/api` requests to the Express server on port 3000. The server creates the `users` table if it does not exist. Each authenticated request to `/api/me` uses the verified Clerk user ID as the database key; clients cannot choose another account's ID.

For a production build, provide the same environment variables through the hosting platform's secret manager, run `npm run build`, then `npm start`. The publishable Clerk key is used by the browser; keep `CLERK_SECRET_KEY` and `DATABASE_URL` server-side.

## Environment

- `VITE_CLERK_PUBLISHABLE_KEY`: public key used by the React Clerk provider.
- `CLERK_PUBLISHABLE_KEY`: Clerk publishable key used by the Express middleware.
- `CLERK_SECRET_KEY`: private Clerk server key.
- `DATABASE_URL`: PostgreSQL connection string.
- `PORT`: optional server port (defaults to 3000).
