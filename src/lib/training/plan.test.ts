import assert from "node:assert/strict";
import test from "node:test";
import { formatTrainingMessage, PLAN_END, PLAN_START, trainingPlan } from "./plan";

test("training plan is complete, ordered, and continuous", () => {
  const plan = trainingPlan();
  assert.equal(plan.length, 184);
  assert.equal(PLAN_START, "2026-07-19");
  assert.equal(PLAN_END, "2027-01-18");
  for (let i = 1; i < plan.length; i++) {
    const days = (Date.parse(plan[i].date) - Date.parse(plan[i - 1].date)) / 86_400_000;
    assert.equal(days, 1, `gap before ${plan[i].date}`);
  }
});

test("running messages explain how to record completion", () => {
  const plan = trainingPlan();
  const run = plan.find((day) => day.sessionType === "Run");
  const strength = plan.find((day) => day.sessionType === "Strength");
  assert.ok(run);
  assert.ok(strength);
  assert.match(formatTrainingMessage(run), /reply with what you did/);
  assert.doesNotMatch(formatTrainingMessage(strength), /reply with what you did/);
});
