import { test } from "node:test";
import assert from "node:assert/strict";
import { skipChannel, channelAccessWarning } from "../lib/sync-access";

test("blocked channels and their threads leave the queue without blocking accessible channels", () => {
  const blocked = { channelId: "private", channelName: "digizag-family" };
  const accessible = { channelId: "public", channelName: "general" };
  const tasks = [blocked, accessible, { ...blocked, root: "thread" }];
  const result = skipChannel(tasks, [], blocked);
  assert.deepEqual(result.tasks, [accessible]);
  assert.deepEqual(result.skippedChannels, [blocked]);
  const warning = channelAccessWarning(result.skippedChannels);
  assert.match(warning!, /#digizag-family/);
  assert.match(warning!, /API add-on bot/);
  assert.equal(
    skipChannel(result.tasks, result.skippedChannels, blocked).skippedChannels
      .length,
    1,
  );
  assert.equal(channelAccessWarning([]), null);
  assert.equal(skipChannel([blocked], [], blocked).tasks.length, 0);
  assert.equal(tasks.length, 3);
});
