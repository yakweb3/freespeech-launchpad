# Launch checklist

**Vercel branch:** the deployment is pending database terms acceptance. See [VERCEL-MIGRATION.md](VERCEL-MIGRATION.md). The original Sites deployment checks below do not establish a successful Vercel deployment.

## Implemented and locally checked

- [x] Modern Orange desktop feed and phone-width layout; no horizontal overflow at 390px.
- [x] Real D1 persistence for members, posts, replies, votes, bookmarks and preferences.
- [x] Pseudonymous profiles, private email fields, profile settings and export controls.
- [x] Text, pictures and short MP4s; compression, metadata removal, thumbnails, playback and range streaming.
- [x] Anonymous mutation denial, cross-origin/CSRF checks, parameterized queries, role checks, upload validation and limits.
- [x] Staff authenticator verification, replay rejection, recovery codes, expiring/revocable staff sessions.
- [x] Reports, support/appeals, staff responses, remove/restore, lock/unlock and an audit log.
- [x] Backup export and restore into a new SQLite database, with foreign-key and integrity checks.
- [x] Worker/browser production build and TypeScript checks.
- [x] Browser composer: picture and video publishing, thumbnail generation, and complete video playback without a player error.
- [x] Structured search tool registered and exercised in the browser.
- [x] Isolated multi-member suite: notifications, preferences, categories, restrictions/appeals, role boundaries, account deletion and one-use recovery codes.
- [x] Administrator media downloads and missing-file recovery; byte-for-byte isolated restore verified, overwrites denied.
- [x] Draft Undo and Escape dismissal; compact header inspected at 320px.

## Remaining verification / publication

- [x] Initial saved source version successfully deployed privately; URL recorded in README and OPERATIONS. Check the final refinement deployment result in Sites.
- [x] Hosting service reported initial production deployment success with configured environment revision 1. The final release must apply revision 2 (canonical origin).
- [x] Broader isolated interaction audit passed for categories, restrictions, ordinary-member deletion and in-app notification delivery.
- [ ] Verify the owner can complete the first production sign-in and authenticator enrollment. This is an ordinary owner onboarding step; do not enroll an authenticator on the owner's behalf.

## Owner/external launch decisions — skipped while implementation continues

- [ ] Review and finalize jurisdiction, operator identity/contact, age/adult-content rules, privacy, terms, retention, and appeal handling commitments.
- [ ] Select/configure independent email/password authentication if ChatGPT sign-in is not the intended long-term login.
- [ ] Configure a verified email sender and API credentials; send a real delivery test before enabling email notifications.
- [ ] Choose public/community access. The Site is owner-private by default.
- [ ] Connect a custom domain/DNS if wanted.
- [ ] Establish an independent encrypted database AND media backup destination and a separately protected encryption-key vault. Local database/media recovery drills passed; schedule and verify backups for the live service.
- [ ] Configure a persistent maintenance schedule, uptime monitoring and billing alerts.
- [ ] Assign additional trusted moderators, enroll their authenticators, and review permissions.

Passing local tests is not evidence that these external setup items are complete. Do not describe the forum as ready for unrestricted public launch until they are resolved.
