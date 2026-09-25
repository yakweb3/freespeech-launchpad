# FreeSpeech Forum

**Vercel migration checkout:** use [VERCEL-MIGRATION.md](VERCEL-MIGRATION.md) for the active platform, setup, test and deployment instructions. The Sites-specific notes below describe the original deployment and are retained as historical context.

A working Modern Orange forum built with React/Vinext, a Cloudflare Worker, D1 and R2. The main screen is a discussion feed with categories, voting, text/image/video posts, replies, saved/followed/muted discussions, profiles, notifications and moderation.

## Start locally

Private site: https://freespeech-orange-forum.allenramirez.chatgpt.site. Access remains owner-only. Sign in, choose a pseudonym, then open Account → Staff tools to enroll your own authenticator.

Install from the existing lockfile, copy `.env.example` to an ignored `.env`, configure the local administrator and staff encryption key, apply the committed migrations once, then run:

```
node scripts/run-framework.mjs dev
```

The workspace already has dependencies, local migrations and a configured local-only preview account. The development server is at `http://localhost:5173/`. The local sign-in mock is development-only; deployed identity comes from Sites/ChatGPT.

## Verify

```
node node_modules/typescript/bin/tsc --noEmit
node tests/media-validation.mjs
node scripts/run-framework.mjs build
node tests/run-isolated.mjs
```

The preferred repeatable integration check is `tests/run-isolated.mjs`: it starts the compiled Worker on loopback port 5174 with a new isolated database/bucket and explicit test identities, exercises multi-member workflows and media recovery, then stops its process tree. Do not run it concurrently with a build on Windows. It never uses the hosted database.

The older integration scripts operate on the local development database and enforce real rate limits. `local-api.mjs` sets up the local test profile. `staff-security.mjs` enrolls that profile in a test authenticator, saved only in ignored local state. `extended-api.mjs` exercises support, exports and staff actions. `final-local-check.mjs` records a one-time browser-created picture/video fixture verification; create matching local fixtures before rerunning it. These are development checks, not production traffic or a scheduled test suite.

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for requirement-level evidence and unfinished launch work. See [OPERATIONS.md](OPERATIONS.md) for environment setup, security, backups, recovery, maintenance and deployment. [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) separates implementation checks from owner decisions.

## Intentional MVP limits

- Sign-in uses ChatGPT. Independent email/password registration and recovery require a separately selected provider.
- Pictures are compressed JPEGs; short videos must already be H.264 MP4. No transcoding, livestreaming or long-video pipeline.
- No DMs, real-time chat, native apps, ads, subscriptions, badges, polls or member-created communities.
- Terms, privacy, age policy, retention and operator details are initial drafts requiring owner review before opening the community publicly.
- In-app notifications work independently of email. External email credentials, scheduling, monitoring, independent backups and a custom domain remain deployment/operations choices.

Original starter discussion image was generated for this project; it is labelled as a starter image. The MDN CC0 flower video was used only for local playback testing and is not a production seed.
