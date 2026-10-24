export type GoalType = "strength" | "run";

export type Goal = {
  id: string;
  goal_type: GoalType;
  exercise_name: string | null;
  target_weight_kg: number | null;
  target_reps: number | null;
  target_distance_km: number | null;
  target_pace_seconds_per_km: number | null;
};

export type StrengthGoalInput = {
  goal_type: "strength";
  exercise_name: string;
  target_weight_kg: number;
  target_reps: number;
};

export type RunGoalInput = {
  goal_type: "run";
  target_distance_km: number;
  target_pace_seconds_per_km: number;
};

export type GoalInput = StrengthGoalInput | RunGoalInput;
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

export async function listGoals(getToken: GetToken): Promise<Goal[]> {
  const result = await request<{ goals: Goal[] }>(getToken, "/api/goals");
  return result.goals;
}

export function saveGoal(
  getToken: GetToken,
  id: string | undefined,
  goal: GoalInput,
): Promise<{ goal: Goal }> {
  const path = id ? `/api/goals/${encodeURIComponent(id)}` : "/api/goals";
  return request(getToken, path, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(goal),
  });
}

export function deleteGoal(getToken: GetToken, id: string): Promise<void> {
  return request(
    getToken,
    `/api/goals/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
