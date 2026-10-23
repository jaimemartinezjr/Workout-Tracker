import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import { createGoalsRouter, type GoalsDatabase } from "./goals.js";

type GoalRow = Record<string, unknown> & { id: string; user_id: string };

class MemoryGoalsDatabase implements GoalsDatabase {
  constructor(private readonly goals: GoalRow[] = []) {}

  async query(text: string, values: unknown[] = []) {
    const sql = text.replace(/\s+/g, " ");

    if (sql.includes("SELECT") && sql.includes("FROM public.goals")) {
      const rows = this.goals.filter((goal) => goal.user_id === values[0]);
      return { rows, rowCount: rows.length };
    }

    if (sql.includes("INSERT INTO public.goals")) {
      const [id, userId, goalType, exerciseName, weight, reps, distance, pace] =
        values;
      const goal: GoalRow = {
        id: String(id),
        user_id: String(userId),
        goal_type: goalType,
        exercise_name: exerciseName,
        target_weight_kg: weight,
        target_reps: reps,
        target_distance_km: distance,
        target_pace_seconds_per_km: pace,
      };
      this.goals.push(goal);
      return { rows: [goal], rowCount: 1 };
    }

    if (sql.includes("UPDATE public.goals")) {
      const [goalType, exerciseName, weight, reps, distance, pace, id, userId] =
        values;
      const goal = this.goals.find(
        (item) => item.id === id && item.user_id === userId,
      );
      if (!goal) return { rows: [], rowCount: 0 };
      Object.assign(goal, {
        goal_type: goalType,
        exercise_name: exerciseName,
        target_weight_kg: weight,
        target_reps: reps,
        target_distance_km: distance,
        target_pace_seconds_per_km: pace,
      });
      return { rows: [goal], rowCount: 1 };
    }

    if (sql.includes("DELETE FROM public.goals")) {
      const [id, userId] = values;
      const index = this.goals.findIndex(
        (goal) => goal.id === id && goal.user_id === userId,
      );
      if (index === -1) return { rows: [], rowCount: 0 };
      const [goal] = this.goals.splice(index, 1);
      return { rows: [{ id: goal.id }], rowCount: 1 };
    }

    throw new Error(`Unexpected test query: ${sql}`);
  }
}

async function withTestApp(
  database: GoalsDatabase,
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/goals",
    createGoalsRouter(database, (request) => request.header("x-test-user-id") ?? null),
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

test("users can only list their own goals", async () => {
  const database = new MemoryGoalsDatabase([
    {
      id: "goal-a",
      user_id: "user-a",
      goal_type: "strength",
      exercise_name: "Squat",
      target_weight_kg: 100,
      target_reps: 5,
      target_distance_km: null,
      target_pace_seconds_per_km: null,
    },
  ]);

  await withTestApp(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/goals`, {
      headers: { "x-test-user-id": "user-b" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { goals: [] });
  });
});

test("saving validates strength and running targets", async () => {
  await withTestApp(new MemoryGoalsDatabase(), async (baseUrl) => {
    const headers = {
      "content-type": "application/json",
      "x-test-user-id": "user-a",
    };
    const invalidStrength = await fetch(`${baseUrl}/api/goals`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        goal_type: "strength",
        exercise_name: "   ",
        target_weight_kg: -2,
        target_reps: 0,
      }),
    });
    assert.equal(invalidStrength.status, 400);
    assert.deepEqual(await invalidStrength.json(), {
      error: "Enter an exercise name up to 120 characters.",
    });

    const invalidRun = await fetch(`${baseUrl}/api/goals`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        goal_type: "run",
        target_distance_km: 0,
        target_pace_seconds_per_km: 0,
      }),
    });
    assert.equal(invalidRun.status, 400);
    assert.deepEqual(await invalidRun.json(), {
      error: "Enter a target distance greater than zero.",
    });
  });
});

test("a goal can be created, updated, and deleted by its owner", async () => {
  const database = new MemoryGoalsDatabase();
  await withTestApp(database, async (baseUrl) => {
    const headers = {
      "content-type": "application/json",
      "x-test-user-id": "user-a",
    };
    const createdResponse = await fetch(`${baseUrl}/api/goals`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        goal_type: "strength",
        exercise_name: "Squat",
        target_weight_kg: 120,
        target_reps: 5,
      }),
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as {
      goal: { id: string; target_weight_kg: number };
    };
    assert.equal(created.goal.target_weight_kg, 120);

    const updatedResponse = await fetch(
      `${baseUrl}/api/goals/${created.goal.id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          goal_type: "run",
          target_distance_km: 10,
          target_pace_seconds_per_km: 335.5391,
        }),
      },
    );
    assert.equal(updatedResponse.status, 200);
    const updated = (await updatedResponse.json()) as {
      goal: {
        goal_type: string;
        target_distance_km: number;
        target_pace_seconds_per_km: number;
      };
    };
    assert.equal(updated.goal.goal_type, "run");
    assert.equal(updated.goal.target_distance_km, 10);
    assert.equal(updated.goal.target_pace_seconds_per_km, 335.5391);

    const deletedResponse = await fetch(
      `${baseUrl}/api/goals/${created.goal.id}`,
      { method: "DELETE", headers },
    );
    assert.equal(deletedResponse.status, 204);
    assert.equal(database["goals"].length, 0);
  });
});

test("a user can keep multiple lift and run goals", async () => {
  await withTestApp(new MemoryGoalsDatabase(), async (baseUrl) => {
    const headers = {
      "content-type": "application/json",
      "x-test-user-id": "user-a",
    };
    for (const goal of [
      {
        goal_type: "strength",
        exercise_name: "Deadlift",
        target_weight_kg: 160,
        target_reps: 3,
      },
      {
        goal_type: "run",
        target_distance_km: 10,
        target_pace_seconds_per_km: 330,
      },
    ]) {
      const response = await fetch(`${baseUrl}/api/goals`, {
        method: "POST",
        headers,
        body: JSON.stringify(goal),
      });
      assert.equal(response.status, 201);
    }

    const response = await fetch(`${baseUrl}/api/goals`, {
      headers: { "x-test-user-id": "user-a" },
    });
    assert.equal(response.status, 200);
    const result = (await response.json()) as {
      goals: Array<{ goal_type: string }>;
    };
    assert.equal(result.goals.length, 2);
    assert.deepEqual(
      new Set(result.goals.map((goal) => goal.goal_type)),
      new Set(["strength", "run"]),
    );
  });
});

test("a user cannot change or remove another user's goal", async () => {
  const database = new MemoryGoalsDatabase([
    {
      id: "goal-a",
      user_id: "user-a",
      goal_type: "run",
      exercise_name: null,
      target_weight_kg: null,
      target_reps: null,
      target_distance_km: 5,
      target_pace_seconds_per_km: 300,
    },
  ]);

  await withTestApp(database, async (baseUrl) => {
    const headers = {
      "content-type": "application/json",
      "x-test-user-id": "user-b",
    };
    const updated = await fetch(`${baseUrl}/api/goals/goal-a`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        goal_type: "run",
        target_distance_km: 10,
        target_pace_seconds_per_km: 300,
      }),
    });
    assert.equal(updated.status, 404);

    const deleted = await fetch(`${baseUrl}/api/goals/goal-a`, {
      method: "DELETE",
      headers,
    });
    assert.equal(deleted.status, 404);
    assert.equal(database["goals"][0].user_id, "user-a");
  });
});
