import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { initializeDatabase, pool } from "./db.js";
import { createGoalsRouter } from "./goals.js";
import { createProgressRouter } from "./progress.js";
import { createWorkoutsRouter } from "./workouts.js";

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

app.patch("/api/me/preferences", async (request, response) => {
  const { isAuthenticated, userId } = getAuth(request);

  if (!isAuthenticated || !userId) {
    response.status(401).json({ error: "Sign in to update your preferences." });
    return;
  }

  const preferences = request.body ?? {};
  const hasWeightUnit = Object.prototype.hasOwnProperty.call(
    preferences,
    "weight_unit",
  );
  const hasDistanceUnit = Object.prototype.hasOwnProperty.call(
    preferences,
    "distance_unit",
  );
  const weightUnit = preferences.weight_unit;
  const distanceUnit = preferences.distance_unit;

  if (!hasWeightUnit && !hasDistanceUnit) {
    response.status(400).json({ error: "Choose a unit preference to update." });
    return;
  }
  if (hasWeightUnit && weightUnit !== "kg" && weightUnit !== "lb") {
    response.status(400).json({ error: "Choose kg or lb for your weight unit." });
    return;
  }
  if (hasDistanceUnit && distanceUnit !== "km" && distanceUnit !== "mi") {
    response.status(400).json({ error: "Choose km or mi for your distance unit." });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET weight_unit = COALESCE($1, weight_unit),
           distance_unit = COALESCE($2, distance_unit)
       WHERE id = $3
       RETURNING id, email, weight_unit, distance_unit, created_at`,
      [hasWeightUnit ? weightUnit : null, hasDistanceUnit ? distanceUnit : null, userId],
    );

    if (!result.rows[0]) {
      response.status(404).json({ error: "Your account profile could not be found." });
      return;
    }

    response.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Could not update the signed-in user's unit preferences.", error);
    response.status(500).json({
      error: "We couldn't update your unit preferences right now. Please try again.",
    });
  }
});

app.use(
  "/api/workouts",
  createWorkoutsRouter(pool, (request) => {
    const { isAuthenticated, userId } = getAuth(request);
    return isAuthenticated ? userId : null;
  }),
);

app.use(
  "/api/goals",
  createGoalsRouter(pool, (request) => {
    const { isAuthenticated, userId } = getAuth(request);
    return isAuthenticated ? userId : null;
  }),
);

app.use(
  "/api/progress",
  createProgressRouter(pool, (request) => {
    const { isAuthenticated, userId } = getAuth(request);
    return isAuthenticated ? userId : null;
  }),
);

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
      console.log(
        "PostgreSQL connected; the users table is ready for this environment.",
      );
      console.log(`Workout Tracker server listening on port ${port}`);
    });
  } catch (error) {
    console.error("PostgreSQL connection or schema initialization failed.", error);
    process.exit(1);
  }
}

void start();
