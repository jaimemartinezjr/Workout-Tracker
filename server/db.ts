import { readFile } from "node:fs/promises";
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initializeDatabase() {
  await pool.query("SELECT 1");

  if (process.env.NODE_ENV === "production") {
    await pool.query("SELECT 1 FROM public.users LIMIT 0");
    await pool.query("SELECT 1 FROM public.workouts LIMIT 0");
    await pool.query("SELECT 1 FROM public.lifting_sets LIMIT 0");
    await pool.query("SELECT 1 FROM public.run_details LIMIT 0");
    await pool.query("SELECT 1 FROM public.goals LIMIT 0");
    const paceColumn = await pool.query(
      `SELECT data_type, numeric_scale
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'goals'
         AND column_name = 'target_pace_seconds_per_km'`,
    );
    if (
      paceColumn.rows[0]?.data_type !== "numeric" ||
      Number(paceColumn.rows[0]?.numeric_scale) < 4
    ) {
      throw new Error(
        "Production database is missing fractional goal pace support. Apply server/migrations/004_goals_fractional_pace.sql before starting this release.",
      );
    }
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      weight_unit TEXT NOT NULL DEFAULT 'kg'
        CHECK (weight_unit IN ('kg', 'lb')),
      distance_unit TEXT NOT NULL DEFAULT 'km'
        CHECK (distance_unit IN ('km', 'mi')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const workoutSchema = await readFile(
    new URL("./migrations/002_workouts.sql", import.meta.url),
    "utf8",
  );
  await pool.query(workoutSchema);
  const goalSchema = await readFile(
    new URL("./migrations/003_goals.sql", import.meta.url),
    "utf8",
  );
  await pool.query(goalSchema);
  const fractionalPaceSchema = await readFile(
    new URL("./migrations/004_goals_fractional_pace.sql", import.meta.url),
    "utf8",
  );
  await pool.query(fractionalPaceSchema);
}
