# FreeSpeech Forum — scope and verification

Visual direction: concept 12, Modern Orange. Scope remains all 14 agreed areas, completed as far as possible without user intervention. Current state is a functional local application; private deployment and the remaining launch audit are still pending.

| Area | Implemented | Current evidence / remaining work |
|---|---|---|
| 1 Interface | Responsive feed, header, category navigation, sidebar, dialogs, loading/empty/error states | Desktop screenshot and 390px phone check; no horizontal overflow. Shared orange theme and accessible Radix/shadcn controls. Broader zoom/keyboard checks remain. |
| 2 Accounts | ChatGPT sign-in, pseudonyms, bio/avatar, profile settings, export/deletion, roles | Local sign-in/onboarding, private-profile fields, export and last-admin deletion guard tested. Independent email/password, verification and recovery skipped pending provider choice. Ordinary-member deletion still needs a full controlled test. |
| 3 Categories | Category feeds, join/mute, administrator create/update/lock | Category feed/join filtering tested. Admin management implemented; broader interaction test remains. |
| 4 Posts/comments | Durable create/edit/delete, replies/quotes/mentions, safe formatting, drafts, permalinks, pagination, idempotent IDs | API creation/idempotency/edit/deletion checks; browser publishing; draft storage. Retry IDs retained; stale search responses ignored. Threaded reply presentation and further navigation checks remain in audit. |
| 5 Pictures | Multiple uploads, browser compression, JPEG/PNG metadata stripping, previews/lightbox, avatars/comment pictures, ownership/deletion | Browser upload/publish passed. Parser dimension/metadata/SVG/truncation tests passed. Draft access denied to anonymous users, published media readable, deleted media hidden. |
| 6 Videos | H.264 MP4 upload/progress, duration/size limits, thumbnails, controls, byte ranges, external links and click-to-load embeds | Browser 5.055-second 960×540 test played to completion with no error. Thumbnail and range/invalid-range/deletion checks passed. No transcoding/long-video pipeline. |
| 7 Discovery | Votes, hot/new/top, search/category/author filters, saved/followed/muted/joined items, unread tracking | Vote idempotency, save, category/text search, injection-string handling and mute/join filters checked. Remaining sort/follow/read paths need broader audit. |
| 8 Notifications | Durable inbox, replies/mentions/followed activity, preferences; optional leased/retry email outbox | Inbox and preference endpoints implemented; full multi-member fan-out remains to verify. Live email delivery skipped without credentials. |
| 9 Member controls | Reports, deduplication, mute, support/privacy/appeal requests and staff responses | Local report deduplication, appeal submission/response and mute behavior passed. |
| 10 Policy | About, guidelines, transparent moderation, privacy, terms; adult/non-explicit defaults | Pages implemented. Final operator/jurisdiction/retention policy review remains an owner decision. |
| 11 Staff tools | Report/ticket queue, content review, remove/restore/lock/pin/move/rename, warn/suspend/ban, roles, categories, settings/audit | Staff gate, remove/restore visibility, lock/unlock enforcement, self-restriction guard and response/audit paths tested. Broader category/account action testing remains. |
| 12 Security | Roles, ownership, CSRF/origin, parameterized SQL, bounded requests, validated media, rate limits, security headers, staff TOTP/encrypted secrets/recovery/session expiry | Typecheck and core security tests passed. All six RFC 6238 SHA-1 vectors passed. Replayed codes rejected; revoked staff session denied. Not an independent penetration test. |
| 13 Operations | D1/R2, health, storage quotas, maintenance, optional email adapter, database backup/restore, deployment helper and runbook | Health/maintenance passed; 59-record backup restored to a new SQLite DB with integrity checks. Hosted staff key and explicit Site-owner email configured privately. Publishing, independent/offsite media backups, schedule/monitor/billing setup remain. |
| 14 Launch | Six honest starter discussions, labelled generated photograph, policy pages, tests and launch checklist | Worker build passed; local/browser checks recorded below. Private publication and final wider audit still pending. |

## Verified checks

- `node node_modules/typescript/bin/tsc --noEmit` — passed after current feature work.
- `node scripts/run-framework.mjs build` — passed after security headers; final source publication build will run again after the latest refinements.
- `node tests/local-api.mjs` — passed: sign-in/onboarding, anonymous denial, CSRF/origin, image upload and draft privacy, post/comment idempotency, voting, saved posts, edits/deletion, invalid file rejection.
- `node tests/staff-security.mjs` — passed: six RFC reference vectors, enrollment, verification, replay denial, staff access, remove/restore, lock/unlock, self-protection and session revocation.
- `node tests/media-validation.mjs` — passed: PNG dimensions, metadata stripping, SVG/truncation/dimension rejection.
- `node tests/extended-api.mjs` — passed: cross-author edit/delete denial, attachment checks, report/appeal/response, mute/join, private account export, health, backup and maintenance without email credentials.
- `python scripts/restore-backup.py .sites-runtime/recovery-test.json .sites-runtime/recovery-drill-1.sqlite` — passed, 59 records restored, foreign-key and SQLite integrity checks passed. This did not overwrite the working database.
- `node tests/final-local-check.mjs` — passed: security headers, profile privacy, last-admin guard, search and injection-string handling, video range responses including five invalid cases, thumbnail access/deletion, cleanup of two browser-created test posts.
- Browser: image and MP4 composer/publishing, MP4 playback to `ended=true`, player error null, native thumbnail; 390px width, no horizontal overflow; current console error list empty; WebMCP forum search returned and displayed the expected discussion.

## Explicitly unfinished external items

Independent email/password provider; mail credentials/real delivery; operator contact/jurisdiction/final policies; custom domain/DNS; independent backup destination, media recovery, maintenance scheduler, monitoring/billing alerts; public access choice; owner authenticator enrollment. These are skipped as requested, not represented as completed.

Local development/test data and keys live only under ignored `.env` / `.sites-runtime` / `.wrangler` paths. Production starts from migrations and labelled starter content, not the local test database. The production staff encryption key is separately generated and stored in a private local runtime file and hosted secret; move its backup to a secure vault before public operation.
