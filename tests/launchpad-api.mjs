import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
const origin = "http://127.0.0.1:5175";
assert.match(
  process.env.TURSO_DATABASE_URL,
  /^file:\.sites-runtime\/launchpad-test-[\w-]+\.db$/,
);
assert.equal(process.env.SOLANA_RPC_URL, "http://127.0.0.1:5176");
const db = createClient({ url: process.env.TURSO_DATABASE_URL }),
  jars = {},
  keys = { alice: Keypair.generate(), bob: Keypair.generate() };
async function req(who, path, data, expected = 200, prefix = "launchpad") {
  const r = await fetch(origin + "/api/" + prefix + "/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      cookie: jars[who] || "",
      Origin: origin,
      "x-forum-request": "1",
      "Content-Type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const j = await r.json();
  assert.equal(r.status, expected, path + ": " + JSON.stringify(j));
  const cookie = r.headers
    .getSetCookie()
    .find((c) => c.startsWith("forum-wallet="));
  if (cookie) jars[who] = cookie.split(";")[0];
  return j;
}
const sql = (query, ...args) => db.execute({ sql: query, args });
const control = (data) =>
  fetch("http://127.0.0.1:5176/control", {
    method: "POST",
    body: JSON.stringify(data),
  });
const sign = (key, message) =>
  bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(message), key.secretKey),
  );
