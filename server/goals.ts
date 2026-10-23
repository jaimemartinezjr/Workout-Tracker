import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
};

export type GoalsDatabase = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
};

type UserIdResolver = (request: Request) => string | null;
type StrengthGoalInput = {
  goal_type: "strength";
  exercise_name: string;
  target_weight_kg: number;
  target_reps: number;
};
type RunGoalInput = {
  goal_type: "run";
  target_distance_km: number;
  target_pace_seconds_per_km: number;
};
type GoalInput = StrengthGoalInput | RunGoalInput;
type ValidationResult =
  | { ok: true; value: GoalInput }
  | { ok: false; error: string };

const goalColumns = `id, goal_type, exercise_name, target_weight_kg, target_reps,
  target_distance_km, target_pace_seconds_per_km`;

function validateGoal(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Enter the goal details before saving." };
  }

  const input = body as Record<string, unknown>;
  if (input.goal_type === "strength") {
    const exerciseName =
      typeof input.exercise_name === "string" ? input.exercise_name.trim() : "";
    if (!exerciseName || exerciseName.length > 120) {
      return { ok: false, error: "Enter an exercise name up to 120 characters." };
    }
    if (
      typeof input.target_weight_kg !== "number" ||
      !Number.isFinite(input.target_weight_kg) ||
      input.target_weight_kg < 0 ||
      input.target_weight_kg > 99999.999
    ) {
      return { ok: false, error: "Enter a target weight of zero or more." };
    }
    if (
      !Number.isInteger(input.target_reps) ||
      Number(input.target_reps) < 1 ||
      Number(input.target_reps) > 10000
    ) {
      return {
        ok: false,
        error: "Enter a whole number of target reps from 1 to 10,000.",
      };
    }
    return {
      ok: true,
      value: {
        goal_type: "strength",
        exercise_name: exerciseName,
        target_weight_kg: input.target_weight_kg,
        target_reps: Number(input.target_reps),
      },
    };
  }

  if (input.goal_type === "run") {
    if (
      typeof input.target_distance_km !== "number" ||
      !Number.isFinite(input.target_distance_km) ||
      input.target_distance_km <= 0 ||
      input.target_distance_km > 99999.999
    ) {
      return { ok: false, error: "Enter a target distance greater than zero." };
    }
    if (
      !Number.isInteger(input.target_pace_seconds_per_km) ||
      Number(input.target_pace_seconds_per_km) < 1 ||
      Number(input.target_pace_seconds_per_km) > 360000
    ) {
      return {
        ok: false,
        error: "Enter a whole-number target pace greater than zero.",
      };
    }
    return {
      ok: true,
      value: {
        goal_type: "run",
        target_distance_km: input.target_distance_km,
        target_pace_seconds_per_km: Number(input.target_pace_seconds_per_km),
      },
    };
  }

  return { ok: false, error: "Choose a lifting or running goal." };
}

function normalizeGoal(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    goal_type: row.goal_type,
    exercise_name: row.exercise_name == null ? null : String(row.exercise_name),
    target_weight_kg:
      row.target_weight_kg == null ? null : Number(row.target_weight_kg),
    target_reps: row.target_reps == null ? null : Number(row.target_reps),
    target_distance_km:
      row.target_distance_km == null ? null : Number(row.target_distance_km),
    target_pace_seconds_per_km:
      row.target_pace_seconds_per_km == null
        ? null
        : Number(row.target_pace_seconds_per_km),
  };
}

function respondUnauthenticated(response: Response) {
  response.status(401).json({ error: "Sign in to manage your goals." });
}

function respondNotFound(response: Response) {
  response.status(404).json({ error: "Goal not found." });
}

function goalValues(input: GoalInput) {
  if (input.goal_type === "strength") {
    return [
      input.goal_type,
      input.exercise_name,
      input.target_weight_kg,
      input.target_reps,
      null,
      null,
    ];
  }
  return [
    input.goal_type,
    null,
    null,
    null,
    input.target_distance_km,
    input.target_pace_seconds_per_km,
  ];
}

export function createGoalsRouter(
  database: GoalsDatabase,
  resolveUserId: UserIdResolver,
) {
  const router = Router();

  router.get("/", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    try {
      const result = await database.query(
        `SELECT ${goalColumns}
         FROM public.goals
         WHERE user_id = $1
         ORDER BY created_at DESC, id`,
        [userId],
      );
      response.json({ goals: result.rows.map(normalizeGoal) });
    } catch (error) {
      console.error("Could not load goals.", error);
      response.status(500).json({
        error: "We couldn't load your goals. Please try again.",
      });
    }
  });

  router.post("/", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    const validation = validateGoal(request.body);
    if (!validation.ok) {
      response.status(400).json({ error: validation.error });
      return;
    }

    const values = goalValues(validation.value);
    try {
      const result = await database.query(
        `INSERT INTO public.goals
          (id, user_id, goal_type, exercise_name, target_weight_kg, target_reps,
           target_distance_km, target_pace_seconds_per_km)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${goalColumns}`,
        [randomUUID(), userId, ...values],
      );
      response.status(201).json({ goal: normalizeGoal(result.rows[0]) });
    } catch (error) {
      console.error("Could not create goal.", error);
      response.status(500).json({
        error: "We couldn't save this goal. Please try again.",
      });
    }
  });

  router.put("/:id", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    const validation = validateGoal(request.body);
    if (!validation.ok) {
      response.status(400).json({ error: validation.error });
      return;
    }

    const resultValues = goalValues(validation.value);
    try {
      const result = await database.query(
        `UPDATE public.goals
         SET goal_type = $1, exercise_name = $2, target_weight_kg = $3,
             target_reps = $4, target_distance_km = $5,
             target_pace_seconds_per_km = $6, updated_at = NOW()
         WHERE id = $7 AND user_id = $8
         RETURNING ${goalColumns}`,
        [...resultValues, request.params.id, userId],
      );
      if (!result.rows[0]) {
        respondNotFound(response);
        return;
      }
      response.json({ goal: normalizeGoal(result.rows[0]) });
    } catch (error) {
      console.error("Could not update goal.", error);
      response.status(500).json({
        error: "We couldn't update this goal. Please try again.",
      });
    }
  });

  router.delete("/:id", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    try {
      const result = await database.query(
        `DELETE FROM public.goals
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [request.params.id, userId],
      );
      if (!result.rows[0]) {
        respondNotFound(response);
        return;
      }
      response.status(204).end();
    } catch (error) {
      console.error("Could not delete goal.", error);
      response.status(500).json({
        error: "We couldn't remove this goal. Please try again.",
      });
    }
  });

  return router;
}
