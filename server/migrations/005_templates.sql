CREATE TABLE IF NOT EXISTS public.templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  activity_type TEXT NOT NULL CHECK (activity_type IN ('strength', 'run')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.template_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  exercise_name TEXT,
  planned_sets INTEGER,
  planned_reps INTEGER,
  planned_weight_kg NUMERIC(8, 3),
  planned_distance_km NUMERIC(8, 3),
  planned_pace_seconds_per_km INTEGER,
  UNIQUE (template_id, position),
  CHECK (
    (
      exercise_name IS NOT NULL
      AND char_length(btrim(exercise_name)) BETWEEN 1 AND 120
      AND planned_sets IS NOT NULL AND planned_sets BETWEEN 1 AND 100
      AND planned_reps IS NOT NULL AND planned_reps BETWEEN 1 AND 10000
      AND planned_weight_kg IS NOT NULL AND planned_weight_kg >= 0
      AND planned_distance_km IS NULL
      AND planned_pace_seconds_per_km IS NULL
    )
    OR
    (
      exercise_name IS NULL
      AND planned_sets IS NULL
      AND planned_reps IS NULL
      AND planned_weight_kg IS NULL
      AND planned_distance_km IS NOT NULL AND planned_distance_km > 0
      AND planned_pace_seconds_per_km IS NOT NULL AND planned_pace_seconds_per_km > 0
    )
  )
);

CREATE INDEX IF NOT EXISTS templates_user_created_at_idx
  ON public.templates (user_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS template_items_template_position_idx
  ON public.template_items (template_id, position);
