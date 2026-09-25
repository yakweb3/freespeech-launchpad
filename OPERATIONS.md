# FreeSpeech operations

**Vercel branch:** [VERCEL-MIGRATION.md](VERCEL-MIGRATION.md) supersedes the platform, identity, storage and deployment instructions below. These original Sites instructions must not be used to publish this migrated checkout.

## Runtime and identity

The application uses the Site's managed D1 database (`DB`), R2 bucket (`BUCKET`), and platform-owned ChatGPT sign-in. Anonymous application reads are supported, but the Site remains owner-private until the owner chooses its audience. Independent email/password registration, email verification, and password recovery are not implemented; ChatGPT handles sign-in recovery.

Never trust identity headers on a standalone public Worker. The authentication helper is intended to run behind the Sites dispatch layer. The starter's local sign-in mock exists only in Vite development, checks loopback connections, and removes incoming identity headers. It is not included as a production login route.

## Environment

Keep `.env` local and ignored. `.env.example` documents required keys. Set hosted values through Sites environment management, never in source:

- `ADMIN_USER_IDS`: explicit platform user IDs allowed to create administrator profiles. No first-user administrator shortcut. Existing profiles need controlled role provisioning through a current verified administrator or a database recovery operation.
- `ADMIN_EMAILS`: optional explicit owner email allowlist matched only against the trusted platform identity. The selected Site owner is configured through this private hosted value; emails never appear in public profiles.
- `STAFF_ENCRYPTION_KEY`: random 32-byte key, base64 encoded. Encrypts authenticator secrets with AES-GCM and user-bound additional data. Store a separate secure backup; changing this key without migrating encrypted secrets locks staff out.
- `EMAIL_API_KEY`, `EMAIL_FROM`: optional Resend API key and verified sender. Without them, in-app notifications work and email is unavailable.
- `APP_ORIGIN`: canonical HTTPS origin for outgoing email links.
- `MAINTENANCE_TOKEN`: random 32+ character token for an external scheduler. Store only in a secure environment. Without a scheduler, verified administrators can run maintenance manually.

Do not ship local test identities or test secrets as production administrator configuration.

## Local development

Use Node 24 and the existing lockfile. `node scripts/run-framework.mjs dev` starts the application (default localhost:5173). `node scripts/run-framework.mjs build` builds the Worker and browser bundles. `node node_modules/typescript/bin/tsc --noEmit` checks types.

Apply each generated migration once, in order. Local development uses `.wrangler/state`. Example, after a successful build:

```
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_boring_nico_minoru.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_fuzzy_romulus.sql
```

Both migrations have already been applied in this workspace. Do not replay them. Production deployment must apply the committed migration files through the hosting pipeline. Do not edit migrations after production use.

## Staff access and review

Sign in, finish the pseudonymous profile, open Account → Staff tools, enroll an authenticator, and save the eight one-time recovery codes. Staff sessions expire after 30 minutes. Every administrative action requires fresh role/restriction checks and a verified session. Codes cannot be replayed. Lock staff access explicitly when finished.

Reports never remove posts automatically. Review the reported material, apply a moderation action with a reason when warranted, then resolve the report with an explanation. Appeals and support requests have their own response queue. Post/comment deletion by the author is permanent; moderator removal can be restored. Staff cannot restrict themselves, moderators cannot restrict staff, and administrator accounts cannot be restricted through the generic tool.

## Media and cost controls

Default limits: six attachments per post, one H.264 MP4 per post, 25 MB/120 seconds per video, 8 MB per processed image, ten upload requests per member per day, and 8,000 MB reserved total storage. Video thumbnails count as upload requests. The server reads actual file structure; filename and client-provided duration are not authoritative. JPEG/PNG metadata is stripped. Browser processing scales pictures to 2,048 pixels and JPEG compression; this flattens transparency and animation.

Uploads are proxied through the application to R2. This avoids exposing upload credentials and permits validation; it is not a transcoding service. Videos must already be H.264 MP4. YouTube/Vimeo embeds load only on request; other video URLs remain links. Large-scale transcoding, adaptive bitrate streams, antivirus scanning, and automated content classification are not included.

Quota reservation and insertion are atomic. Failed uploads are cleaned up or retained for maintenance retry. Deleting uploaded content immediately hides it; successful object deletion releases its byte reservation. Staff can pause uploads, posting, or registration without taking existing discussions offline.

Storage limits do not cap Worker requests, reads, or all provider billing. Configure provider billing alerts and monitor request traffic before public launch. Do not assume the service is free at arbitrary traffic levels.

## Maintenance, mail, monitoring

`GET /api/forum/health` checks database and bucket access and returns a timestamp. Use it with an uptime monitor once the access policy supports that monitor. Staff Admin shows stored bytes; application logs record operation failures without exposing credentials or email bodies.

