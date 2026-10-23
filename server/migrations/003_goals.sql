CREATE TABLE IF NOT EXISTS public.goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('strength', 'run')),
  exercise_name TEXT,
  target_weight_kg NUMERIC(8, 3),
  target_reps INTEGER,
  target_distance_km NUMERIC(8, 3),
  target_pace_seconds_per_km NUMERIC(10, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (
      goal_type = 'strength'
      AND exercise_name IS NOT NULL
      AND char_length(btrim(exercise_name)) BETWEEN 1 AND 120
      AND target_weight_kg IS NOT NULL
      AND target_weight_kg >= 0
      AND target_reps IS NOT NULL
      AND target_reps > 0
      AND target_distance_km IS NULL
      AND target_pace_seconds_per_km IS NULL
    )
    OR
    (
      goal_type = 'run'
      AND exercise_name IS NULL
      AND target_weight_kg IS NULL
      AND target_reps IS NULL
      AND target_distance_km IS NOT NULL
      AND target_distance_km > 0
      AND target_pace_seconds_per_km IS NOT NULL
      AND target_pace_seconds_per_km > 0
    )
  )
);

CREATE INDEX IF NOT EXISTS goals_user_created_at_idx
  ON public.goals (user_id, created_at DESC);
