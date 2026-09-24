# Brain knowledge reliability

Apply `supabase/migrations/004_knowledge.sql` once in the connected Supabase SQL editor. It is additive and safe to rerun. Fresh installations use `setup.sql`, which includes it. Existing indexed messages do not need reimporting.

This layer is general-purpose. No list of business scenarios or payout-specific fields is required. It works on retrieved evidence at question time, rather than writing model interpretations back into shared memory.

## Answer flow

1. Retrieve a bounded set of semantic matches, exact identifier matches, recent related reports and earlier identifier history. Retrieval uses the signed-in user's Supabase client and RLS. Generated files are excluded as independent evidence.
2. Extract structured, source-attributed claims with exact supporting quotes. Capture entity, attribute, scope, value, assertion/proposal/question/retraction, explicit effective date and quoted-history status.
3. Validate citation bounds and supporting quote presence. Compare claims within the same entity/attribute/scope. Retain earlier reports, future changes and conflicts. Do not substitute import time for unknown source time or interpret recency as authority.
4. Generate the answer using this ledger, original excerpts, coverage information and explicit owner business rules. An unavailable evidence analysis must produce a qualified answer, not a definitive current-state claim.
5. Store the evidence analysis with the assistant message for inspection and debugging. This belongs to the private conversation; it is not global business truth.

## Controls

Settings > Business rules: the owner can define terminology, aliases, approval conventions and authoritative sources. All workspace members can read these rules. Ordinary source text cannot modify them. Blank rules are valid: Brain must not invent an authority hierarchy.

Data > memory > Previous versions: owners can see the last ten replaced versions of their sources. Revisions are not exposed to shared readers, because an earlier version may have been private. Deleting the source also deletes its revisions. Revisions start after the migration is applied; older overwritten content cannot be recovered retroactively.

An existing source edit records history. A new explicit correction in chat is retained as its own attributed report. Neither action grants authority automatically.

## Validation

- `npm test`: deterministic temporal, identity, source-grounding and database RLS checks.
- `npm run test:e2e`: UI and owner/member permissions using isolated mock services.
- `node --env-file=.env.local --import tsx scripts/eval-knowledge.ts`: opt-in real-model evaluation of six synthetic scenarios. Uses API credits; reads no business data.

## Limits and next work

- Structured output and matching quotes do not prove the model interpreted a source correctly. The synthetic evaluation is a regression baseline, not a guarantee for all business cases.
- Retrieval is bounded (up to 28 source excerpts); it is not an exhaustive company-wide audit. Aliases are interpreted from explicit rules and retrieved context, not an established organization-wide entity graph.
- This is an on-demand evidence ledger, not a persistent canonical fact registry. No expensive full-history extraction/backfill is required. Persistent reviewed facts and a dedicated entity graph remain future work.
- Source timestamps do not establish effective dates. Reports with missing dates or scopes remain qualified. A newer contradictory report requires explicit replacement evidence; otherwise conflicts remain visible.
- Existing cron sync continues resumable source imports. A dedicated durable job queue, automated cost accounting, OCR/attachment ingestion, and a full admin evaluation dashboard are not introduced by this migration.
- The additional extraction request increases answer latency and API usage. Its input/output and request timeout are bounded. Extracted claims are not reused as authoritative evidence in later questions.
