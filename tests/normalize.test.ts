import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGmail, normalizePumble, pumblePage } from "../lib/normalize";
import { chunkText } from "../lib/memory";
test("preserves email participants and metadata while decoding a multipart body", () => {
  const m = normalizeGmail({
    id: "m1",
    threadId: "t1",
    internalDate: "1700000000000",
    payload: {
      headers: [
        { name: "Subject", value: "Noon GCC" },
        { name: "From", value: "Ahmad <ahmad@example.com>" },
        { name: "Cc", value: "ops@example.com" },
      ],
      parts: [
        {
          mimeType: "text/plain",
          body: {
            data: Buffer.from("Paused on 11 October.").toString("base64url"),
          },
        },
        {
          filename: "plan.pdf",
          mimeType: "application/pdf",
          body: { attachmentId: "a1", size: 10 },
        },
      ],
    },
  });
  assert.equal(m.content, "Paused on 11 October.");
  assert.equal(m.metadata.cc, "ops@example.com");
  assert.equal(m.metadata.attachments.length, 1);
  assert.equal(m.metadata.thread_id, "t1");
});
test("retains attribution, edits, and thread information for Pumble", () => {
  const page = pumblePage([
    {
      id: "m",
      author: "u",
      channelId: "c",
      text: "Discussed payout 14534",
      edited: true,
      timestamp: "2026-09-22T12:00:00Z",
      threadReplyInfo: { root: "r" },
    },
  ]);
  const m = normalizePumble(page.messages[0], "partnerships", { u: "Ahmad" });
  assert.equal(m.metadata.author, "Ahmad");
  assert.equal(m.metadata.edited, true);
  assert.deepEqual(m.metadata.thread_reply, { root: "r" });
  assert.equal(m.content, "Discussed payout 14534");
  assert.throws(() => pumblePage({ unexpected: [] }));
});
test("chunks retain every character with overlap for retrieval boundaries", () => {
  const text = "abcdefghij".repeat(1300);
  const chunks = chunkText(text, 1000, 100);
  assert.equal(chunks[0].length, 1000);
  assert.equal(chunks[0].slice(-100), chunks[1].slice(0, 100));
  assert.equal(
    chunks[0] +
      chunks
        .slice(1)
        .map((c) => c.slice(100))
        .join(""),
    text,
  );
  assert.deepEqual(chunkText(" \u0000 "), []);
  assert.throws(() => chunkText("x", 100, 100));
});

test("Gmail alternative MIME bodies are indexed once", () => {
  const message = normalizeGmail({
    id: "m2",
    payload: {
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/plain",
          body: { data: Buffer.from("One message").toString("base64url") },
        },
        {
          mimeType: "text/html",
          body: {
            data: Buffer.from("<p>One message</p>").toString("base64url"),
          },
        },
      ],
    },
  });
  assert.equal(message.content, "One message");
});

test("Pumble preserves the original sent instant and accepts numeric or ISO timestamps", () => {
  const message = {
    id: "time-test",
    author: "a",
    channelId: "c",
    text: "Update",
  };
  const expected = "2026-09-22T10:15:30.000Z";
  const millis = Date.parse(expected);
  for (const timestamp of [
    expected,
    millis,
    String(millis),
    millis / 1000,
    String(millis / 1000),
  ]) {
    assert.equal(
      normalizePumble({ ...message, timestamp }, "general", { a: "Ahmad" })
        .metadata.datetime,
      expected,
    );
  }
  assert.equal(
    normalizePumble(
      { ...message, timestamp: "invalid", timestampMilli: millis },
      "general",
      {},
    ).metadata.datetime,
    expected,
  );
  assert.equal(normalizePumble(message, "general", {}).metadata.datetime, null);
});
