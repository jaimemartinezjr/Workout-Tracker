DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'goals'
      AND column_name = 'target_pace_seconds_per_km'
      AND (data_type <> 'numeric' OR numeric_scale < 4)
  ) THEN
    ALTER TABLE public.goals
      ALTER COLUMN target_pace_seconds_per_km
      TYPE NUMERIC(10, 4)
      USING target_pace_seconds_per_km::NUMERIC(10, 4);
  END IF;
END
$migration$;
