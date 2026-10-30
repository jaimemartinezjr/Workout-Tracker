import { Router, type Request, type Response } from "express";

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
};

export type ProgressDatabase = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
};

type UserIdResolver = (request: Request) => string | null;

function normalizeCalendarDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const valueText = String(value);
  const isoDate = valueText.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return isoDate ?? valueText.slice(0, 10);
}

function normalizeProgressPoint(row: Record<string, unknown>) {
  return {
    goal_id: String(row.goal_id),
    workout_id: String(row.workout_id),
    performed_on: normalizeCalendarDate(row.performed_on),
    weight_kg: row.weight_kg == null ? null : Number(row.weight_kg),
    reps: row.reps == null ? null : Number(row.reps),
    distance_km: row.distance_km == null ? null : Number(row.distance_km),
    pace_seconds_per_km:
      row.pace_seconds_per_km == null
        ? null
        : Number(row.pace_seconds_per_km),
  };
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeLiftHistoryPoint(row: Record<string, unknown>) {
  return {
    workout_id: String(row.workout_id),
    performed_on: normalizeCalendarDate(row.performed_on),
    exercise_name: String(row.exercise_name ?? ""),
    weight_kg: Number(row.weight_kg),
    reps: Number(row.reps),
    set_number: Number(row.set_number),
  };
}

function normalizeRunHistoryPoint(row: Record<string, unknown>) {
  return {
    workout_id: String(row.workout_id),
    performed_on: normalizeCalendarDate(row.performed_on),
    distance_km: Number(row.distance_km),
    pace_seconds_per_km: Number(row.pace_seconds_per_km),
  };
}

function respondUnauthenticated(response: Response) {
  response.status(401).json({ error: "Sign in to view your progress." });
}

export function createProgressRouter(
  database: ProgressDatabase,
  resolveUserId: UserIdResolver,
) {
  const router = Router();

  router.get("/overview", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    const weekStart = request.query.weekStart;
    if (!isCalendarDate(weekStart)) {
      response.status(400).json({ error: "Choose a valid week start date." });
      return;
    }

    try {
      const [statsResult, liftResult, runResult] = await Promise.all([
        database.query(
          `SELECT
             (SELECT COUNT(*)
              FROM public.workouts week_workout
              WHERE week_workout.user_id = $1
                AND week_workout.performed_on >= $2::date
                AND week_workout.performed_on < ($2::date + INTERVAL '7 days')
             ) AS workouts_this_week,
             heaviest.exercise_name AS heaviest_exercise_name,
             heaviest.weight_kg AS heaviest_weight_kg,
             heaviest.reps AS heaviest_reps,
             heaviest.performed_on AS heaviest_performed_on,
             longest.distance_km AS longest_run_distance_km,
             longest.performed_on AS longest_run_performed_on
           FROM (VALUES (1)) AS anchor(value)
           LEFT JOIN LATERAL (
             SELECT ls.exercise_name, ls.weight_kg, ls.reps,
                    w.performed_on::text AS performed_on
             FROM public.workouts w
             JOIN public.lifting_sets ls ON ls.workout_id = w.id
             WHERE w.user_id = $1
               AND w.activity_type = 'strength'
             ORDER BY ls.weight_kg DESC, ls.reps DESC, w.performed_on DESC, w.id ASC
             LIMIT 1
           ) heaviest ON TRUE
           LEFT JOIN LATERAL (
             SELECT rd.distance_km, w.performed_on::text AS performed_on
             FROM public.workouts w
             JOIN public.run_details rd ON rd.workout_id = w.id
             WHERE w.user_id = $1
               AND w.activity_type = 'run'
             ORDER BY rd.distance_km DESC, w.performed_on DESC, w.id ASC
             LIMIT 1
           ) longest ON TRUE`,
          [userId, weekStart],
        ),
        database.query(
          `SELECT w.id AS workout_id, w.performed_on::text AS performed_on,
                  ls.exercise_name, ls.weight_kg, ls.reps, ls.set_number
           FROM public.workouts w
           JOIN public.lifting_sets ls ON ls.workout_id = w.id
           WHERE w.user_id = $1
             AND w.activity_type = 'strength'
           ORDER BY w.performed_on, w.id, lower(btrim(ls.exercise_name)), ls.set_number`,
          [userId],
        ),
        database.query(
          `SELECT w.id AS workout_id, w.performed_on::text AS performed_on,
                  rd.distance_km, rd.pace_seconds_per_km
           FROM public.workouts w
           JOIN public.run_details rd ON rd.workout_id = w.id
           WHERE w.user_id = $1
             AND w.activity_type = 'run'
           ORDER BY w.performed_on, w.id`,
          [userId],
        ),
      ]);

      const stats = statsResult.rows[0] ?? {};
      response.json({
        stats: {
          workouts_this_week: Number(stats.workouts_this_week ?? 0),
          heaviest_set:
            stats.heaviest_weight_kg == null
              ? null
              : {
                  exercise_name: String(stats.heaviest_exercise_name ?? ""),
                  weight_kg: Number(stats.heaviest_weight_kg),
                  reps: Number(stats.heaviest_reps),
                  performed_on: normalizeCalendarDate(stats.heaviest_performed_on),
                },
          longest_run:
            stats.longest_run_distance_km == null
              ? null
              : {
                  distance_km: Number(stats.longest_run_distance_km),
                  performed_on: normalizeCalendarDate(stats.longest_run_performed_on),
                },
        },
        lift_points: liftResult.rows.map(normalizeLiftHistoryPoint),
        run_points: runResult.rows.map(normalizeRunHistoryPoint),
      });
    } catch (error) {
      console.error("Could not load the training overview.", error);
      response.status(500).json({
        error: "We couldn't load your training overview. Please try again.",
      });
    }
  });

  router.get("/", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    try {
      const result = await database.query(
        `SELECT g.id AS goal_id, w.id AS workout_id, w.performed_on::text AS performed_on,
                best_set.weight_kg, best_set.reps,
                NULL::NUMERIC AS distance_km,
                NULL::INTEGER AS pace_seconds_per_km
         FROM public.goals g
         JOIN public.workouts w
           ON w.user_id = g.user_id
          AND w.activity_type = 'strength'
         JOIN LATERAL (
           SELECT ls.weight_kg, ls.reps
           FROM public.lifting_sets ls
           WHERE ls.workout_id = w.id
             AND lower(btrim(ls.exercise_name)) = lower(btrim(g.exercise_name))
           ORDER BY ls.weight_kg DESC, ls.reps DESC, ls.set_number ASC
           LIMIT 1
         ) best_set ON TRUE
         WHERE g.user_id = $1
           AND g.goal_type = 'strength'

         UNION ALL

         SELECT g.id AS goal_id, w.id AS workout_id, w.performed_on::text AS performed_on,
                NULL::NUMERIC AS weight_kg,
                NULL::INTEGER AS reps,
                rd.distance_km,
                rd.pace_seconds_per_km
         FROM public.goals g
         JOIN public.workouts w
           ON w.user_id = g.user_id
          AND w.activity_type = 'run'
         JOIN public.run_details rd ON rd.workout_id = w.id
         WHERE g.user_id = $1
           AND g.goal_type = 'run'
         ORDER BY goal_id, performed_on, workout_id`,
        [userId],
      );
      response.json({ points: result.rows.map(normalizeProgressPoint) });
    } catch (error) {
      console.error("Could not load training progress.", error);
      response.status(500).json({
        error: "We couldn't load your progress. Please try again.",
      });
    }
  });

  return router;
}
