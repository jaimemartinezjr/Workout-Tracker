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
    try {
      await pool.query("SELECT 1 FROM public.templates LIMIT 0");
      await pool.query("SELECT 1 FROM public.template_items LIMIT 0");
      await pool.query("SELECT 1 FROM public.stars LIMIT 0");
    } catch {
      throw new Error(
        "Production database is missing workout template tables. Re-publish this app so Replit can sync the development schema.",
      );
    }
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
        "Production database is missing fractional goal pace support. Re-publish this app so Replit can sync the development schema.",
      );
    }
    const runCaloriesColumn = await pool.query(
      `SELECT is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'run_details'
         AND column_name = 'calories'`,
    );
    if (runCaloriesColumn.rows[0]?.is_nullable !== "YES") {
      throw new Error(
        "Production database does not yet support optional run calories. Re-publish this app so Replit can sync the development schema.",
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
  const templatesSchema = await readFile(
    new URL("./migrations/005_templates.sql", import.meta.url),
    "utf8",
  );
  await pool.query(templatesSchema);
  const starsSchema = await readFile(
    new URL("./migrations/006_stars.sql", import.meta.url),
    "utf8",
  );
  await pool.query(starsSchema);
  const optionalRunCaloriesSchema = await readFile(
    new URL("./migrations/007_optional_run_calories.sql", import.meta.url),
    "utf8",
  );
  await pool.query(optionalRunCaloriesSchema);
}
