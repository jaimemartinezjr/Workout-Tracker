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

test("weight sorting ranks the heaviest strength sessions first", () => {
  assert.deepEqual(
    filterAndSortWorkouts(workouts, {
      ...defaultFilters,
      activity: "strength",
      sort: "weight",
    }).map(({ id }) => id),
    ["lift-old", "lift-new"],
  );
});

test("distance sorting ranks the longest running sessions first", () => {
  assert.deepEqual(
    filterAndSortWorkouts(workouts, {
      ...defaultFilters,
      activity: "run",
      sort: "distance",
    }).map(({ id }) => id),
    ["run-long", "run-short"],
  );
});

test("newest-first ordering uses creation time and ID as stable tie breakers", () => {
  const sameDate = [
    { ...workouts[0], id: "later-id", created_at: "2026-10-22T10:00:00.000Z" },
    { ...workouts[0], id: "earlier-id", created_at: "2026-10-22T08:00:00.000Z" },
  ];
  assert.deepEqual(
    filterAndSortWorkouts(sameDate, defaultFilters).map(({ id }) => id),
    ["later-id", "earlier-id"],
  );
});
