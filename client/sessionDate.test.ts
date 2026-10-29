import assert from "node:assert/strict";
import test from "node:test";
import { formatSessionDate } from "./sessionDate";

test("formats a session date with its weekday", () => {
  assert.equal(formatSessionDate("2026-10-23"), "Friday - Oct 23, 2026");
});

test("preserves an invalid date value for troubleshooting", () => {
  assert.equal(formatSessionDate("not-a-date"), "not-a-date");
});
