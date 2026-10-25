import type {
  LiftHistoryPoint,
  RunHistoryPoint,
} from "./progressApi";

export type ProgressTrendPoint = {
  workout_id: string;
  date: string;
  date_label: string;
  weight: number | null;
  reps: number | null;
  distance: number | null;
  pace: number | null;
};

const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;

function nameKey(name: string) {
  return name.trim().toLocaleLowerCase();
}

function dateLabel(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

export function localWeekStart(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const day = String(monday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLiftNames(points: LiftHistoryPoint[]) {
  const names = new Map<string, string>();
  for (const point of points) {
    const name = point.exercise_name.trim();
    const key = nameKey(name);
    if (key && !names.has(key)) names.set(key, name);
  }
  return [...names.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function liftTrendPoints(
  points: LiftHistoryPoint[],
  exerciseName: string,
  weightUnit: "kg" | "lb",
): ProgressTrendPoint[] {
  const selectedKey = nameKey(exerciseName);
  if (!selectedKey) return [];

  const bestSetByWorkout = new Map<string, LiftHistoryPoint>();
  for (const point of points) {
    if (nameKey(point.exercise_name) !== selectedKey) continue;
    const previous = bestSetByWorkout.get(point.workout_id);
    if (
      !previous ||
      point.weight_kg > previous.weight_kg ||
      (point.weight_kg === previous.weight_kg && point.reps > previous.reps) ||
      (
        point.weight_kg === previous.weight_kg &&
        point.reps === previous.reps &&
        point.set_number < previous.set_number
      )
    ) {
      bestSetByWorkout.set(point.workout_id, point);
    }
  }

  const weightMultiplier = weightUnit === "lb" ? 1 / KG_PER_LB : 1;
  return [...bestSetByWorkout.values()]
    .sort((left, right) =>
      left.performed_on.localeCompare(right.performed_on) ||
      left.workout_id.localeCompare(right.workout_id),
    )
    .map((point) => ({
      workout_id: point.workout_id,
      date: point.performed_on,
      date_label: dateLabel(point.performed_on),
      weight: round(point.weight_kg * weightMultiplier),
      reps: point.reps,
      distance: null,
      pace: null,
    }));
}

export function runTrendPoints(
  points: RunHistoryPoint[],
  distanceUnit: "km" | "mi",
): ProgressTrendPoint[] {
  const distanceMultiplier = distanceUnit === "mi" ? 1 / KM_PER_MI : 1;
  const paceMultiplier = distanceUnit === "mi" ? KM_PER_MI : 1;
  return [...points]
    .sort((left, right) =>
      left.performed_on.localeCompare(right.performed_on) ||
      left.workout_id.localeCompare(right.workout_id),
    )
    .map((point) => ({
      workout_id: point.workout_id,
      date: point.performed_on,
      date_label: dateLabel(point.performed_on),
      weight: null,
      reps: null,
      distance: round(point.distance_km * distanceMultiplier),
      pace: Math.round(point.pace_seconds_per_km * paceMultiplier),
    }));
}
