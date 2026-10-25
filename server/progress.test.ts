import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import { createProgressRouter, type ProgressDatabase } from "./progress.js";

class MemoryProgressDatabase implements ProgressDatabase {
  readonly queries: Array<{ text: string; values: unknown[] }> = [];

  constructor(
    private readonly rowsByUser: Record<string, Record<string, unknown>[]>,
  ) {}

  async query(text: string, values: unknown[] = []) {
    this.queries.push({ text, values });
    const rows = this.rowsByUser[String(values[0])] ?? [];
    return { rows, rowCount: rows.length };
  }
}

class MemoryProgressOverviewDatabase implements ProgressDatabase {
  readonly queries: Array<{ text: string; values: unknown[] }> = [];

  async query(text: string, values: unknown[] = []) {
    this.queries.push({ text, values });
    if (text.includes("AS workouts_this_week")) {
      return {
        rows: [{
          workouts_this_week: "3",
          heaviest_exercise_name: "Squat",
          heaviest_weight_kg: "145.500",
          heaviest_reps: 5,
          heaviest_performed_on: "2026-10-21",
          longest_run_distance_km: "13.250",
          longest_run_performed_on: "2026-10-20",
        }],
        rowCount: 1,
      };
    }
    if (text.includes("ls.set_number")) {
      return {
        rows: [{
          workout_id: "lift-workout",
          performed_on: "2026-10-21",
          exercise_name: "Squat",
          weight_kg: "145.500",
          reps: 5,
          set_number: 2,
        }],
        rowCount: 1,
      };
    }
    if (text.includes("rd.pace_seconds_per_km")) {
      return {
        rows: [{
          workout_id: "run-workout",
          performed_on: "2026-10-20",
          distance_km: "13.250",
          pace_seconds_per_km: 330,
        }],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected overview query: ${text}`);
  }
}

async function withTestApp(
  database: ProgressDatabase,
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use(
    "/api/progress",
    createProgressRouter(
      database,
      (request) => request.header("x-test-user-id") ?? null,
    ),
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

test("progress is only returned for the authenticated user", async () => {
  const database = new MemoryProgressDatabase({
    "user-a": [{
      goal_id: "goal-a",
      workout_id: "workout-a",
      performed_on: "2026-04-12",
      weight_kg: "100.500",
      reps: 5,
      distance_km: null,
      pace_seconds_per_km: null,
    }],
    "user-b": [],
  });

  await withTestApp(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/progress`, {
      headers: { "x-test-user-id": "user-b" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { points: [] });
    assert.deepEqual(database.queries[0].values, ["user-b"]);
    assert.match(database.queries[0].text, /WHERE g\.user_id = \$1/);
  });
});

test("progress points normalize database values for lift and run charts", async () => {
  const database = new MemoryProgressDatabase({
    "user-a": [
      {
        goal_id: "lift-goal",
        workout_id: "lift-workout",
        performed_on: "2026-04-12",
        weight_kg: "100.500",
        reps: 5,
        distance_km: null,
        pace_seconds_per_km: null,
      },
      {
        goal_id: "run-goal",
        workout_id: "run-workout",
        performed_on: "2026-04-14",
        weight_kg: null,
        reps: null,
        distance_km: "8.250",
        pace_seconds_per_km: 330,
      },
    ],
  });

  await withTestApp(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/progress`, {
      headers: { "x-test-user-id": "user-a" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      points: [
        {
          goal_id: "lift-goal",
          workout_id: "lift-workout",
          performed_on: "2026-04-12",
          weight_kg: 100.5,
          reps: 5,
          distance_km: null,
          pace_seconds_per_km: null,
        },
        {
          goal_id: "run-goal",
          workout_id: "run-workout",
          performed_on: "2026-04-14",
          weight_kg: null,
          reps: null,
          distance_km: 8.25,
          pace_seconds_per_km: 330,
        },
      ],
    });
  });
});

test("overview returns owner-scoped weekly stats and normalized lift/run history", async () => {
  const database = new MemoryProgressOverviewDatabase();
  await withTestApp(database, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/progress/overview?weekStart=2026-10-19`,
      { headers: { "x-test-user-id": "user-a" } },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      stats: {
        workouts_this_week: 3,
        heaviest_set: {
          exercise_name: "Squat",
          weight_kg: 145.5,
          reps: 5,
          performed_on: "2026-10-21",
        },
        longest_run: {
          distance_km: 13.25,
          performed_on: "2026-10-20",
        },
      },
      lift_points: [{
        workout_id: "lift-workout",
        performed_on: "2026-10-21",
        exercise_name: "Squat",
        weight_kg: 145.5,
        reps: 5,
        set_number: 2,
      }],
      run_points: [{
        workout_id: "run-workout",
        performed_on: "2026-10-20",
        distance_km: 13.25,
        pace_seconds_per_km: 330,
      }],
    });
    assert.deepEqual(
      database.queries.map(({ values }) => values),
      [["user-a", "2026-10-19"], ["user-a"], ["user-a"]],
    );
    assert.ok(database.queries.every(({ text }) => /user_id = \$1/.test(text)));
  });
});

test("overview validates week start and requires a signed-in user", async () => {
  const database = new MemoryProgressOverviewDatabase();
  await withTestApp(database, async (baseUrl) => {
    const invalidDate = await fetch(
      `${baseUrl}/api/progress/overview?weekStart=2026-02-31`,
      { headers: { "x-test-user-id": "user-a" } },
    );
    assert.equal(invalidDate.status, 400);
    assert.deepEqual(await invalidDate.json(), {
      error: "Choose a valid week start date.",
    });

    const unauthenticated = await fetch(
      `${baseUrl}/api/progress/overview?weekStart=2026-10-19`,
    );
    assert.equal(unauthenticated.status, 401);
    assert.deepEqual(await unauthenticated.json(), {
      error: "Sign in to view your progress.",
    });
    assert.equal(database.queries.length, 0);
  });
});

test("progress requires a signed-in user", async () => {
  await withTestApp(new MemoryProgressDatabase({}), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/progress`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Sign in to view your progress.",
    });
  });
});
