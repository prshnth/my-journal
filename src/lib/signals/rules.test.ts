import assert from "node:assert/strict";
import test from "node:test";
import { RuleBasedProcessor } from "./rules";

const processor = new RuleBasedProcessor();

test("extracts a terse completed run with workbook tracking fields", async () => {
  const result = await processor.process(
    { text: "done, 25 min, energy 4/5, pain 0/10" },
    { promptText: "today's Long Run — easy run" },
  );

  assert.equal(result.didRun, true);
  assert.equal(result.runMinutes, 25);
  assert.equal(result.energy, 4);
  assert.equal(result.pain, 0);
});

test("extracts run details from an unprompted journal entry", async () => {
  const result = await processor.process({ text: "Ran 42 minutes and felt good. Pain 2/10." });
  assert.equal(result.didRun, true);
  assert.equal(result.runMinutes, 42);
  assert.equal(result.pain, 2);
});

test("marks an explicitly skipped run as not completed", async () => {
  const result = await processor.process(
    { text: "skipped — too tired" },
    { promptText: "did you run today?" },
  );
  assert.equal(result.didRun, false);
  assert.equal(result.runMinutes, null);
});

test("does not treat a terse strength completion as a run", async () => {
  const result = await processor.process(
    { text: "done, energy 3/5" },
    { promptText: "today's strength session: squats, rows, and calf raises" },
  );
  assert.equal(result.didRun, null);
  assert.equal(result.runMinutes, null);
  assert.equal(result.energy, 3);
});

test("does not classify a generic workout or movement check-in as a run", async () => {
  const lifted = await processor.process({ text: "lifted weights for 40 minutes" });
  const moved = await processor.process(
    { text: "done" },
    { promptText: "did you move today — run, walk, gym, anything?" },
  );
  assert.equal(lifted.didRun, null);
  assert.equal(moved.didRun, null);
});
