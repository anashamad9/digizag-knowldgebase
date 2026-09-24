# DigiZag System v1 — staff context review

Read-only review of `/Users/apple/Downloads/Digizag System v1`. No source project files, environment files, credentials, live records or live configuration were changed or imported into Brain.

The paste-ready draft is `docs/digizag-business-rules.txt`. It is based on code and documentation, not verification of the deployed database. It has not been saved to Brain's Settings.

## Sources inspected

- `supabase/schema.sql`: staff/partner profiles, advertisers, offers and conversion identifiers, dates, measures and statuses.
- `lib/staff-permissions.ts`, `lib/staff-access.ts`, `lib/staff-data-scope.ts`, `docs/staff-permissions.md`: capability ceilings, live restrictions and independent offer scope.
- `lib/payments.ts`, `app/api/payments/route.ts`, `supabase/invoice-finance-workflow.sql`, `supabase/invoice-prepayments.sql`, `supabase/fixed-conversion-status.sql`: invoice lifecycle, sequential approval, advances, fixed/approved eligibility and reservations.
- `docs/targets.md`, `lib/targets.ts`, `supabase/targets.sql`: targets, current-owner grouping and performance formulas.
- `docs/coupon-links.md`: scoped assignments, unassigned inventory, mapping ambiguity and duplicate handling.
- `docs/ai-chatbot.md`, `lib/ai-chat.ts`, `supabase/ai-chatbot.sql`: bounded, permission-scoped live aggregate reporting; source currency and metric definitions.
- `docs/logs-sessions.md`: actor attribution and audit limitations.

## Important version differences

1. `docs/staff-permissions.md` says Finance cannot approve invoices. Current `lib/staff-permissions.ts` permits `payments.approve`, and `supabase/invoice-finance-workflow.sql` explicitly adds the Finance approval capability. New invoices use Operations → Admin → Finance; amounts above USD 3,000 add Super Admin before Finance. The migration preserves existing workflows. Live installation was not checked.
2. The original payment SQL creates paid invoices on issue, whereas newer workflow code creates unpaid invoices and requires ordered approvals. Reading only the base migration would teach Brain incorrect current behavior.
3. `docs/targets.md` describes wider target access than the current role ceilings permit. Do not encode its role matrix without checking the current permissions and deployed migrations.
4. Partner navigation descriptions differ between `docs/partner-permissions.md` and `docs/partner-workspace.md`. This review focuses on staff behavior and does not assume either document alone proves current partner access.

## Integration boundary

Brain is currently a separate application with owner/member membership and private/workspace memories. It does not inherit the operational system's six staff roles, capability overrides or offer assignments. Business-rule text cannot enforce that authorization.

If these apps are integrated, use the operational system's authenticated, permission-scoped APIs, with verified identity mapping and live offer/capability checks. Do not use a service-role database connection as an unrestricted reporting tool. The operational system already has an aggregate-report AI path that provides a useful integration reference.

For exact current totals/statuses Brain needs an actual authorized live data connection. Source-code review supplies vocabulary and workflow context, not production figures, live assignments, or confirmation that migrations are installed.
