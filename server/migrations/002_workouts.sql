CREATE TABLE IF NOT EXISTS public.workouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  activity_type TEXT NOT NULL CHECK (activity_type IN ('strength', 'run')),
  performed_on DATE NOT NULL,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lifting_sets (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL CHECK (char_length(btrim(exercise_name)) BETWEEN 1 AND 120),
  set_number INTEGER NOT NULL CHECK (set_number > 0),
  weight_kg NUMERIC(8, 3) NOT NULL CHECK (weight_kg >= 0),
  reps INTEGER NOT NULL CHECK (reps > 0),
  UNIQUE (workout_id, exercise_name, set_number)
);

CREATE TABLE IF NOT EXISTS public.run_details (
  workout_id TEXT PRIMARY KEY REFERENCES public.workouts(id) ON DELETE CASCADE,
  distance_km NUMERIC(8, 3) NOT NULL CHECK (distance_km > 0),
  pace_seconds_per_km INTEGER NOT NULL CHECK (pace_seconds_per_km > 0),
  calories INTEGER NOT NULL CHECK (calories >= 0)
);

CREATE INDEX IF NOT EXISTS workouts_user_performed_on_idx
  ON public.workouts (user_id, performed_on DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS lifting_sets_workout_exercise_idx
  ON public.lifting_sets (workout_id, exercise_name, set_number);
