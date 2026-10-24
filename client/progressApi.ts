export type ProgressPoint = {
  goal_id: string;
  workout_id: string;
  performed_on: string;
  weight_kg: number | null;
  reps: number | null;
  distance_km: number | null;
  pace_seconds_per_km: number | null;
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
