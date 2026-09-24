import assert from "node:assert/strict";
import test from "node:test";
import { createUuid } from "../lib/uuid";

test("uses native UUID generation when available", () => {
  const expected = "12345678-1234-4234-8234-123456789abc";
  assert.equal(createUuid({ randomUUID: () => expected } as Crypto), expected);
});

test("HTTP fallback generates distinct valid version 4 UUIDs", () => {
  const httpCrypto = {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
  } as Crypto;
  const ids = Array.from({ length: 100 }, () => createUuid(httpCrypto));
  for (const id of ids) {
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  }
  assert.equal(new Set(ids).size, ids.length);
});
