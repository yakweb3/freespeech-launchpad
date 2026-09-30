# FreeSpeech — Solana Token Communities

A Solana launchpad with a forum room for every token launched through the app. Creators launch through pump.fun; holders unlock discussions, pictures, videos and replies.

**Live app:** https://freespeech-forum.vercel.app

## Features

- Wallet login with signed, one-use challenges, plus email/password accounts.
- Wallet-approved pump.fun token creation and automatic rooms after finalized transactions.
- Public room previews with server-enforced token gates for discussions and attachments.
- Creator moderation, reporting, appeals and protected platform staff tools.
- Posts, nested replies, images, short MP4 videos, votes, search and notifications.
- Retry-safe launch confirmation, including recovery after the browser closes.

Built with Next.js, React, TypeScript, Turso/libSQL, private Vercel Blob, Wallet Standard and the official pump.fun SDK.

## Run locally

Use Node.js 22.13 or newer and npm. From the repository root:

```sh
npm ci
node -e "require('node:fs').mkdirSync('.sites-runtime', { recursive: true }); require('node:fs').copyFileSync('.env.example', '.env.local')"
```

Edit `.env.local` before starting:

| Variable | Local setup |
| --- | --- |
| `TURSO_DATABASE_URL` | `file:.sites-runtime/dev.db`, or your own Turso database URL |
| `TURSO_AUTH_TOKEN` | Required for a remote Turso database; leave blank for local SQLite |
| `APP_ORIGIN` | `http://localhost:5175` |
| `BETTER_AUTH_SECRET` | A new random secret for this installation |
| `STAFF_ENCRYPTION_KEY` | A separate random 32-byte key, encoded as Base64 |
| `OWNER_SETUP_CODE` | A separate private random code for claiming the first administrator |
| `BLOB_READ_WRITE_TOKEN` | A token for your own private Vercel Blob store; required for media |
| `SOLANA_RPC_URL` | A trusted Solana mainnet RPC endpoint; the example uses the public endpoint |
| `CRON_SECRET` | A separate random secret if running scheduled launch confirmation |

Generate each secret separately with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Never commit the resulting values.

```sh
node scripts/migrate-vercel.mjs
npm run dev
```

Open http://localhost:5175. The public forum is at `/forum`. To become the first administrator, create an account, finish your profile, visit `/setup`, and enter your private setup code. Enroll your own authenticator afterward.

**The interactive launch flow uses real Solana mainnet transactions.** A wallet approval can spend SOL and create an irreversible token. Use the isolated test suite below for testing without sending transactions.

## Verification

```sh
npm run build
node tests/run-launchpad.mjs
```

The launchpad suite creates an isolated SQLite database and a localhost RPC fixture, uses real cryptographic signatures, and sends no on-chain transactions. It checks authorization, transaction tampering, private content access, creator moderation, recovery and schema-4 database restoration. Python 3 is required for the restore check. Ports 5175 and 5176 must be free.

The existing forum/media integration suite requires your own private Blob test store and the MDN CC0 flower video at `.sites-runtime/test-flower.mp4`:

```sh
node scripts/prepare-test-video.mjs
node tests/run-vercel.mjs
```

This suite uses disposable real Blob objects and cleans them afterward. It can incur provider usage. Never point integration tests at a live database.

## Deployment and implementation

- [Launchpad architecture and test boundaries](LAUNCHPAD.md)
- [Vercel configuration and operations](VERCEL-MIGRATION.md)
- [Environment variable template](.env.example)

Deploy with your own Vercel project, database and private Blob store. Apply database migrations before deployment and configure production environment variables. `vercel.json` defines a five-minute recovery cron protected by `CRON_SECRET`.

Some files retain the original Sites/Cloudflare implementation for historical context. The active app uses Next.js, Turso and Vercel Blob. Historical documents are marked accordingly.

## Current limits

Real mobile wallet approval and a paid mainnet launch still require live validation by a wallet owner. On mobile, open the app inside a compatible wallet's browser if no wallet is detected. Trading happens on pump.fun; token creation does not include an initial buy. Token metadata is hosted by this app, so its domain and storage must remain available.

Email verification/password recovery, independent scheduled backups, operational monitoring and final operator policy details remain setup work. This repository contains source code, not production credentials, database contents, user uploads or wallet private keys.
