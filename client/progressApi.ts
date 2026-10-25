export type ProgressPoint = {
  goal_id: string;
  workout_id: string;
  performed_on: string;
  weight_kg: number | null;
  reps: number | null;
  distance_km: number | null;
  pace_seconds_per_km: number | null;
};

export type LiftHistoryPoint = {
  workout_id: string;
  performed_on: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  set_number: number;
};

export type RunHistoryPoint = {
  workout_id: string;
  performed_on: string;
  distance_km: number;
  pace_seconds_per_km: number;
};

export type ProgressOverview = {
  stats: {
    workouts_this_week: number;
    heaviest_set: {
      exercise_name: string;
      weight_kg: number;
      reps: number;
      performed_on: string;
    } | null;
    longest_run: {
      distance_km: number;
      performed_on: string;
    } | null;
  };
  lift_points: LiftHistoryPoint[];
  run_points: RunHistoryPoint[];
};

type GetToken = () => Promise<string | null>;

export async function listProgress(getToken: GetToken): Promise<ProgressPoint[]> {
  const token = await getToken();
  const response = await fetch("/api/progress", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const payload = (await response.json()) as {
    points?: ProgressPoint[];
    error?: string;
  };
  if (!response.ok || !payload.points) {
    throw new Error(payload.error ?? "We couldn't load your progress. Please try again.");
  }
  return payload.points;
}

export async function getProgressOverview(
  getToken: GetToken,
  weekStart: string,
): Promise<ProgressOverview> {
  const token = await getToken();
  const params = new URLSearchParams({ weekStart });
  const response = await fetch(`/api/progress/overview?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const payload = (await response.json()) as ProgressOverview & {
    error?: string;
  };
  if (
    !response.ok ||
    !payload.stats ||
    !payload.lift_points ||
    !payload.run_points
  ) {
    throw new Error(payload.error ?? "We couldn't load your training overview. Please try again.");
  }
  return payload;
}
