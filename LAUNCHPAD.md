# Solana launchpad

Live: https://freespeech-forum.vercel.app. Deployed code `f58bc6e`, deployment `dpl_DgKbyyczr6Jd3wshdatGv3DGdRLX`, verified September 27, 2026 (Pacific). Anonymous homepage, mainnet connectivity and forum health passed; anonymous launch/cron requests were denied; authenticated confirmation worker returned successfully. No live token was created during testing.

The homepage is the launchpad. The original public forum remains at `/forum`; existing discussion, profile, policy and support links still work. Existing accounts and posts are retained.

## Launch and access

- Wallet Standard wallets sign a one-use, origin-bound message. Five-minute challenges and 24-hour HttpOnly sessions are verified with Ed25519. Email members can link a wallet while logged in. A wallet already linked to another account cannot be claimed. No wallet private keys or seed phrases are requested or stored.
- Creators complete their profile and supply a public logo, name, symbol, description and fixed minimum holding. The official `@pump-fun/pump-sdk` builds a `createV2Instruction` for a regular SOL-paired Token-2022 coin. No initial buy, holder rewards mode, mayhem mode or custom fee is included. The creator is the transaction payer and on-chain creator.
- The wallet signs the prepared transaction. The server verifies every signature and requires the serialized message to exactly match its stored intent. Signed bytes and signature are persisted before broadcasting for safe retries.
- Only a successful finalized transaction matching that message/signature creates a room. Unique mint/launch/category keys make confirmation idempotent. Failed and unfinalized transactions do not create rooms.
- The open tab polls confirmation. A secret-authenticated Vercel cron checks up to five submitted launches every five minutes, recovering launches after the tab closes. My launches also offers manual recovery and explorer links.
- Room introductions and token metadata/logos are public. Reading posts, comments, pictures, video ranges or thumbnails, and participating, requires a verified wallet with the configured holding. Exact integer balances sum the wallet's accounts for the exact mint. Every protected API request checks confirmed chain state. The room screen also checks every 30 seconds and on visibility changes. RPC failures deny access. Creators need the same holding to read discussions.
- General feeds, author searches and global search exclude room posts. Explicit room searches require access. Notifications use generic private-discussion titles. Room posts cannot move into public categories or another room.
- Creators can lock/reopen their room, lock/unlock discussions and remove posts/comments within their room, with reasons and audit entries. They gain no platform staff powers. Reports, platform moderation, appeals and TOTP-protected staff access remain.

## Operations

Migration `0003_dusty_valeria_richards` only adds tables/indexes. Backups are schema 4 and include wallet mappings, launches and rooms; challenges/sessions are excluded. Use the matching restore script. Metadata is hosted by this app: preserve its domain, database and logo storage. Account deletion removes hosted media but cannot erase on-chain tokens or transaction history.

`SOLANA_RPC_URL` optionally selects a trusted mainnet RPC provider; the default is Solana's public endpoint. Public RPC limits are not a scaling guarantee. `/api/launchpad/network` checks connectivity without signing or sending a transaction. A dedicated provider is a future operational upgrade if traffic requires it.

`CRON_SECRET` authenticates `/api/cron/launches` and is configured as a production secret. Its recovery copy is in ignored `.sites-runtime/vercel-secrets.json`; never publish that file. The cron only processes already-signed intents. It never constructs purchases or new launches. General media cleanup, backups and email setup remain separate operational work.

## Verification and limits

- Next.js production build and TypeScript pass.
- `node tests/run-launchpad.mjs` uses an isolated database and localhost RPC fixture, real cryptographic signatures and official SDK instructions. Covers invalid/replayed signatures, wallet linking boundaries, transaction tampering, wrong owners, failed/unfinalized launches, cron authentication and automatic confirmation, idempotency, precise balance thresholds, private media/thumbnail/search/notification handling, selling, RPC outages, creator moderation scope, logout, deletion and a schema-4 database restore with foreign-key integrity. **These tests send no on-chain transactions.**
- `node tests/run-vercel.mjs` passes existing password/session, staff TOTP, posting/notifications, real private Blob image/video upload, range delivery, media recovery and account deletion checks with schema 4.
- Browser: desktop launchpad and 390px phone view inspected; 320px locked room has no horizontal overflow or private discussion text; missing-wallet instructions work; no console errors in inspected pages.
- Real mobile wallet approval and a paid mainnet launch have not been performed by the agent. The first live launch needs its creator's wallet and SOL. On mobile, use a compatible wallet's browser if Safari/Chrome cannot detect it. There is no native mobile app, integrated trading UI, guaranteed token value, or automatic import of unrelated external pump.fun launches.

Official references: [pump.fun coin creation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md), [Solana token accounts](https://solana.com/docs/rpc/http/gettokenaccountsbyowner).
