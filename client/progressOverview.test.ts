import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterTrendPointsByDateRange,
  getLiftNames,
  liftTrendPoints,
  localWeekStart,
  runTrendPoints,
} from "./progressOverview.js";
import type { LiftHistoryPoint, RunHistoryPoint } from "./progressApi.js";

const liftPoints: LiftHistoryPoint[] = [
  {
    workout_id: "workout-a",
    performed_on: "2026-10-20",
    exercise_name: "Squat",
    weight_kg: 80,
    reps: 5,
    set_number: 1,
  },
  {
    workout_id: "workout-a",
    performed_on: "2026-10-20",
    exercise_name: "squat",
    weight_kg: 100,
    reps: 3,
    set_number: 2,
  },
  {
    workout_id: "workout-b",
    performed_on: "2026-10-22",
    exercise_name: "Squat",
    weight_kg: 100,
    reps: 5,
    set_number: 1,
  },
  {
    workout_id: "workout-a",
    performed_on: "2026-10-20",
    exercise_name: "Bench press",
    weight_kg: 70,
    reps: 8,
    set_number: 1,
  },
];

test("local week start uses Monday and local calendar dates", () => {
  assert.equal(localWeekStart(new Date(2026, 9, 19, 23, 30)), "2026-10-19");
  assert.equal(localWeekStart(new Date(2026, 9, 25, 0, 15)), "2026-10-19");
});

test("date ranges include local today and the full 30- or 90-calendar-day window", () => {
  const points = [
    { workout_id: "old", date: "2026-07-27", date_label: "", weight: 1, reps: 1, distance: null, pace: null },
    { workout_id: "start-90", date: "2026-07-28", date_label: "", weight: 2, reps: 2, distance: null, pace: null },
    { workout_id: "start-30", date: "2026-09-26", date_label: "", weight: 3, reps: 3, distance: null, pace: null },
    { workout_id: "today", date: "2026-10-25", date_label: "", weight: 4, reps: 4, distance: null, pace: null },
    { workout_id: "future", date: "2026-10-26", date_label: "", weight: 5, reps: 5, distance: null, pace: null },
  ];
  const today = new Date(2026, 9, 25, 23, 30);

  assert.deepEqual(
    filterTrendPointsByDateRange(points, "30-days", today).map((point) => point.workout_id),
    ["start-30", "today"],
  );
  assert.deepEqual(
    filterTrendPointsByDateRange(points, "90-days", today).map((point) => point.workout_id),
    ["start-90", "start-30", "today"],
  );
  assert.equal(filterTrendPointsByDateRange(points, "all-time", today), points);
});

test("lift choices are case-insensitive and sorted", () => {
  assert.deepEqual(getLiftNames(liftPoints), ["Bench press", "Squat"]);
});

test("lift trends use the strongest set per session and convert weight", () => {
  const trend = liftTrendPoints(liftPoints, "SQUAT", "lb");
  assert.equal(trend.length, 2);
  assert.equal(trend[0].workout_id, "workout-a");
  assert.equal(trend[0].weight, 220.46);
  assert.equal(trend[0].reps, 3);
  assert.equal(trend[1].workout_id, "workout-b");
  assert.equal(trend[1].weight, 220.46);
  assert.equal(trend[1].reps, 5);
});

test("run trends convert distance and pace to the selected unit", () => {
  const runs: RunHistoryPoint[] = [{
    workout_id: "run-a",
    performed_on: "2026-10-21",
    distance_km: 8.25,
    pace_seconds_per_km: 330,
  }];
  const trend = runTrendPoints(runs, "mi");
  assert.equal(trend[0].distance, 5.13);
  assert.equal(trend[0].pace, 531);
});
