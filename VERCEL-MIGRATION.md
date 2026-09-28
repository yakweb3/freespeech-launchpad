# Vercel deployment

See [LAUNCHPAD.md](LAUNCHPAD.md) for the Solana update, schema-4 backups, wallet access, confirmation recovery and real-wallet testing limitations.

This worktree is the Vercel migration of the Modern Orange forum. The original Sites checkout and private deployment remain separate. This starts a new database; existing Sites accounts and uploaded media have not been copied.

## Current account resources

- Vercel project: `freespeech-forum`, team `yakweb3-8425s-projects`, project ID `prj_IBOXuD9sCxmnCNSz9pyWkvNPXSeJ`.
- Private Blob store: `freespeech-forum-media`, ID `store_qLVt5uGEWvRkBkTR`, connected to production and development.
- Production authentication secret, staff encryption key and private owner setup code are configured. The ignored `.sites-runtime/vercel-secrets.json` is their local recovery copy; keep it private and move it to an encrypted vault.
- Turso database `freespeech-forum-db` is connected to production and development, with all four migrations applied. Resource ID: `store_8Zpou07vbfPaWvvG`. Selected plan: Starter ($0/month), region `iad1`. No paid database plan was selected.
- Production is live at https://freespeech-forum.vercel.app. Current launchpad deployment `dpl_DgKbyyczr6Jd3wshdatGv3DGdRLX` reached READY from code commit `f58bc6e`.

Anonymous production checks on September 25, 2026 (Pacific): homepage and login returned HTTP 200 without cookies or bypass credentials; `/api/forum/health` returned `ok: true`; bootstrap loaded database content; the session endpoint returned null; spoofed identity headers remained anonymous; an unauthenticated mutation was rejected.

## Migration details

Next.js replaces the Cloudflare-specific Vinext runtime. Turso/libSQL preserves the SQLite schema, prepared queries and atomic transaction batches. Private Vercel Blob replaces the managed R2 binding. Database migration `0002_talented_vertigo.sql` adds Better Auth's password/session tables.

Sign-in now uses email/password with Better Auth, private session cookies and database-backed rate limits. Email addresses are not verified in this early preview, and email/password recovery is not connected. Unverified email addresses cannot claim administrator access. The old Sites identity headers are ignored by the active authentication path.

For owner access, register normally, choose a public username, then open `/setup` and enter the private `OWNER_SETUP_CODE`. Only an eligible account with that code can become the first administrator; a later claim is rejected. Enroll an authenticator in Account → Staff tools afterward. Do not share the setup code with friends or include it in a public URL.

Uploads over 3 MB bypass Vercel Functions' request-size limit using a short-lived, path-specific private upload URL. Uploaded bytes are inspected on the server before becoming usable attachments. Temporary and final copies count toward the quota. Temporary copies are retained until maintenance (24 hours) so an unexpired upload URL cannot recreate an untracked object. Staff recovery also uploads directly and checks file metadata before restoring a missing object; existing objects are never overwritten.

Database backups use schema version 4 and include wallet mappings, launch records and private auth users/password hashes, but exclude sessions and verification tokens. Encrypt backups. Run the matching `scripts/restore-backup.py` when recovering them. Older Sites schema-2 backups require a deliberate import procedure, not replay into this database.

## Verification

```
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build
node tests/run-vercel.mjs
```

The test runner creates a fresh local SQLite file and uses disposable objects in this project's Blob store, cleaning them afterward. It passed real sign-up/sign-in/sign-out, spoofed header rejection, owner claims, member permissions, posts/comments/votes/notifications, staff TOTP, direct uploads, a video larger than 4.5 MB, range delivery, authenticated media backup, byte-for-byte large-video recovery, version-3 database backup contents and account deletion. Its CC0 MP4 fixture comes from the original checkout's ignored `.sites-runtime/test-flower.mp4`. Never point these tests at a live database. The sign-in/registration pages were also inspected in the browser at desktop and phone widths.

## Future deployments

Run these from this worktree with the signed-in Vercel CLI:

```
vercel env pull .env.local
node scripts/migrate-vercel.mjs
vercel --prod --yes
```

Inspect an existing resource before retrying provisioning after an uncertain result. Migrations keep a checksum journal and refuse changed applied migrations. The exact production domain comes from the deployment response; authentication uses Vercel's production-domain environment variable unless APP_ORIGIN is explicitly configured. Verify the homepage without Vercel cookies or a bypass token, check health, and confirm the sign-in page before sharing the canonical production URL.

Remaining external operations from the original project still apply: final policies/contact details, verified email delivery and recovery, offsite encrypted backups, scheduled maintenance, monitoring, billing alerts and optional domain. Vercel Blob and the existing Vercel account follow their provider usage/billing terms; the free Turso plan is not a promise that all hosting/storage usage is free.
