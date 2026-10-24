import { Router, type Request, type Response } from "express";

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
};

export type ProgressDatabase = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
};

type UserIdResolver = (request: Request) => string | null;

function normalizeProgressPoint(row: Record<string, unknown>) {
  return {
    goal_id: String(row.goal_id),
    workout_id: String(row.workout_id),
    performed_on: String(row.performed_on).slice(0, 10),
    weight_kg: row.weight_kg == null ? null : Number(row.weight_kg),
    reps: row.reps == null ? null : Number(row.reps),
    distance_km: row.distance_km == null ? null : Number(row.distance_km),
    pace_seconds_per_km:
      row.pace_seconds_per_km == null
        ? null
        : Number(row.pace_seconds_per_km),
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

  router.get("/", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    try {
      const result = await database.query(
        `SELECT g.id AS goal_id, w.id AS workout_id, w.performed_on,
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

         SELECT g.id AS goal_id, w.id AS workout_id, w.performed_on,
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
