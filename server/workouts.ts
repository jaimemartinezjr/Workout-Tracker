import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
};

type SqlClient = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
  release: () => void;
};

export type WorkoutDatabase = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
  connect: () => Promise<SqlClient>;
};

type UserIdResolver = (request: Request) => string | null;
type ActivityType = "strength" | "run";

type LiftingSetInput = {
  exercise_name: string;
  set_number: number;
  weight_kg: number;
  reps: number;
};

type RunDetailsInput = {
  distance_km: number;
  pace_seconds_per_km: number;
  calories: number | null;
};

type WorkoutInput = {
  title: string;
  activity_type: ActivityType;
  performed_on: string;
  notes: string | null;
  sets?: LiftingSetInput[];
  runDetails?: RunDetailsInput;
};

export type ValidationResult =
  | { ok: true; value: WorkoutInput }
  | { ok: false; error: string };

export function validateWorkout(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Enter the workout details before saving." };
  }

  const input = body as Record<string, unknown>;
  const activityType = input.activity_type;
  if (activityType !== "strength" && activityType !== "run") {
    return { ok: false, error: "Choose strength or running for this workout." };
  }

  if (input.title != null && typeof input.title !== "string") {
    return { ok: false, error: "Enter a valid session name." };
  }
  const enteredTitle =
    typeof input.title === "string" ? input.title.trim() : "";
  if (enteredTitle.length > 120) {
    return {
      ok: false,
      error: "Session names must be 120 characters or fewer.",
    };
  }
  const title =
    enteredTitle ||
    (activityType === "strength" ? "Strength session" : "Run session");

  const performedOn =
    typeof input.performed_on === "string" ? input.performed_on : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(performedOn)) {
    return {
      ok: false,
      error: "Choose the date you completed this workout.",
    };
  }
  const parsedDate = new Date(`${performedOn}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedDate.valueOf()) ||
    parsedDate.toISOString().slice(0, 10) !== performedOn
  ) {
    return { ok: false, error: "Enter a valid workout date." };
  }

  const notes =
    typeof input.notes === "string" ? input.notes.trim() || null : null;
  if (notes && notes.length > 2000) {
    return { ok: false, error: "Notes must be 2,000 characters or fewer." };
  }

  if (activityType === "strength") {
    if (!Array.isArray(input.sets) || input.sets.length === 0) {
      return { ok: false, error: "Add at least one lifting set." };
    }

    const sets: LiftingSetInput[] = [];
    for (const item of input.sets) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { ok: false, error: "Check each lifting set and try again." };
      }

      const set = item as Record<string, unknown>;
      const exerciseName =
        typeof set.exercise_name === "string" ? set.exercise_name.trim() : "";
      if (!exerciseName || exerciseName.length > 120) {
        return { ok: false, error: "Enter an exercise name for every set." };
      }
      if (!Number.isInteger(set.set_number) || Number(set.set_number) < 1) {
        return {
          ok: false,
          error: "Set numbers must be whole numbers greater than zero.",
        };
      }
      if (
        typeof set.weight_kg !== "number" ||
        !Number.isFinite(set.weight_kg) ||
        set.weight_kg < 0
      ) {
        return { ok: false, error: "Enter a valid weight of zero or more." };
      }
      if (!Number.isInteger(set.reps) || Number(set.reps) < 1) {
        return {
          ok: false,
          error: "Reps must be a whole number greater than zero.",
        };
      }

      sets.push({
        exercise_name: exerciseName,
        set_number: Number(set.set_number),
        weight_kg: set.weight_kg,
        reps: Number(set.reps),
      });
    }

    return {
      ok: true,
      value: {
        title,
        activity_type: activityType,
        performed_on: performedOn,
        notes,
        sets,
      },
    };
  }

  if (!input.runDetails || typeof input.runDetails !== "object") {
    return {
      ok: false,
      error: "Enter distance and pace for this run.",
    };
  }

  const runDetails = input.runDetails as Record<string, unknown>;
  if (
    typeof runDetails.distance_km !== "number" ||
    !Number.isFinite(runDetails.distance_km) ||
    runDetails.distance_km <= 0
  ) {
    return { ok: false, error: "Enter a distance greater than zero." };
  }
  if (
    !Number.isInteger(runDetails.pace_seconds_per_km) ||
    Number(runDetails.pace_seconds_per_km) <= 0
  ) {
    return {
      ok: false,
      error: "Enter a valid pace greater than zero seconds per kilometer.",
    };
  }
  const rawCalories = runDetails.calories;
  const calories = rawCalories == null ? null : rawCalories;
  if (
    calories !== null &&
    (typeof calories !== "number" ||
      !Number.isInteger(calories) ||
      calories < 0)
  ) {
    return {
      ok: false,
      error: "Enter a valid calorie count of zero or more.",
    };
  }

  return {
    ok: true,
    value: {
      title,
      activity_type: activityType,
      performed_on: performedOn,
      notes,
      runDetails: {
        distance_km: runDetails.distance_km,
        pace_seconds_per_km: Number(runDetails.pace_seconds_per_km),
        calories,
      },
    },
  };
}

function respondUnauthenticated(response: Response) {
  response.status(401).json({ error: "Sign in to manage your workouts." });
}

function respondNotFound(response: Response) {
  response.status(404).json({ error: "Workout not found." });
}

async function insertChildren(
  client: SqlClient,
  workoutId: string,
  userId: string,
  workout: WorkoutInput,
) {
  if (workout.activity_type === "strength") {
    for (const set of workout.sets ?? []) {
      await client.query(
        `INSERT INTO lifting_sets
          (id, workout_id, exercise_name, set_number, weight_kg, reps)
         SELECT $1, w.id, $3, $4, $5, $6
         FROM workouts w
         WHERE w.id = $2 AND w.user_id = $7 AND w.activity_type = 'strength'`,
        [
          randomUUID(),
          workoutId,
          set.exercise_name,
          set.set_number,
          set.weight_kg,
          set.reps,
          userId,
        ],
      );
    }
    return;
  }

  const run = workout.runDetails;
  if (!run) {
    throw new Error("Validated run details are missing.");
  }
  await client.query(
    `INSERT INTO run_details
      (workout_id, distance_km, pace_seconds_per_km, calories)
     SELECT w.id, $3, $4, $5
     FROM workouts w
     WHERE w.id = $1 AND w.user_id = $2 AND w.activity_type = 'run'`,
    [
      workoutId,
      userId,
      run.distance_km,
      run.pace_seconds_per_km,
      run.calories,
    ],
  );
}

async function loadWorkoutDetail(
  database: Pick<WorkoutDatabase, "query">,
  workoutId: string,
  userId: string,
) {
  const workoutResult = await database.query(
    `SELECT id, title, activity_type, performed_on, notes, created_at
     FROM workouts
     WHERE id = $1 AND user_id = $2`,
    [workoutId, userId],
  );
  const workout = workoutResult.rows[0];
  if (!workout) {
    return null;
  }

  if (workout.activity_type === "strength") {
    const setsResult = await database.query(
      `SELECT ls.id, ls.exercise_name, ls.set_number, ls.weight_kg, ls.reps
       FROM lifting_sets ls
       JOIN workouts w ON w.id = ls.workout_id
       WHERE ls.workout_id = $1 AND w.user_id = $2
       ORDER BY ls.exercise_name, ls.set_number`,
      [workoutId, userId],
    );
    return { workout, sets: setsResult.rows, runDetails: null };
  }

  const runResult = await database.query(
    `SELECT rd.distance_km, rd.pace_seconds_per_km, rd.calories
     FROM run_details rd
     JOIN workouts w ON w.id = rd.workout_id
     WHERE rd.workout_id = $1 AND w.user_id = $2`,
    [workoutId, userId],
  );
  return {
    workout,
    sets: [],
    runDetails: runResult.rows[0] ?? null,
  };
}

async function connectForWrite(
  database: WorkoutDatabase,
  response: Response,
  action: "save" | "update" | "delete",
) {
  try {
    return await database.connect();
  } catch (error) {
    console.error(`Could not connect to save a workout ${action}.`, error);
    response.status(500).json({
      error: `We couldn't ${action} this workout. Please try again.`,
    });
    return null;
  }
}

