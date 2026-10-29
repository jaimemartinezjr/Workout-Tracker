import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatPaceInput,
  paceFromSecondsPerKm,
  paceToSecondsPerKm,
  parsePaceInput,
} from "./pace.js";

test("parses minute:second pace values", () => {
  assert.equal(parsePaceInput("8"), 480);
  assert.equal(parsePaceInput("9"), 540);
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
  assert.ok(Math.abs(canonicalPace * 1.609344 - 510) < 0.001);
  assert.equal(formatPaceInput(paceFromSecondsPerKm(canonicalPace, "mi")), "8:30");

  const nineMinuteMile = paceToSecondsPerKm(540, "mi");
  assert.equal(formatPaceInput(paceFromSecondsPerKm(nineMinuteMile, "mi")), "9:00");
  assert.equal(paceToSecondsPerKm(510, "km"), 510);
  assert.equal(paceFromSecondsPerKm(510, "km"), 510);
});

test("session pace input keeps min:sec precision through unit conversion", () => {
  const inputSeconds = parsePaceInput("8:30");
  assert.equal(inputSeconds, 510);
  const secondsPerKm = paceToSecondsPerKm(inputSeconds!, "mi");
  assert.equal(
    formatPaceInput(paceFromSecondsPerKm(secondsPerKm, "mi")),
    "8:30",
  );
  assert.equal(
    formatPaceInput(paceFromSecondsPerKm(paceToSecondsPerKm(510, "mi"), "km")),
    "5:17",
  );
});
