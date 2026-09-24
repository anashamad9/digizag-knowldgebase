import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedOrigin } from "../lib/request-origin";

const request = (origin: string) =>
  new Request("http://0.0.0.0:3000/api/chat", { headers: { origin } });

test("LAN origin works in development when Next uses its bind address", () => {
  assert.equal(
    isAllowedOrigin(
      request("http://192.168.0.132:3000"),
      "http://localhost:3000",
      true,
    ),
    true,
  );
});

test("LAN exception is disabled in production", () => {
  assert.equal(
    isAllowedOrigin(
      request("http://192.168.0.132:3000"),
      "http://localhost:3000",
      false,
    ),
    false,
  );
});

test("untrusted origins and mismatched ports or schemes remain blocked", () => {
  for (const origin of [
    "https://evil.example",
    "http://192.168.0.132:4000",
    "https://192.168.0.132:3000",
    "null",
    "http://192.168.0.132.evil.example:3000",
  ]) {
    assert.equal(
      isAllowedOrigin(request(origin), "http://localhost:3000", true),
      false,
    );
  }
});

test("same origin and configured app URL remain allowed", () => {
  assert.equal(
    isAllowedOrigin(request("http://0.0.0.0:3000"), undefined, false),
    true,
  );
  assert.equal(
    isAllowedOrigin(
      request("https://brain.example"),
      "https://brain.example",
      false,
    ),
    true,
  );
});
