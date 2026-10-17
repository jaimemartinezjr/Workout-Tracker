import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { initializeDatabase, pool } from "./db.js";

const requiredEnvironment = [
  "CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "DATABASE_URL",
] as const;

const missingEnvironment = requiredEnvironment.filter(
  (name) => !process.env[name],
);

if (missingEnvironment.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnvironment.join(", ")}. ` +
      "Copy .env.example to .env and add your own development values.",
  );
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT ?? 3000);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientDirectory = path.resolve(currentDirectory, "../dist");

app.use(express.json());
app.use(clerkMiddleware());

app.get("/api/me", async (request, response) => {
  const { isAuthenticated, userId } = getAuth(request);

  if (!isAuthenticated || !userId) {
    response.status(401).json({ error: "Sign in to view your account." });
    return;
  }

  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    const primaryEmail =
      clerkUser.emailAddresses.find(
        (address) => address.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

    if (!primaryEmail) {
      response.status(422).json({
        error: "Add an email address to your account before continuing.",
      });
      return;
    }

    const result = await pool.query(
      `INSERT INTO users (id, email)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, email, weight_unit, distance_unit, created_at`,
      [userId, primaryEmail],
    );

    response.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Could not load the signed-in user's account.", error);
    response.status(500).json({
      error: "We couldn't load your account right now. Please try again.",
    });
  }
});

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use(express.static(clientDirectory));
app.get("*", (_request, response) => {
  response.sendFile(path.join(clientDirectory, "index.html"));
});

async function start() {
  try {
    await initializeDatabase();
    app.listen(port, "0.0.0.0", () => {
      console.log(`Workout Tracker server listening on port ${port}`);
    });
  } catch (error) {
    console.error("The database could not be initialized.", error);
    process.exit(1);
  }
}

void start();
