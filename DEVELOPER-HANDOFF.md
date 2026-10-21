# Developer handoff

Live site: https://freespeech-forum.vercel.app/
Repository: https://github.com/yakweb3/freespeech-launchpad
Base branch: main. Create a feature branch and submit a pull request.

## Start here

Follow README.md for Node, npm, local environment, migrations, and development commands. Use your own local SQLite or development Turso database and your own Blob store. Production credentials are not included. For access to the existing production deployment, the owner must invite you separately to GitHub/Vercel and provide service access securely.

## Current product

- The forum is the homepage. /forum redirects to / and retains query parameters.
- /launchpad provides the pump.fun launch workflow and token-room directory; /rooms/[mint] enforces token holdings on the server.
- The orange homepage banner offers token launching or free public community creation. Public communities require an authenticated, onboarded account to create; anyone can read them.
- Default sidebar topics: Memecoins, Crypto, Politics, Gaming, AI & Tech, Culture, Huzz, Racism.
- Logged-in members can create persisted topics; duplicate names are rejected. Topics scroll independently and Create topic stays at the bottom.
- Free communities are grouped under their selected topic. Memecoin example communities are previews, not live token rooms.
- Profile card: avatar, username, founder badge, upvotes received (excluding self-votes), created and joined counts.
- FreeSpeech market cap and holders are explicitly unavailable: no live FreeSpeech token data is connected.

## Code map

- components/forum.tsx: forum, sidebar, banner, profile card, topic and public-community dialogs.
- app/globals.css: shared styling and responsive overrides; inspect later overrides before changing earlier rules.
- server/queries.ts: bootstrap, feeds, profile statistics.
- server/mutations.ts: authenticated topic and public-community creation; existing posts and interactions.
- app/api/forum/[...path]/route.ts: API routing, mutation guards.
- server/launchpad.ts, server/wallet-auth.ts, server/room-access.ts: token launching, wallet authentication, access checks.
- lib/topics.ts: default topic names.
- drizzle/0004_forum_topics.sql and 0005_public_communities.sql: recent additive migrations. Both are applied to the current production database.

## Verification and deployment

Run npm run build and the isolated integration suites documented in README.md. Recent UI releases passed production builds. Topic/public-community checks covered authentication rejection, validation, persistence and creator auto-join using isolated SQLite fixtures. The topic endpoint was also verified to reject anonymous requests with HTTP 401. These checks do not substitute for a full authenticated browser test of the latest free-community flow.

Production project: freespeech-forum, Vercel team yakweb3-8425s-projects. Existing releases were deployed explicitly with Vercel CLI after pushing main; do not assume a GitHub push automatically deploys. Link only the intended project, apply migrations using node scripts/migrate-vercel.mjs, then deploy. Keep .env.local and .vercel untracked.

## Follow-up work

- Exercise the complete signed-in public-community/topic creation flow on an isolated deployment, including mobile scrolling with many topics.
- Topic-to-community grouping currently covers free communities; token rooms need equivalent topic assignment/discovery.
- Several Start a Community links still go straight to token launching. Consider a shared choice dialog for public versus token-gated creation.
- Search currently searches discussions; its label also mentions communities, so add community-name search results.
- The sidebar creation workflow adds public categories, but the right-hand FreeSpeech summary remains global rather than adapting to the selected community.
- Recent migrations were authored as SQL. Reconcile Drizzle schema declarations/snapshots before generating further migrations; do not modify applied SQL checksums.
- Extend backup/restore coverage for forum_topics and public_communities.
- Live mobile wallet approval and an actual paid mainnet launch still need owner validation. Token gating is based on holdings, not a friends-only invitation list.
- Review README.md's remaining operational setup items: email recovery, monitoring, backups and operator policies.

No production user data, credentials, uploads or wallet private keys are supplied in this repository.
