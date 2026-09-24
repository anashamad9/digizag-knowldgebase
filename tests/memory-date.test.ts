import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDate, newestMemoryFirst } from "../lib/memory-date";
import type { Memory } from "../lib/types";
const row = (
  id: string,
  source: Memory["source"],
  metadata: Memory["metadata"],
  created_at = "2026-10-01T00:00:00Z",
): Memory => ({
  id,
  title: id,
  source,
  metadata,
  created_at,
  content: "body",
  visibility: "private",
});
test("source date ordering ignores import order and puts undated messages last", () => {
  const old = row("old-mail", "gmail", {
    date: "Tue, 01 Sep 2026 10:00:00 +0300",
  });
  const newest = row(
    "new-pumble",
    "pumble",
    { datetime: "2026-09-22T10:00:00Z" },
    "2026-09-23T00:00:00Z",
  );
  const missing = row("missing", "gmail", {});
  const rows = [old, missing, newest];
  assert.deepEqual(
    rows.sort(newestMemoryFirst).map((r) => r.id),
    ["new-pumble", "old-mail", "missing"],
  );
  assert.equal(memoryDate(old), "2026-09-01T07:00:00.000Z");
  assert.equal(memoryDate(missing), null);
  assert.equal(
    memoryDate(
      row("fallback", "gmail", {
        date: "invalid",
        received_at: "2026-09-20T00:00:00Z",
      }),
    ),
    "2026-09-20T00:00:00.000Z",
  );
  assert.equal(memoryDate(row("file", "file", {})), "2026-10-01T00:00:00.000Z");
});
