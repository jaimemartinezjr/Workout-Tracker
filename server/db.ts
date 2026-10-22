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
}
