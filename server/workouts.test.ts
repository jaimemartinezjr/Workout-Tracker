import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import { createWorkoutsRouter, type WorkoutDatabase } from "./workouts.js";

const workoutA = {
  id: "workout-owned-by-a",
  title: "Morning strength",
  activity_type: "strength",
  performed_on: "2026-10-20",
  notes: null,
  created_at: "2026-10-20T08:00:00.000Z",
  user_id: "user-a",
};

class IsolatedTestDatabase implements WorkoutDatabase {
  async query(text: string, values: unknown[] = []) {
    const sql = text.replace(/\s+/g, " ");
    const hasOwnerGuard =
      sql.includes("user_id = $1") || sql.includes("user_id = $2");

    if (sql.includes("FROM workouts w") && sql.includes("ARRAY_AGG")) {
      let rows = [workoutA];
      if (sql.includes("WHERE w.user_id = $1")) {
        rows = rows.filter((workout) => workout.user_id === values[0]);
      }
      return {
        rows: rows.map((workout) => ({
          id: workout.id,
          title: workout.title,
          activity_type: workout.activity_type,
          performed_on: workout.performed_on,
          notes: workout.notes,
          created_at: workout.created_at,
          exercise_names: ["Bench press", "Row"],
          max_weight_kg: "100.5",
          min_weight_kg: "40",
          distance_km: null,
        })),
        rowCount: rows.length,
      };
    }

    if (sql.includes("FROM lifting_sets") || sql.includes("FROM run_details")) {
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes("FROM workouts")) {
      let rows = [workoutA];
      if (sql.includes("WHERE user_id = $1")) {
        rows = rows.filter((workout) => workout.user_id === values[0]);
      } else if (sql.includes("WHERE id = $1")) {
        rows = rows.filter((workout) => workout.id === values[0]);
        if (hasOwnerGuard && sql.includes("user_id = $2")) {
          rows = rows.filter((workout) => workout.user_id === values[1]);
        }
      }
      return { rows, rowCount: rows.length };
    }

    throw new Error(`Unexpected test query: ${sql}`);
  }

  async connect(): Promise<never> {
    throw new Error("This read-only isolation test must not open a transaction.");
  }
}

async function withTestApp(
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/workouts",
    createWorkoutsRouter(new IsolatedTestDatabase(), (request) => {
      const userId = request.header("x-test-user-id");
      return userId || null;
    }),
  );

  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("a different user cannot see another user's workout in the list", async () => {
  await withTestApp(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workouts`, {
      headers: { "x-test-user-id": "user-b" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { workouts: [] });
  });
});

test("an owner's workout list includes search and sort summaries", async () => {
  await withTestApp(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workouts`, {
      headers: { "x-test-user-id": "user-a" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      workouts: [{
        id: "workout-owned-by-a",
        title: "Morning strength",
        activity_type: "strength",
        performed_on: "2026-10-20",
        notes: null,
        created_at: "2026-10-20T08:00:00.000Z",
        exercise_names: ["Bench press", "Row"],
        max_weight_kg: 100.5,
        min_weight_kg: 40,
        distance_km: null,
      }],
    });
  });
});

test("a different user cannot open another user's workout by its known ID", async () => {
  await withTestApp(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/workouts/${workoutA.id}`,
      { headers: { "x-test-user-id": "user-b" } },
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Workout not found." });
  });
});
