import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingest } from "../lib/memory";
import { UpstreamError } from "../lib/composio";
import { ApiError } from "../lib/api";

test("long imported messages retain all text and embed in bounded requests", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  const batches: string[][] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    batches.push(body.input);
    return Response.json({
      data: body.input.map((_: string, index: number) => ({
        index,
        embedding: [index],
      })),
    });
  };
  let saved:
    { record: { content: string }; pieces: { content: string }[] } | undefined;
  const db = {
    rpc: async (_name: string, args: typeof saved) => {
      saved = args;
      return { data: "memory-id", error: null };
    },
  } as unknown as SupabaseClient;
  const content = "Important history. ".repeat(15000);
  try {
    await ingest(db, {
      workspace_id: "workspace",
      owner_id: "owner",
      source: "gmail",
      visibility: "private",
      title: "Long thread",
      content,
      metadata: {
        headers: { "x-large": "not needed in retrieval" },
        from: "sender@example.com",
      },
    });
    assert.equal(saved?.record.content, content.trim());
    assert.ok(batches.length > 1);
    assert.ok(batches.every((batch) => batch.length <= 16));
    const pieces = saved!.pieces;
    const rebuilt =
      pieces[0].content +
      pieces
        .slice(1)
        .map((p) => p.content.slice(400))
        .join("");
    assert.ok(rebuilt.endsWith(content.trim()));
    assert.ok(rebuilt.includes("sender@example.com"));
    assert.ok(!rebuilt.includes("not needed in retrieval"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("provider access errors remain actionable API errors", () => {
  const error = new UpstreamError(403, "Pumble");
  assert.ok(error instanceof ApiError);
  assert.match(error.message, /Pumble denied access/);
  assert.equal(error.status, 403);
});
