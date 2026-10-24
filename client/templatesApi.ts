import type { ActivityType } from "./workoutsApi";

export type TemplateItem = {
  id: string;
  position: number;
  exercise_name: string | null;
  planned_sets: number | null;
  planned_reps: number | null;
  planned_weight_kg: number | null;
  planned_distance_km: number | null;
  planned_pace_seconds_per_km: number | null;
};

export type WorkoutTemplate = {
  id: string;
  name: string;
  activity_type: ActivityType;
  created_at: string;
  items: TemplateItem[];
};

export type TemplateInput =
  | {
      name: string;
      activity_type: "strength";
      items: Array<{
        exercise_name: string;
        planned_sets: number;
        planned_reps: number;
        planned_weight_kg: number;
      }>;
    }
  | {
      name: string;
      activity_type: "run";
      items: [{
        planned_distance_km: number;
        planned_pace_seconds_per_km: number;
      }];
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

export async function listTemplates(getToken: GetToken): Promise<WorkoutTemplate[]> {
  const result = await request<{ templates: WorkoutTemplate[] }>(
    getToken,
    "/api/templates",
  );
  return result.templates;
}

export async function createTemplate(
  getToken: GetToken,
  template: TemplateInput,
): Promise<WorkoutTemplate> {
  const result = await request<{ template: WorkoutTemplate }>(
    getToken,
    "/api/templates",
    { method: "POST", body: JSON.stringify(template) },
  );
  return result.template;
}

export function deleteTemplate(getToken: GetToken, id: string): Promise<void> {
  return request(
    getToken,
    `/api/templates/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
