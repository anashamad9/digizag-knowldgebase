# Brain

A minimal internal memory workspace built with Next.js App Router, React, Supabase, OpenAI GPT-5.6, Composio, coss UI, and Hugeicons. Views: Chat, Tasks, Apps, Data, Settings, plus Users for the owner. Includes responsive layouts, light/dark mode, editable memories, shared task management, and authenticated access.

## UI

Uses the original [coss UI](https://coss.com/ui) component sources with their default neutral theme and built-in small sizes. No custom control styling. Source files live in `components/ui/`; only their import aliases were changed. `components/ui/registry.json` records each official registry URL. App views are small compositions of these primitives.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000 after the setup below. There is no preview or local memory fallback. Supabase stores conversations and knowledge; sign-in is required.

## Setup

Environment variables alone are **not sufficient**. Complete these steps:

1. Copy `.env.example` to `.env.local`, fill it in locally, and set the same variables in Vercel. Never expose server keys through `NEXT_PUBLIC_` variables.
2. Paste all of [`supabase/setup.sql`](supabase/setup.sql) into **Supabase → SQL Editor** and run. This includes the database, vector index, access policies, private file storage, chat visibility, and shared tasks. It is safe to rerun against this app's schema, including an existing installation of migration 001.
3. Create each account in **Authentication → Users → Add user → Create new user**, set its password, and enable **Auto Confirm User**. This avoids verification emails. Edit the email list in [`supabase/add-members.sql`](supabase/add-members.sql), then paste and run it. Reuse its workspace UUID when adding teammates. Accounts without membership cannot open Brain. Set `full_name` in user metadata to display their name; otherwise Brain uses the email username.
4. Login uses email and password through Supabase `signInWithPassword`. No magic link or verification email is sent by the login form. Existing accounts need a password and confirmed email status; an administrator can manage these in Supabase.
5. Set Supabase's **Auth → URL Configuration → Site URL** to your app origin. SMTP and email templates are not required for this administrator-created password login flow. Public registration is not used.
6. Create the Gmail and Pumble auth configurations in Composio as described below. Supply their IDs and the Composio key. Each user then connects their own accounts in Apps.
7. Supply an OpenAI key with access to `gpt-5.6-sol` and `text-embedding-3-small`. Deploy/restart after setting env values. Set `APP_URL` to the production origin and configure the sync schedule below.
8. Verify a real login, private note, team note with a second user, uploaded document, and both account syncs before inviting the full team.

### Environment variables

| Variable                         | Purpose                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | Your Supabase project URL                                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Browser-safe anonymous/publishable key                           |
| `SUPABASE_SERVICE_ROLE_KEY`      | Server-only worker, connection management, and rate-limit access |
| `OPENAI_API_KEY`                 | Server-only OpenAI project key                                   |
| `OPENAI_MODEL`                   | Defaults to `gpt-5.6-sol` (GPT-5.6 Sol)                          |
| `COMPOSIO_API_KEY`               | Server-only Composio project key                                 |
| `COMPOSIO_GMAIL_AUTH_CONFIG_ID`  | Gmail OAuth authentication config                                |
| `COMPOSIO_PUMBLE_AUTH_CONFIG_ID` | Pumble API-key authentication config                             |
| `APP_URL`                        | Exact app origin, with no trailing slash                         |
| `CRON_SECRET`                    | A long random secret for background sync                         |

### Connect Gmail and Pumble

In **Apps**, each signed-in user connects their own accounts. Composio identities are scoped to both the workspace UUID and the authenticated user UUID. The callback verifies a one-use state cookie, authenticated user, account ownership, toolkit, and active status before saving a connection. Provider tokens remain in Composio.

For Gmail, request `https://www.googleapis.com/auth/gmail.readonly` and configure your production OAuth app/consent screen as required by Google. The server only executes GET requests. Read access must include bodies, not just Gmail's metadata-only scope.

For Pumble, install its API addon and generate a personal API key. Composio's hosted connection flow collects the key. Set the Pumble auth configuration's API base URL to `https://pumble-api-keys.addons.marketplace.cake.com` and inject the key as `ApiKey` if your Composio configuration requires this to be specified. Private channels require addon access. The sync includes available channels and their thread replies; direct-message channels are excluded.

The sync uses Composio's authenticated proxy to call the providers' documented read endpoints. This avoids granting the AI arbitrary email/message tools. **Sync** starts a batch immediately. Subsequent cron runs continue from the saved cursor.

## How memory works

1. User updates, source messages, and uploaded text become attributed memory records in Supabase. Original documents are stored in a private Storage bucket; downloads require access to their memory record. Email attachment metadata is retained; attachment contents are not automatically downloaded.
2. Text is split into overlapping chunks and embedded using `text-embedding-3-small` (1,536 dimensions). A database function replaces each source and its chunks atomically.
3. For a question, semantic similarity and full-text matching retrieve relevant source excerpts under the signed-in user's row-level security policies.
4. The Responses API uses GPT-5.6 to stream answers from evidence with numbered sources. Only decoded answer text is streamed to the browser; extracted memory JSON stays on the server. Responses are requested with `store: false`. The UI opens the full source record when a citation is selected.
5. When **Learn from chats** is enabled, the model extracts business assertions from the current user message. Questions and hypothetical statements must not become facts. Explicit **Remember** keeps the original user statement. Saved records keep the original user statement and author. Model-generated expansions are never published as team memory.
6. The knowledge improves as new context arrives. This is persistent retrieval memory, not model retraining. Source attribution and uncertainty are retained; contradictory records are not silently overwritten.

### Visibility and deletion

The chat composer has an **Only me / Team** selector for saved information. Each new chat starts at **Only me**. This choice also applies to files attached in that chat; it does not change the defaults for Data uploads or app connections. New memories and connections default to **Only me**. Users can explicitly choose **Team**. Sharing applies only within the user's assigned workspace. Conversation histories remain private. Members can read shared memories, but only their authors can edit or delete them. The service-role client is restricted to server-side worker/administrative operations; chat retrieval uses the authenticated client.

Deleting a memory removes its indexed chunks. Deleted imported records are added to an ignore list so the next sync does not reimport them. Disconnecting an app removes its imported memories. Edits to an imported record are preserved against later sync updates. Historical chat answers remain in the conversation even after a source is removed; a missing citation is no longer returned as an accessible source.

### Background sync

- Gmail: initial paginated mailbox ingestion (including spam/trash), full MIME bodies, headers, recipients, thread IDs, dates, labels, and attachment metadata. Subsequent runs use Gmail history, including deletions. An expired history cursor schedules a fresh full sync.
- Pumble: periodically scans accessible channels and thread replies, resolves author names, records message types/timestamps, and upserts edits. It removes explicit deleted-message records and data from channels no longer accessible to the connected account.
- Work is checkpointed after every item and protected by a database lease. Transient failures leave remaining work pending. Cron rotates through least-recently-attempted accounts, including failed accounts, so one failing connection cannot starve others.
- The starter processes up to 15 messages per account batch and two accounts per cron invocation. It favors predictable Vercel execution over aggressive throughput. Large company histories need a larger durable worker queue and higher throughput before broad rollout.

## Files and generated downloads

Uploads accept any file extension, with a **4 MB per-file** limit. PDF (selectable text), DOCX, XLSX, XLS, XLSM, XLSB, ODS, CSV, TSV, and common text/code formats are extracted and indexed. Spreadsheet extraction includes worksheet names. Encrypted, malformed, or oversized documents may fail extraction. Scanned PDFs and other binary files are stored with a **Stored only** badge: Brain indexes their filename/type, not unextracted contents. Extracted text is limited to 120,000 characters; split larger documents. Upload folders through Data to retain relative paths.

Ask Brain to create a CSV, Excel workbook, PDF, DOCX, presentation, image, or another format supported by Code Interpreter. It creates real files through OpenAI's tool, then persists downloads in private Supabase Storage. Generated documents appear in Data and remain private until explicitly shared there. At most five generated files of 4 MB each are saved per answer. OpenAI Code Interpreter incurs its own usage charges. The latest five compatible files attached to the current chat are supplied to a fresh interpreter container for analysis; temporary OpenAI uploads and containers are deleted after completion on a best-effort basis. Abrupt process termination can interrupt that cleanup; configure provider retention/monitoring for deployment.

Deleting a file removes its searchable memory and queued Storage original. Chat deletion cascades to saved facts, uploaded files, and generated files associated with that chat. It does not delete independent emails or messages merely cited by the chat. Older uploads without a recorded chat association remain independent and can be deleted in Data. Disconnecting an app removes that connection's imported memory. Past answers in other chats are retained and may contain historical excerpts; deletion prevents future retrieval from the removed sources. Deletion cleanup is durable: the database queues file removal atomically, and API calls plus cron retry cleanup.

## Owner and user management

For an existing installation, run [`supabase/upgrade.sql`](supabase/upgrade.sql) once in the **KBase** SQL Editor. It applies the management, knowledge, ordering, and task-management upgrades and assigns `anas.hamad@digizag.com` as owner, provided the account is already a member. For a fresh installation use setup.sql, add-members.sql, then set-owner.sql. Do not run initial migration 001 again on an installed database.

The owner sees **Users** with names, emails, last login, account status, and controls to create, edit, suspend, and delete accounts. New users get an administrator-set password and confirmed email without an invitation link. Suspension removes Brain access even for existing sessions. Only the owner can call these management endpoints; ordinary users cannot promote themselves. Owner self-deletion and editing through these controls are blocked. User deletion permanently removes the account and their Brain data, including shared memories, after confirmation. If provider revocation fails, the account stays suspended and the owner can retry.

Owner permissions do **not** grant access to other members' private chats or private memory. Initial ownership is assigned through SQL, never through browser metadata or public signup.

## Deploy to Vercel

Import this directory/repository into Vercel as a Next.js project, set the environment variables, and use your production domain for `APP_URL` and Supabase's redirect allowlist. Run the Supabase migration and create memberships before opening the live workspace.

`vercel.json` schedules `/api/cron` every five minutes. This schedule requires a Vercel plan that supports frequent cron execution (Pro or above under the documented limits). On Hobby, remove that cron entry and schedule the endpoint externally, or change it to daily and accept slow ingestion. The external scheduler must send `Authorization: Bearer YOUR_CRON_SECRET`. Local `next dev` does not schedule cron jobs; **Sync** remains available.

No deployment or user account authorization has been performed. A small synthetic OpenAI file-generation check was performed.

## Verification

The production build uses Next.js’s supported Webpack mode for compatibility with the local PostCSS worker sandbox. Development uses the standard Next.js dev server.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The PostgreSQL tests use PGlite + pgvector to execute the actual migration and test cross-workspace isolation, private/shared search, edit ownership, membership protection, atomic vector replacement, deletion, worker permissions, and private storage policies. Browser tests use isolated test accounts and mocked provider responses to check authenticated layout, privacy selection, streaming, navigation, and login. Database tests exercise actual row-level access policies. These do not replace live provider verification.

Browser tests use installed Chrome on macOS by default. Set `PLAYWRIGHT_CHROME_PATH` to a Chrome executable on another platform, or run `npx playwright install chromium` and unset the executable path in the configuration to use bundled Chromium. Screenshots are written to `artifacts/`.

### Live validation still required

OAuth consent, live Supabase Storage through the app, and full-history sync against real accounts still need end-to-end verification. GPT-5.6 Sol with Code Interpreter was verified with a synthetic CSV generation/download. In particular, Pumble's public API schema leaves cursor strategy semantics underspecified: the adapter uses a timestamp cursor with `BEFORE` and refuses repeated pages rather than silently claiming completion. Validate this against your connected account and adjust `lib/sync.ts` if your account's API uses a different cursor convention.

The Pumble API does not guarantee tombstones for messages silently removed upstream; these require reconciliation support beyond this starter. Similarly, after an expired Gmail history cursor, a full scan cannot identify previously deleted records that no longer exist upstream. For a production-wide launch, add full source-inventory reconciliation, OCR if needed, a throughput-appropriate queue, and application monitoring. The Data screen currently lists the most recent 500 accessible records; retrieval searches the full indexed corpus. Recent conversations load the latest 50 threads.

## Primary documentation

- [GPT-5.6 Sol model](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [OpenAI Responses text generation](https://developers.openai.com/api/docs/guides/text)
- [Composio hosted account connections](https://docs.composio.dev/docs/tools-direct/authenticating-tools)
- [Composio authenticated proxy](https://docs.composio.dev/docs/tools-direct/executing-tools)
- [Gmail synchronization](https://developers.google.com/workspace/gmail/api/guides/sync)
- [Pumble API addon and access](https://pumble.com/help/integrations/automation-workflow-integrations/api-keys-integration/)
- [Pumble API schema](https://pumble-api-keys.addons.marketplace.cake.com/api-docs/)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

Chat uses the [OpenAI streaming Responses API](https://developers.openai.com/api/docs/guides/streaming-responses). Original app logos are from [Google](https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png) and [Pumble](https://pumble.com/).

Composio configurations must be from the project matching COMPOSIO_API_KEY. Use their actual `ac_…` IDs; exact configuration names are also resolved by the server. Pumble uses a custom API_KEY configuration and each user supplies their own Pumble API addon key through the hosted flow.
