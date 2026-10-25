import type { ActivityType, WorkoutListItem } from "./workoutsApi";

export type WorkoutActivityFilter = "all" | ActivityType;
export type WorkoutSort =
  | "newest"
  | "oldest"
  | "farthest"
  | "shortest"
  | "highest-weight"
  | "lowest-weight";

export type WorkoutHistoryFilters = {
  query: string;
  activity: WorkoutActivityFilter;
  dateFrom: string;
  dateTo: string;
  sort: WorkoutSort;
};

function compareMetric(
  left: number | null,
  right: number | null,
  direction: "ascending" | "descending",
) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return direction === "descending" ? right - left : left - right;
}

function compareNewestFirst(left: WorkoutListItem, right: WorkoutListItem) {
  return (
    right.performed_on.localeCompare(left.performed_on) ||
    right.created_at.localeCompare(left.created_at) ||
    left.id.localeCompare(right.id)
  );
}

function compareOldestFirst(left: WorkoutListItem, right: WorkoutListItem) {
  return (
    left.performed_on.localeCompare(right.performed_on) ||
    left.created_at.localeCompare(right.created_at) ||
    left.id.localeCompare(right.id)
  );
}

export function filterAndSortWorkouts(
  workouts: WorkoutListItem[],
  filters: WorkoutHistoryFilters,
): WorkoutListItem[] {
  const query = filters.query.trim().toLocaleLowerCase();

  return workouts
    .filter((workout) => {
      if (filters.activity !== "all" && workout.activity_type !== filters.activity) {
        return false;
      }
      if (filters.dateFrom && workout.performed_on < filters.dateFrom) return false;
      if (filters.dateTo && workout.performed_on > filters.dateTo) return false;
      if (!query) return true;

      return [
        workout.title,
        workout.notes ?? "",
        ...workout.exercise_names,
      ].some((value) => value.toLocaleLowerCase().includes(query));
    })
    .sort((left, right) => {
      switch (filters.sort) {
        case "oldest":
          return compareOldestFirst(left, right);
        case "farthest":
          return (
            compareMetric(left.distance_km, right.distance_km, "descending") ||
            compareNewestFirst(left, right)
          );
        case "shortest":
          return (
            compareMetric(left.distance_km, right.distance_km, "ascending") ||
            compareNewestFirst(left, right)
          );
        case "highest-weight":
          return (
            compareMetric(left.max_weight_kg, right.max_weight_kg, "descending") ||
            compareNewestFirst(left, right)
          );
        case "lowest-weight":
          return (
            compareMetric(left.min_weight_kg, right.min_weight_kg, "ascending") ||
            compareNewestFirst(left, right)
          );
        default:
          return compareNewestFirst(left, right);
      }
    });
}
