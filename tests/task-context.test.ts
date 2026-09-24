import assert from "node:assert/strict";
import test from "node:test";
import { taskStatusLimits } from "../lib/task-context";

test("task questions prioritize the requested status without hiding counts", () => {
  assert.deepEqual(taskStatusLimits("Are there any pending tasks?"), {
    pending: 100,
    on_it: 5,
    done: 5,
    issue: 5,
  });
  assert.deepEqual(taskStatusLimits("Show completed issues"), {
    pending: 5,
    on_it: 5,
    done: 100,
    issue: 100,
  });
});

test("general task questions receive a balanced snapshot", () => {
  assert.deepEqual(taskStatusLimits("What tasks are assigned to me?"), {
    pending: 25,
    on_it: 25,
    done: 25,
    issue: 25,
  });
});