`POST /api/forum/maintenance` accepts JSON `{}`, `Content-Type: application/json`, `x-forum-request: 1`, and either a verified administrator session or `Authorization: Bearer <MAINTENANCE_TOKEN>`. Run periodically from a secure scheduler. It clears expired staff sessions and rate buckets, expires abandoned draft uploads after 24 hours, retries object deletion in batches of 50, and processes up to ten opted-in email notifications. Stored draft text remains on the member's device; expired attachments must be uploaded again.

Mail is sent with stable idempotency keys, claim leases, up to five attempts, and a 23-hour maximum queue age. The inbox remains the source of truth. No live email has been sent or delivery-verified without credentials. Reference: https://resend.com/docs/api-reference/emails/send-email

No external scheduler, independent uptime monitor, billing alerts, or independent backup destination has been provisioned in this implementation.

## Backups and recovery

A verified administrator can download a database JSON backup. It contains private account information and encrypted authenticator secrets; restrict access and encrypt the backup at rest. Back up R2 objects separately and retain the object keys. Store the staff encryption key separately. Session tokens, rate limits, and the mail queue are excluded to prevent restoration of active sessions or duplicate mail.

Staff tools → Admin → Browse media backups lists uploaded files in pages of 50 and provides individual downloads, including draft attachments. Keep these files with the matching database backup; the filename is the media ID, and the database retains the object key. Downloads require administrator two-factor verification and are audited. Static starter media is already included in the source/build. Freeze posting/uploads during a consistent backup/recovery window and avoid concurrent member deletion or staff actions; this is not an automatic atomic database-and-bucket snapshot service.

To restore a missing uploaded file after database recovery, keep posting and uploads paused and select the original file next to its media record. Recovery validates size, format, dimensions and duration, refuses to overwrite an existing object, and records an audit event. These metadata checks do not establish cryptographic identity; use trusted backups and verify file checksums in your backup system. A controlled isolated drill removed an image from R2 and restored it through this API, verifying exact byte equality. Deleted media cannot be restored through this interface.

The generated production staff encryption key has an ignored local recovery copy in `.sites-runtime/production-security.json`. Move that recovery copy into an owner-controlled encrypted vault before public operation. Do not commit or distribute it with source or ordinary database backups.

Database recovery drill:

```
python scripts/restore-backup.py backup.json new-recovery.sqlite
```

The script refuses to overwrite any existing file, requires a complete table set and exact schema, applies migrations to a new database, restores records with bound parameters, and checks foreign keys and SQLite integrity. This does not replace the live database. Inspect the recovered copy, compare row counts and media references, and verify a representative image/video before an operator-controlled production recovery. Keep posting/uploads paused while restoring matching database and bucket snapshots. Never overwrite live state merely to test a backup.

At public launch, establish retention and deletion schedules appropriate to the operator's policies. Current staff audit records, reports, tickets and retained discussion text have no automatic retention deadline. Final policy review must address that explicitly.

## Deployment and rollback

Owner-private URL: https://freespeech-orange-forum.allenramirez.chatgpt.site. The initial deployment `appgdep_6ab671f578e08191a976108647088e63` succeeded for saved version `appgprj_6ab65c912b888191bdc404afa8ecef0a~appgver_1f0af66f1cc88191b88159a6ae1dd925`. This is the initial rollback reference, not a claim that it includes later refinements. Confirm the latest deployment status after each publication.

Preserve `.openai/hosting.json` project ID and its audience. Push the exact source state, build/package that commit, save a version, and deploy it privately through Sites. A successful build is not evidence of a successful deployment. Retain the authoritative deployment status and URL.

For a code regression, redeploy the last known working saved version only if it is compatible with the current database schema. Additive migrations generally allow this; destructive migrations require an explicit recovery plan. Do not attempt to reverse migrations by editing committed SQL. Keep the prior version identifier and a pre-migration backup before schema changes.

The bundled Sites publishing helper became unavailable locally during implementation. `scripts/publish-site.mjs` provides a Windows-compatible fallback: credentials arrive on hidden stdin, Git authentication stays in subprocess memory, exact source is committed/built/pushed, and the build archive is verified. It refuses private runtime files in the source and never force-pushes. Native Sites APIs save/deploy the resulting commit and archive. Do not call the local preview a deployed site.

## Security references and test scope

Authenticator behavior is checked against all SHA-1 test vectors in RFC 6238: https://www.rfc-editor.org/rfc/rfc6238

`tests/local-api.mjs` uses only the loopback mock account and generated local content; it verifies request/ownership boundaries and core workflows. `tests/staff-security.mjs` uses only local authenticator state saved under ignored `.sites-runtime` and temporarily removes/restores and locks/unlocks a starter post. `tests/media-validation.mjs` checks file parsing and metadata removal. Never run these development tests against production.
