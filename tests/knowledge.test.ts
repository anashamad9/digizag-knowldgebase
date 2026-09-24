import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveClaims,
  queryIdentifiers,
  sourceTime,
  type Claim,
} from "../lib/knowledge";
import type { Memory } from "../lib/types";
const now = "2026-09-23T12:00:00.000Z";
function source(content: string, date = "2026-09-01T12:00:00Z"): Memory {
  return {
    id: crypto.randomUUID(),
    title: "Business update",
    source: "note",
    content,
    created_at: now,
    visibility: "private",
    metadata: { reported_at: date },
  };
}
function claim(
  citation: number,
  quote: string,
  value: string,
  overrides: Partial<Claim> = {},
): Claim {
  return {
    citation,
    quote,
    value,
    entity: "campaign Noon",
    attribute: "owner",
    scope: "GCC",
    kind: "assertion",
    effective_date: null,
    date_quote: null,
    quoted_history: false,
    replaces_previous: false,
    ...overrides,
  };
}
test("explicit reassignment keeps previous owner in history", () => {
  const sources = [
    source("Ahmad owns the GCC campaign."),
    source(
      "We changed the GCC campaign owner to Maya.",
      "2026-09-15T12:00:00Z",
    ),
  ];
  const result = resolveClaims(
    [
      claim(1, sources[0].content, "Ahmad"),
      claim(2, sources[1].content, "Maya", { replaces_previous: true }),
    ],
    sources,
    now,
  ).groups[0];
  assert.equal(result.current?.value, "Maya");
  assert.equal(result.history.length, 2);
  assert.equal(result.status, "latest_report");
});
test("a newer conflicting report without a replacement remains unresolved", () => {
  const sources = [
    source("Ahmad owns the GCC campaign."),
    source("Maya owns the GCC campaign.", "2026-09-15T12:00:00Z"),
  ];
  const result = resolveClaims(
    sources.map((s, i) => claim(i + 1, s.content, i ? "Maya" : "Ahmad")),
    sources,
    now,
  ).groups[0];
  assert.equal(result.status, "conflict");
  assert.equal(result.current, null);
});
test("future changes and proposals do not replace current state", () => {
  const sources = [
    source("Noon campaign is active."),
    source("Noon will change to paused on 2026-10-11."),
    source("Should we cancel Noon?"),
  ];
  const claims = [
    claim(1, sources[0].content, "active", { attribute: "status" }),
    claim(2, sources[1].content, "paused", {
      attribute: "status",
      effective_date: "2026-10-11",
      date_quote: "2026-10-11",
      replaces_previous: true,
    }),
    claim(3, sources[2].content, "cancelled", {
      attribute: "status",
      kind: "proposal",
    }),
  ];
  const group = resolveClaims(claims, sources, now).groups[0];
  assert.equal(group.current?.value, "active");
  assert.equal(group.future.length, 1);
});
test("a newer forward cannot update a quoted undated deadline", () => {
  const sources = [
    source("Deadline is 2026-09-30."),
    source("Forwarded: Deadline is 2025-01-01.", "2026-09-22T12:00:00Z"),
  ];
  const group = resolveClaims(
    [
      claim(1, sources[0].content, "2026-09-30", { attribute: "deadline" }),
      claim(2, sources[1].content, "2025-01-01", {
        attribute: "deadline",
        quoted_history: true,
        replaces_previous: true,
      }),
    ],
    sources,
    now,
  ).groups[0];
  assert.equal(group.current, null);
  assert.equal(group.status, "conflict");
  assert.equal(group.history.find((c) => c.quoted_history)?.reported_at, null);
});
test("partner, market and currency scopes remain separate", () => {
  const sources = [
    source("KSA partner 14534 has payout USD 20."),
    source("UAE partner 14534 has payout AED 30."),
  ];
  const groups = resolveClaims(
    [
      claim(1, sources[0].content, "20", {
        scope: "KSA USD",
        attribute: "payout",
      }),
      claim(2, sources[1].content, "30", {
        scope: "UAE AED",
        attribute: "payout",
      }),
    ],
    sources,
    now,
  ).groups;
  assert.equal(groups.length, 2);
});
test("unsupported quotes, private unseen citations and fabricated dates are rejected", () => {
  const sources = [source("Launch is planned, date undecided.")];
  const result = resolveClaims(
    [
      claim(8, "Private secret launch plan", "secret"),
      claim(1, "Launch is completed successfully", "done"),
      claim(1, sources[0].content, "planned", {
        effective_date: "2026-09-20",
        date_quote: "20 September",
      }),
    ],
    sources,
    now,
  );
  assert.equal(result.rejected.length, 2);
  assert.equal(result.groups[0].current, null);
});
test("same-time contradictions and cancellations never silently pick a winner", () => {
  const sources = [
    source("Task owner is Ahmad."),
    source("Task owner changed to Maya."),
    source("Cancel the assignment."),
  ];
  const result = resolveClaims(
    [
      claim(1, sources[0].content, "Ahmad"),
      claim(2, sources[1].content, "Maya", { replaces_previous: true }),
      claim(3, sources[2].content, "cancelled", { kind: "retraction" }),
    ],
    sources,
    now,
  ).groups[0];
  assert.equal(result.status, "conflict");
});
test("ingestion time is never used as an event date", () => {
  const s = source("The project is active.");
  s.metadata = {};
  assert.equal(sourceTime(s), null);
  assert.equal(
    resolveClaims([claim(1, s.content, "active")], [s], now).groups[0].status,
    "unknown",
  );
});
test("identifier extraction keeps exact IDs and typed alphanumeric keys", () => {
  assert.deepEqual(
    queryIdentifiers("Offer 14534 vs partner 145340, TASK-12 in 2026"),
    ["14534", "145340", "task-12"],
  );
});
