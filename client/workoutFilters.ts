import type { ActivityType, WorkoutListItem } from "./workoutsApi";

export type WorkoutActivityFilter = "all" | ActivityType;
export type WorkoutSort = "newest" | "weight" | "distance";

export type WorkoutHistoryFilters = {
  query: string;
  activity: WorkoutActivityFilter;
  dateFrom: string;
  dateTo: string;
  sort: WorkoutSort;
};

function compareNullableDescending(left: number | null, right: number | null) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return right - left;
}

function compareNewestFirst(left: WorkoutListItem, right: WorkoutListItem) {
  return (
    right.performed_on.localeCompare(left.performed_on) ||
    right.created_at.localeCompare(left.created_at) ||
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
      if (filters.sort === "weight") {
        return (
          compareNullableDescending(left.max_weight_kg, right.max_weight_kg) ||
          compareNewestFirst(left, right)
        );
      }
      if (filters.sort === "distance") {
        return (
          compareNullableDescending(left.distance_km, right.distance_km) ||
          compareNewestFirst(left, right)
        );
      }
      return compareNewestFirst(left, right);
    });
}