try {
  const c = await req("alice", "challenge", {
    address: keys.alice.publicKey.toBase58(),
  });
  await req(
    "alice",
    "verify",
    { id: c.id, signature: sign(keys.bob, c.message) },
    401,
  );
  await req(
    "alice",
    "verify",
    { id: c.id, signature: sign(keys.alice, c.message + "changed") },
    401,
  );
  await req("alice", "verify", {
    id: c.id,
    signature: sign(keys.alice, c.message),
  });
  await req(
    "anon",
    "verify",
    { id: c.id, signature: sign(keys.alice, c.message) },
    401,
  );
  const b = await req("bob", "challenge", {
    address: keys.bob.publicKey.toBase58(),
  });
  await req("bob", "verify", {
    id: b.id,
    signature: sign(keys.bob, b.message),
  });
  for (const who of ["alice", "bob"])
    await req(
      who,
      "profile",
      { username: "token_" + who, display_name: who, accept_rules: true },
      200,
      "forum",
    );
  const alice = (await req("alice", "session")).user,
    bob = (await req("bob", "session")).user;
  assert.equal(alice.role, "member");
  const challenge = await req("alice", "challenge", {
    address: keys.bob.publicKey.toBase58(),
  });
  await req(
    "alice",
    "verify",
    { id: challenge.id, signature: sign(keys.bob, challenge.message) },
    409,
  );
  const image = crypto.randomUUID();
  await sql(
    "INSERT INTO media (id,owner_id,object_key,mime,kind,bytes,status,created_at) VALUES (?,?,?,'image/png','image',100,'pending',?)",
    image,
    alice.id,
    "asset:/favicon.svg",
    Date.now(),
  );
  const payload = {
    name: "Fixture community",
    symbol: "FIX",
    description: "An isolated launch test community",
    minimum: "1",
    image_id: image,
  };
  await req("anon", "prepare", payload, 401);
  await req("alice", "prepare", { ...payload, minimum: "0" }, 400);
  const launch = await req("alice", "prepare", payload);
  assert.equal((await req("anon", "rooms")).rooms.length, 0);
  assert.equal((await req("anon", "metadata/" + launch.id)).name, payload.name);
  const unsigned = Transaction.from(Buffer.from(launch.transaction, "base64"));
  assert(
    unsigned.instructions.some(
      (i) =>
        i.programId.toBase58() ===
        "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    ),
  );
  assert.equal(unsigned.feePayer.toBase58(), keys.alice.publicKey.toBase58());
  const tampered = Transaction.from(Buffer.from(launch.transaction, "base64"));
  tampered.add(
    SystemProgram.transfer({
      fromPubkey: keys.alice.publicKey,
      toPubkey: keys.bob.publicKey,
      lamports: 1,
    }),
  );
  tampered.partialSign(keys.alice);
  await req(
    "alice",
    "submit",
    {
      id: launch.id,
      transaction: tampered
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64"),
    },
    400,
  );
  unsigned.partialSign(keys.alice);
  const transaction = unsigned.serialize().toString("base64");
  await req("bob", "submit", { id: launch.id, transaction }, 404);
  await control({ failSendOnce: true });
  const submitted = await req("alice", "submit", {
    id: launch.id,
    transaction,
  });
  assert.equal(
    (await req("alice", "submit", { id: launch.id, transaction })).signature,
    submitted.signature,
  );
  assert.equal((await req("alice", "confirm", { id: launch.id })).ready, false);
  assert.equal((await req("anon", "rooms")).rooms.length, 0);
  await control({ finalized: true, fail: true });
  await req("alice", "confirm", { id: launch.id }, 409);
  assert.equal((await req("anon", "rooms")).rooms.length, 0);
  await control({ fail: false });
  await sql("UPDATE launches SET status='submitted' WHERE id=?", launch.id);
  assert.equal((await fetch(origin + "/api/cron/launches")).status, 401);
  const cron = await fetch(origin + "/api/cron/launches", {
    headers: { authorization: "Bearer " + process.env.CRON_SECRET },
  });
  assert.equal(cron.status, 200);
  assert.equal((await cron.json()).confirmed, 1);
  await req("alice", "confirm", { id: launch.id });
  const rooms = (await req("anon", "rooms")).rooms;
  assert.equal(rooms.length, 1);
  const room = rooms[0],
    postId = crypto.randomUUID();
  await req("anon", "access/" + room.mint, undefined, 401);
  await control({ balance: "999999" });
  await req("bob", "access/" + room.mint, undefined, 403);
  await req(
    "bob",
    "posts",
    {
      id: postId,
      title: "Private fixture discussion",
      body: "Gated body marker",
      category: room.category,
    },
    403,
    "forum",
  );
  await control({ balance: "1000000" });
  await req("alice", "access/" + room.mint);
  await req(
    "alice",
    "posts",
    {
      id: postId,
      title: "Private fixture discussion",
      body: "Gated body marker @token_bob",
      category: room.category,
    },
    200,
    "forum",
  );
  assert.equal(
    (
      await req(
        "alice",
        "posts?category=" + room.category,
        undefined,
        200,
        "forum",
      )
    ).posts.length,
    1,
  );
  await req("anon", "posts/" + postId, undefined, 401, "forum");
  const m = crypto.randomUUID(),
    thumbnail = crypto.randomUUID();
  for (const [id, kind] of [
    [m, "attached"],
    [thumbnail, "thumbnail"],
  ])
    await sql(
      "INSERT INTO media (id,owner_id,object_key,mime,kind,bytes,status,post_id,created_at) VALUES (?,?,?,'image/png','image',100,?,?,?)",
      id,
      alice.id,
      "asset:/favicon.svg?fixture=" + id,
      kind,
      postId,
      Date.now(),
    );
  for (const id of [m, thumbnail]) {
    const r = await fetch(origin + "/api/forum/media/" + id);
    assert.equal(r.status, 401);
  }
  assert(
    !(await req("anon", "posts?q=Gated", undefined, 200, "forum")).posts.length,
  );
  assert(
    !(await req("bob", "posts?author=token_alice", undefined, 200, "forum"))
      .posts.length,
  );
  const inbox = await req("bob", "notifications", undefined, 200, "forum");
  assert(!JSON.stringify(inbox).includes("Private fixture discussion"));
  const commentId = crypto.randomUUID();
  await req(
    "bob",
    "manage",
    { mint: room.mint, action: "lock-room", reason: "Fixture restriction" },
    403,
  );
  await req("alice", "manage", {
    mint: room.mint,
    action: "lock-room",
    reason: "Fixture restriction",
  });
  await req(
    "bob",
    "comments",
    { id: commentId, post_id: postId, body: "Holder reply" },
    403,
    "forum",
  );
  await req("alice", "manage", {
    mint: room.mint,
    action: "unlock-room",
    reason: "Fixture restriction lifted",
  });
  await req(
    "alice",
    "manage",
    {
      mint: room.mint,
      action: "remove-post",
      id: crypto.randomUUID(),
      reason: "Outside this room",
    },
    404,
  );
  await req(
    "bob",
    "comments",
    { id: commentId, post_id: postId, body: "Holder reply" },
    200,
    "forum",
  );
  await control({ balance: "0" });
  await req("alice", "posts/" + postId, undefined, 403, "forum");
  await req(
    "alice",
    "posts?category=" + room.category,
    undefined,
    403,
    "forum",
  );
  await req("bob", "vote", { post_id: postId, value: 1 }, 403, "forum");
  await req(
    "bob",
    "edit-comment",
    { id: commentId, body: "Changed" },
    403,
    "forum",
  );
  await req("alice", "manage", {
    mint: room.mint,
    action: "remove-comment",
    id: commentId,
    reason: "Creator moderation fixture",
  });
  assert.equal(
    (await sql("SELECT status FROM comments WHERE id=?", commentId)).rows[0]
      .status,
    "removed",
  );
  const mediaDenied = await fetch(origin + "/api/forum/media/" + m, {
    headers: { cookie: jars.alice },
  });
  assert.equal(mediaDenied.status, 403);
  await control({ unavailable: true });
  await req("alice", "access/" + room.mint, undefined, 503);
  await control({ unavailable: false, balance: "1000000" });
  await req("alice", "logout", {});
  assert.equal((await req("alice", "session")).user, null);
  await req("bob", "delete-account", { confirm: "token_bob" }, 200, "forum");
  assert.equal((await req("bob", "session")).user, null);
  const tables = ['auth_user','auth_account','users','categories','posts','comments','votes','bookmarks','preferences','reads','media','notifications','reports','tickets','audit_log','settings','recovery_codes','wallets','launches','token_rooms'];
  const snapshot = { format: 'freespeech-backup-v1', schema: 4, tables: {} };
  for (const table of tables) snapshot.tables[table] = (await sql('SELECT * FROM ' + table)).rows;
  const backupFile = process.env.TURSO_DATABASE_URL.slice(5) + '.backup.json';
  writeFileSync(backupFile, JSON.stringify(snapshot));
  const restore = spawnSync('python', ['scripts/restore-backup.py', backupFile, backupFile + '.restored.db'], { encoding: 'utf8', windowsHide: true });
  assert.equal(restore.status, 0, restore.stdout + restore.stderr);
  console.log('PASS: schema-4 database restore with wallet mappings, launch records, token rooms and foreign-key integrity.');
  console.log(
    "PASS: real Ed25519 wallet signatures, replay/tamper/wallet-link denial; official pump.fun instruction; signed-message transaction binding; failed and unfinalized launches denied; retry-safe room creation; exact holder threshold; search/notification/media/thumbnail privacy; selling and RPC outage fail closed; logout and deletion revoke access. No on-chain transaction sent.",
  );
} finally {
  db.close();
}
