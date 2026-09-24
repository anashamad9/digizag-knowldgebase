import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerPrefix,
  readChatStream,
  type ChatEvent,
} from "../lib/chat-stream";
test("streams escaped JSON at every character boundary without exposing extracted memory", () => {
  const answer = 'Ahmad said "pause".\nتحديث 🚀 \\ done';
  const raw = JSON.stringify({
    answer,
    memory: { title: "SECRET", content: "PRIVATE" },
  });
  let previous = "";
  for (let i = 0; i <= raw.length; i++) {
    const result = answerPrefix(raw.slice(0, i));
    assert.ok(answer.startsWith(result));
    assert.ok(result.startsWith(previous));
    previous = result;
  }
  assert.equal(previous, answer);
  assert.equal(answerPrefix('{"answer":"\\uD83D'), "");
  assert.equal(answerPrefix('{"answer":"\\uD83D\\uDE80'), "🚀");
  assert.equal(answerPrefix('{"memory":{"answer":"SECRET"}}'), "");
});
test("NDJSON handles split UTF-8 bytes and rejects incomplete streams", async () => {
  const events: ChatEvent[] = [
    { type: "delta", text: "تحديث 🚀" },
    { type: "done", content: "تحديث 🚀", sources: [], saved: false },
  ];
  const bytes = new TextEncoder().encode(
    events.map((e) => JSON.stringify(e) + "\n").join(""),
  );
  const stream = new ReadableStream({
    start(c) {
      for (const b of bytes) c.enqueue(new Uint8Array([b]));
      c.close();
    },
  });
  const found: ChatEvent[] = [];
  await readChatStream(new Response(stream), (e) => found.push(e));
  assert.deepEqual(found, events);
  await assert.rejects(
    readChatStream(
      new Response('{"type":"delta","text":"partial"}\n'),
      () => {},
    ),
    /interrupted/,
  );
});
