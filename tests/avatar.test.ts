import assert from "node:assert/strict";
import test from "node:test";
import { avatarUrl } from "../lib/avatar";

test("avatarUrl returns a versioned authenticated image endpoint", () => {
  assert.equal(
    avatarUrl("user-1", {
      avatar_path: "user-1/profile/image.png",
      avatar_version: 42,
    }),
    "/api/profile/avatar?userId=user-1&v=42",
  );
});

test("avatarUrl rejects paths belonging to another user", () => {
  assert.equal(
    avatarUrl("user-1", { avatar_path: "user-2/profile/image.png" }),
    null,
  );
});
