import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatPaceInput,
  paceFromSecondsPerKm,
  paceToSecondsPerKm,
  parsePaceInput,
} from "./pace.js";

test("parses minute:second pace values", () => {
  assert.equal(parsePaceInput("8:30"), 510);
  assert.equal(parsePaceInput("  0:45 "), 45);
  assert.equal(parsePaceInput("12:00"), 720);
});

test("rejects pace values that are not valid min:sec times", () => {
  for (const value of ["", "8.5", "8:", ":30", "8:60", "0:00", "-1:30"]) {
    assert.equal(parsePaceInput(value), null, `expected ${value} to be invalid`);
  }
});

test("formats pace seconds with two-digit seconds", () => {
  assert.equal(formatPaceInput(510), "8:30");
  assert.equal(formatPaceInput(8 * 60 + 5), "8:05");
  assert.equal(formatPaceInput(60), "1:00");
});

test("converts mile pace to canonical per-kilometer pace and back", () => {
  const canonicalPace = paceToSecondsPerKm(510, "mi");
  assert.equal(canonicalPace, 317);
  assert.equal(paceFromSecondsPerKm(canonicalPace, "mi"), 510);
  assert.equal(paceToSecondsPerKm(510, "km"), 510);
  assert.equal(paceFromSecondsPerKm(510, "km"), 510);
});