export function createWorkoutsRouter(
  database: WorkoutDatabase,
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
        `SELECT w.id, w.title, w.activity_type, w.performed_on, w.notes, w.created_at,
                COALESCE(
                  (SELECT ARRAY_AGG(DISTINCT ls.exercise_name ORDER BY ls.exercise_name)
                   FROM lifting_sets ls
                   WHERE ls.workout_id = w.id),
                  ARRAY[]::text[]
                ) AS exercise_names,
                (SELECT MAX(ls.weight_kg)
                 FROM lifting_sets ls
                 WHERE ls.workout_id = w.id) AS max_weight_kg,
                (SELECT MIN(ls.weight_kg)
                 FROM lifting_sets ls
                 WHERE ls.workout_id = w.id) AS min_weight_kg,
                (SELECT rd.distance_km
                 FROM run_details rd
                 WHERE rd.workout_id = w.id) AS distance_km
         FROM workouts w
         WHERE w.user_id = $1
         ORDER BY w.performed_on DESC, w.created_at DESC`,
        [userId],
      );
      response.json({
        workouts: result.rows.map((row) => ({
          ...row,
          exercise_names: Array.isArray(row.exercise_names)
            ? row.exercise_names.map(String)
            : [],
          max_weight_kg:
            row.max_weight_kg == null ? null : Number(row.max_weight_kg),
          min_weight_kg:
            row.min_weight_kg == null ? null : Number(row.min_weight_kg),
          distance_km: row.distance_km == null ? null : Number(row.distance_km),
        })),
      });
    } catch (error) {
      console.error("Could not load workouts.", error);
      response.status(500).json({
        error: "We couldn't load your workouts. Please try again.",
      });
    }
  });

  router.post("/", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    const validation = validateWorkout(request.body);
    if (!validation.ok) {
      response.status(400).json({ error: validation.error });
      return;
    }

    const workoutId = randomUUID();
    const client = await connectForWrite(database, response, "save");
    if (!client) {
      return;
    }
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO workouts
          (id, user_id, title, activity_type, performed_on, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, title, activity_type, performed_on, notes, created_at`,
        [
          workoutId,
          userId,
          validation.value.title,
          validation.value.activity_type,
          validation.value.performed_on,
          validation.value.notes,
        ],
      );
      await insertChildren(client, workoutId, userId, validation.value);
      const detail = await loadWorkoutDetail(client, workoutId, userId);
      if (!detail) {
        throw new Error("The saved workout could not be read in its transaction.");
      }
      await client.query("COMMIT");
      response.status(201).json(detail);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("Could not save workout.", error);
      response.status(500).json({
        error: "We couldn't save your workout. Please try again.",
      });
    } finally {
      client.release();
    }
  });

  router.get("/:id", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    try {
      const detail = await loadWorkoutDetail(database, request.params.id, userId);
      if (!detail) {
        respondNotFound(response);
        return;
      }
      response.json(detail);
    } catch (error) {
      console.error("Could not load workout details.", error);
      response.status(500).json({
        error: "We couldn't load this workout. Please try again.",
      });
    }
  });

  router.put("/:id", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    const validation = validateWorkout(request.body);
    if (!validation.ok) {
      response.status(400).json({ error: validation.error });
      return;
    }

    const client = await connectForWrite(database, response, "update");
    if (!client) {
      return;
    }
    try {
      await client.query("BEGIN");
      const ownedWorkout = await client.query(
        `SELECT id FROM workouts
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [request.params.id, userId],
      );
      if (ownedWorkout.rows.length === 0) {
        await client.query("ROLLBACK");
        respondNotFound(response);
        return;
      }

      await client.query(
        `UPDATE workouts
         SET title = $3, activity_type = $4, performed_on = $5, notes = $6
         WHERE id = $1 AND user_id = $2`,
        [
          request.params.id,
          userId,
          validation.value.title,
          validation.value.activity_type,
          validation.value.performed_on,
          validation.value.notes,
        ],
      );
      await client.query(
        `DELETE FROM lifting_sets ls
         WHERE ls.workout_id = $1
           AND EXISTS (
             SELECT 1 FROM workouts w
             WHERE w.id = ls.workout_id AND w.user_id = $2
           )`,
        [request.params.id, userId],
      );
      await client.query(
        `DELETE FROM run_details rd
         WHERE rd.workout_id = $1
           AND EXISTS (
             SELECT 1 FROM workouts w
             WHERE w.id = rd.workout_id AND w.user_id = $2
           )`,
        [request.params.id, userId],
      );
      await insertChildren(
        client,
        request.params.id,
        userId,
        validation.value,
      );
      const detail = await loadWorkoutDetail(
        client,
        request.params.id,
        userId,
      );
      if (!detail) {
        throw new Error("The updated workout could not be read in its transaction.");
      }
      await client.query("COMMIT");
      response.json(detail);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("Could not update workout.", error);
      response.status(500).json({
        error: "We couldn't update your workout. Please try again.",
      });
    } finally {
      client.release();
    }
  });

  router.delete("/:id", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    const client = await connectForWrite(database, response, "delete");
    if (!client) {
      return;
    }
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `DELETE FROM workouts
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [request.params.id, userId],
      );
      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        respondNotFound(response);
        return;
      }
      await client.query("COMMIT");
      response.status(204).end();
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("Could not delete workout.", error);
      response.status(500).json({
        error: "We couldn't delete this workout. Please try again.",
      });
    } finally {
      client.release();
    }
  });

  return router;
}
