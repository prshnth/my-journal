import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "luxon";
import { trainingDue } from "./slots";

const ny = (iso: string) => DateTime.fromISO(iso, { zone: "America/New_York" });

test("training nudge opens at 7am and catches up until noon", () => {
  assert.equal(trainingDue("America/New_York", ny("2026-07-18T06:59:59")), null);
  assert.equal(trainingDue("America/New_York", ny("2026-07-18T07:00:00")), "2026-07-18");
  assert.equal(trainingDue("America/New_York", ny("2026-07-18T11:59:59")), "2026-07-18");
  assert.equal(trainingDue("America/New_York", ny("2026-07-18T12:00:00")), null);
});

test("training nudge uses the supplied user timezone", () => {
  const instant = DateTime.fromISO("2026-07-18T11:30:00Z");
  assert.equal(trainingDue("America/New_York", instant), "2026-07-18");
  assert.equal(trainingDue("America/Los_Angeles", instant), null);
});
