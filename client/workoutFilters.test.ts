import assert from "node:assert/strict";
import { test } from "node:test";
import { filterAndSortWorkouts } from "./workoutFilters.js";
import type { WorkoutListItem } from "./workoutsApi.js";

const workouts: WorkoutListItem[] = [
  {
    id: "lift-new",
    title: "Upper body",
    activity_type: "strength",
    performed_on: "2026-10-22",
    notes: "Paused reps",
    created_at: "2026-10-22T08:00:00.000Z",
    exercise_names: ["Bench press", "Row"],
    max_weight_kg: 120,
    min_weight_kg: 40,
    distance_km: null,
  },
  {
    id: "run-long",
    title: "Long run",
    activity_type: "run",
    performed_on: "2026-10-20",
    notes: null,
    created_at: "2026-10-20T08:00:00.000Z",
    exercise_names: [],
    max_weight_kg: null,
    min_weight_kg: null,
    distance_km: 18,
  },
  {
    id: "lift-old",
    title: "Leg day",
    activity_type: "strength",
    performed_on: "2026-10-18",
    notes: null,
    created_at: "2026-10-18T08:00:00.000Z",
    exercise_names: ["Squat", "Row"],
    max_weight_kg: 140,
    min_weight_kg: 20,
    distance_km: null,
  },
  {
    id: "run-short",
    title: "Recovery miles",
    activity_type: "run",
    performed_on: "2026-10-17",
    notes: "Easy effort",
    created_at: "2026-10-17T08:00:00.000Z",
    exercise_names: [],
    max_weight_kg: null,
    min_weight_kg: null,
    distance_km: 5,
  },
];

const defaultFilters = {
  query: "",
  activity: "all" as const,
  dateFrom: "",
  dateTo: "",
  sort: "newest" as const,
};

test("search matches exercise names, titles, and notes without case sensitivity", () => {
  assert.deepEqual(
    filterAndSortWorkouts(workouts, { ...defaultFilters, query: "sQuAt" })
      .map(({ id }) => id),
    ["lift-old"],
  );
  assert.deepEqual(
    filterAndSortWorkouts(workouts, { ...defaultFilters, query: "paused" })
      .map(({ id }) => id),
    ["lift-new"],
  );
});

test("activity and inclusive date filters can be combined", () => {
  assert.deepEqual(
    filterAndSortWorkouts(workouts, {
      ...defaultFilters,
      activity: "strength",
      dateFrom: "2026-10-18",
      dateTo: "2026-10-21",
    }).map(({ id }) => id),
    ["lift-old"],
  );
});

test("newest and oldest sorts use the performed date", () => {
  assert.deepEqual(
    filterAndSortWorkouts(workouts, { ...defaultFilters, sort: "newest" })
      .map(({ id }) => id),
    ["lift-new", "run-long", "lift-old", "run-short"],
  );
  assert.deepEqual(
    filterAndSortWorkouts(workouts, { ...defaultFilters, sort: "oldest" })
      .map(({ id }) => id),
    ["run-short", "lift-old", "run-long", "lift-new"],
  );
});

test("farthest and shortest sorts rank running sessions by distance", () => {
  assert.deepEqual(
    filterAndSortWorkouts(workouts, {
      ...defaultFilters,
      activity: "run",
      sort: "farthest",
    }).map(({ id }) => id),
    ["run-long", "run-short"],
  );
  assert.deepEqual(
    filterAndSortWorkouts(workouts, {
      ...defaultFilters,
      activity: "run",
      sort: "shortest",
    }).map(({ id }) => id),
    ["run-short", "run-long"],
  );
});

test("highest and lowest weight sorts rank strength sessions by set weight", () => {
  assert.deepEqual(
    filterAndSortWorkouts(workouts, {
      ...defaultFilters,
      activity: "strength",
      sort: "highest-weight",
    }).map(({ id }) => id),
    ["lift-old", "lift-new"],
  );
  assert.deepEqual(
    filterAndSortWorkouts(workouts, {
      ...defaultFilters,
      activity: "strength",
      sort: "lowest-weight",
    }).map(({ id }) => id),
    ["lift-old", "lift-new"],
  );
});

test("metric ties fall back to newest first", () => {
  const tiedRuns = [
    { ...workouts[1], id: "run-older", distance_km: 10 },
    { ...workouts[3], id: "run-newer", distance_km: 10, performed_on: "2026-10-21" },
  ];
  assert.deepEqual(
    filterAndSortWorkouts(tiedRuns, {
      ...defaultFilters,
      activity: "run",
      sort: "farthest",
    }).map(({ id }) => id),
    ["run-newer", "run-older"],
  );
});
