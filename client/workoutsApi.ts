export type ActivityType = "strength" | "run";

export type Workout = {
  id: string;
  title: string;
  activity_type: ActivityType;
  performed_on: string;
  notes: string | null;
  created_at: string;
};

export type WorkoutListItem = Workout & {
  exercise_names: string[];
  max_weight_kg: number | null;
  distance_km: number | null;
};

export type LiftingSet = {
  id?: string;
  exercise_name: string;
  set_number: number;
  weight_kg: number;
  reps: number;
};

export type RunDetails = {
  distance_km: number;
  pace_seconds_per_km: number;
  calories: number;
};

export type WorkoutDetail = {
  workout: Workout;
  sets: LiftingSet[];
  runDetails: RunDetails | null;
};

export type WorkoutInput = {
  title: string;
  activity_type: ActivityType;
  performed_on: string;
  notes: string;
  sets?: LiftingSet[];
  runDetails?: RunDetails;
};

type GetToken = () => Promise<string | null>;

async function request<T>(
  getToken: GetToken,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(
      (payload as { error?: string } | null)?.error ??
        "We couldn't complete that request. Please try again.",
    );
  }
  return payload as T;
}

export async function listWorkouts(
  getToken: GetToken,
): Promise<WorkoutListItem[]> {
  const result = await request<{ workouts: WorkoutListItem[] }>(
    getToken,
    "/api/workouts",
  );
  return result.workouts;
}

export function getWorkout(
  getToken: GetToken,
  id: string,
): Promise<WorkoutDetail> {
  return request(getToken, `/api/workouts/${encodeURIComponent(id)}`);
}

export function saveWorkout(
  getToken: GetToken,
  id: string | undefined,
  workout: WorkoutInput,
): Promise<WorkoutDetail> {
  return request(getToken, id ? `/api/workouts/${encodeURIComponent(id)}` : "/api/workouts", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(workout),
  });
}

export function deleteWorkout(
  getToken: GetToken,
  id: string,
): Promise<void> {
  return request(
    getToken,
    `/api/workouts/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
