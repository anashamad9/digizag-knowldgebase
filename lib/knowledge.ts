import { z } from "zod";
import { messageDate } from "./message-date";
import type { Memory } from "./types";
export const claimSchema = z.object({
  citation: z.number().int(),
  entity: z.string(),
  attribute: z.string(),
  scope: z.string(),
  value: z.string(),
  quote: z.string(),
  kind: z.enum(["assertion", "proposal", "question", "retraction"]),
  effective_date: z.string().nullable(),
  date_quote: z.string().nullable(),
  quoted_history: z.boolean(),
  replaces_previous: z.boolean(),
});
export type Claim = z.infer<typeof claimSchema>;
export const extractionSchema = z.object({
  claims: z.array(claimSchema),
  ambiguities: z.array(z.string()),
});
const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
export function queryIdentifiers(query: string) {
  return [
    ...new Set(
      (
        query.toLowerCase().match(/[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*/gu) ?? []
      ).filter(
        (t) => /\d/.test(t) && t.length >= 3 && !/^(?:19|20)\d{2}$/.test(t),
      ),
    ),
  ].slice(0, 12);
}
export function sourceTime(memory: Memory): string | null {
  const meta = memory.metadata;
  const value =
    meta.received_at ?? meta.reported_at ?? meta.datetime ?? meta.date;
  return messageDate(value);
}
export function resolveClaims(
  input: Claim[],
  sources: Memory[],
  asOf = new Date().toISOString(),
) {
  const rejected: string[] = [];
  const claims = input.flatMap((claim, index) => {
    const source = sources[claim.citation - 1];
    if (
      !source ||
      claim.quote.trim().length < 8 ||
      !normalize(source.content).includes(normalize(claim.quote))
    ) {
      rejected.push(`Claim ${index + 1}: supporting quote was not found.`);
      return [];
    }
    const explicitDate =
      claim.effective_date &&
      /^\d{4}-\d{2}-\d{2}$/.test(claim.effective_date) &&
      Number.isFinite(Date.parse(claim.effective_date)) &&
      new Date(claim.effective_date).toISOString().slice(0, 10) ===
        claim.effective_date &&
      claim.date_quote &&
      normalize(source.content).includes(normalize(claim.date_quote));
    const effectiveDate = explicitDate ? claim.effective_date : null;
    const reportedAt = claim.quoted_history ? null : sourceTime(source);
    return [
      {
        ...claim,
        effective_date: effectiveDate,
        reported_at: reportedAt,
        memory_id: source.id,
        visibility: source.visibility,
        order_at: effectiveDate ? `${effectiveDate}T00:00:00.000Z` : reportedAt,
        date_basis: effectiveDate
          ? "explicit_effective_date"
          : reportedAt
            ? "report_date_only"
            : "unknown",
        // A forwarded old assertion without its own date cannot become the latest fact.
        uncertain_date:
          (!effectiveDate && claim.quoted_history) ||
          (!!claim.effective_date && !explicitDate),
      },
    ];
  });
  type ValidClaim = (typeof claims)[number];
  const groups = new Map<string, ValidClaim[]>();
  for (const claim of claims) {
    const key = [claim.entity, claim.attribute, claim.scope]
      .map(normalize)
      .join("|");
    groups.set(key, [...(groups.get(key) ?? []), claim]);
  }
  return {
    version: 1,
    as_of: asOf,
    rejected,
    groups: [...groups.values()].map((history) => {
      history.sort((a, b) =>
        (a.order_at ?? "").localeCompare(b.order_at ?? ""),
      );
      const future = history.filter(
        (c) => c.effective_date && c.effective_date > asOf.slice(0, 10),
      );
      const candidates = history.filter(
        (c) =>
          c.kind === "assertion" &&
          !c.uncertain_date &&
          c.order_at &&
          c.order_at <= asOf &&
          !future.includes(c),
      );
      const latest = candidates.at(-1);
      const competing = latest
        ? candidates.filter(
            (c) => normalize(c.value) !== normalize(latest.value),
          )
        : [];
      const undated = history.filter(
        (c) => c.kind === "assertion" && (!c.order_at || c.uncertain_date),
      );
      const retractions = history.filter(
        (c) => c.kind === "retraction" && (!c.order_at || c.order_at <= asOf),
      );
      const conflict =
        !!latest &&
        (competing.some(
          (c) => !latest.replaces_previous || c.order_at === latest.order_at,
        ) ||
          undated.some((c) => normalize(c.value) !== normalize(latest.value)) ||
          retractions.length > 0);
      return {
        entity: history[0].entity,
        attribute: history[0].attribute,
        scope: history[0].scope,
        status: conflict ? "conflict" : latest ? "latest_report" : "unknown",
        current: conflict ? null : (latest ?? null),
        future,
        history,
        caveat:
          "These are source-attributed claims, not independently verified facts. Report date alone does not establish an effective date. Never infer approval or authority from recency.",
      };
    }),
  };
}
