import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { del } from "@vercel/blob";
import ts from "typescript";
const origin = "http://127.0.0.1:5175",
  cookies = {},
  users = {};
assert.match(
  process.env.TURSO_DATABASE_URL,
  /^file:\.sites-runtime\/vercel-test-[\w-]+\.db$/,
);
const db = createClient({ url: process.env.TURSO_DATABASE_URL });
function saveCookies(who, response) {
  const jar = new Map(
    (cookies[who] || "")
      .split("; ")
      .filter(Boolean)
      .map((v) => [v.slice(0, v.indexOf("=")), v]),
  );
  for (const value of response.headers.getSetCookie()) {
    const v = value.split(";")[0];
    jar.set(v.slice(0, v.indexOf("=")), v);
  }
  cookies[who] = [...jar.values()].join("; ");
}
async function request(who, path, data, expected = 200, prefix = "forum") {
  const r = await fetch(origin + "/api/" + prefix + "/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      cookie: cookies[who] || "",
      Origin: origin,
      "x-forum-request": "1",
      "Content-Type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await r.json();
  assert.equal(r.status, expected, path + ": " + JSON.stringify(result));
  saveCookies(who, r);
  return result;
}
const password = "Local-fixture-only!" + crypto.randomUUID();
try {
  const spoof = await fetch(origin + "/api/forum/bootstrap", {
    headers: {
      "oai-authenticated-user-id": "owner",
      "oai-authenticated-user-email": "owner@example.com",
    },
  });
  assert.equal((await spoof.json()).user, null);
  for (const who of ["admin", "bob", "carol"]) {
    const signup = await request(
      who,
      "sign-up/email",
      { email: who + "@forum.test", password, name: "Test " + who },
      200,
      "auth",
    );
    users[who] = "auth_" + signup.user.id;
    await request(who, "bootstrap");
    await request(who, "profile", {
      username: "test_" + who,
      display_name: who,
      bio: "Local migration verification",
      accept_rules: true,
      role: "admin",
    });
    assert.equal((await request(who, "bootstrap")).user.role, "member");
  }
  await request(
    "anon",
    "sign-in/email",
    { email: "bob@forum.test", password: "Wrong-password!" },
    401,
    "auth",
  );
  await request("bob", "sign-out", {}, 200, "auth");
  assert.equal((await request("bob", "bootstrap")).user, null);
  await request(
    "bob",
    "sign-in/email",
    { email: "bob@forum.test", password },
    200,
    "auth",
  );
  await request("admin", "owner-setup", { code: "invalid" }, 403);
  await request("admin", "owner-setup", { code: process.env.OWNER_SETUP_CODE });
  await request(
    "carol",
    "owner-setup",
    { code: process.env.OWNER_SETUP_CODE },
    409,
  );
  const post = crypto.randomUUID();
  await request("bob", "posts", {
    id: post,
    title: "Vercel migration test discussion",
    body: "Hello @test_carol",
    category: "general",
  });
  await request(
    "carol",
    "edit-post",
    { id: post, title: "Must fail", body: "Not the author" },
    403,
  );
  await request("carol", "comments", {
    id: crypto.randomUUID(),
    post_id: post,
    body: "Test reply",
  });
  assert((await request("bob", "notifications")).notifications.length > 0);
  await request("carol", "vote", { post_id: post, value: 1 });
  assert.equal((await request("bob", "posts/" + post)).post.score, 1);
  const setup = await request("admin", "staff-setup", {});
  const compiled = ts.transpileModule(await readFile("lib/totp.ts", "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  const { totp } = await import(
    "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
  );
  await request("admin", "staff-verify", {
    code: await totp(setup.secret, Math.floor(Date.now() / 30000)),
  });
  await request("admin", "staff");
  await request("bob", "staff", undefined, 403);
  const image = await readFile("public/media/neighborhood.png");
  const begin = await request("bob", "upload-begin", {
    mime: "image/png",
    bytes: image.length,
  });
  const put = await fetch(begin.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: image,
  });
  assert.equal(
    put.ok,
    true,
    "direct upload: " + put.status + " " + (await put.text()),
  );
  await request("carol", "upload-finish", { id: begin.id }, 404);
  const uploaded = await request("bob", "upload-finish", { id: begin.id });
  assert.equal(
    (await request("bob", "upload-finish", { id: begin.id })).media.id,
    uploaded.media.id,
  );
  assert.equal((await fetch(origin + uploaded.media.url)).status, 404);
  const picturePost = crypto.randomUUID();
  await request("bob", "posts", {
    id: picturePost,
    title: "Picture upload migration check",
    body: "Private validation before publishing",
    category: "general",
    media_ids: [uploaded.media.id],
  });
  const publicImage = await fetch(origin + uploaded.media.url);
  assert.equal(publicImage.status, 200);
  const bytes = Buffer.from(await publicImage.arrayBuffer());
  assert(bytes.length > 0);
  const range = await fetch(origin + uploaded.media.url, {
    headers: { Range: "bytes=0-99" },
  });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 100);
  const backup = await fetch(
    origin + "/api/forum/backup-media/" + uploaded.media.id,
    { headers: { cookie: cookies.admin } },
  );
  assert.equal(backup.status, 200);
  assert.deepEqual(Buffer.from(await backup.arrayBuffer()), bytes);
  const clip = await readFile("../forum/.sites-runtime/test-flower.mp4");
  const padding = Buffer.alloc(5 * 1048576);
  padding.writeUInt32BE(padding.length, 0);
  padding.write("free", 4);
  const video = Buffer.concat([clip, padding]);
  const videoBegin = await request("bob", "upload-begin", {
    mime: "video/mp4",
    bytes: video.length,
  });
  const videoPut = await fetch(videoBegin.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: video,
  });
  assert(videoPut.ok, "Large direct video upload failed: " + videoPut.status);
  const videoResult = await request("bob", "upload-finish", {
    id: videoBegin.id,
  });
  assert(videoResult.media.bytes > 4.5 * 1048576);
  assert(videoResult.media.duration > 0);
  await request("bob", "posts", {
    id: crypto.randomUUID(),
    title: "Large direct video migration check",
    body: "Exceeds the Vercel function request limit",
    category: "general",
    media_ids: [videoResult.media.id],
  });
  const videoRange = await fetch(origin + videoResult.media.url, {
    headers: { Range: "bytes=0-99" },
  });
  assert.equal(videoRange.status, 206);
  assert.equal((await videoRange.arrayBuffer()).byteLength, 100);
  const settings = (values) =>
    request("admin", "moderate", {
      action: "settings",
      target_type: "settings",
      target_id: "community",
      values,
      reason: "Isolated recovery verification.",
    });
  await settings({ posting_open: "0", uploads_open: "0" });
  await request("admin", "restore-begin", { id: videoResult.media.id }, 409);
  const videoRow = (
    await db.execute({
      sql: "SELECT object_key FROM media WHERE id=?",
      args: [videoResult.media.id],
    })
  ).rows[0];
  await del(videoRow.object_key, { token: process.env.BLOB_READ_WRITE_TOKEN });
  const recovery = await request("admin", "restore-begin", {
    id: videoResult.media.id,
  });
  const recoveryUpload = await fetch(recovery.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: video,
  });
  assert(recoveryUpload.ok);
  await request(
    "carol",
    "restore-media/" + videoResult.media.id,
    { staging_id: recovery.id },
    403,
  );
  await request("admin", "restore-media/" + videoResult.media.id, {
    staging_id: recovery.id,
  });
  const recoveredVideo = await fetch(origin + videoResult.media.url);
  assert.equal(recoveredVideo.status, 200);
  assert.deepEqual(Buffer.from(await recoveredVideo.arrayBuffer()), video);
  await settings({ posting_open: "1", uploads_open: "1" });
  const databaseBackup = await request("admin", "backup");
  assert.equal(databaseBackup.schema, 4);
  assert(databaseBackup.tables.auth_user.length === 3);
  assert(!databaseBackup.tables.auth_session);
  await request("bob", "delete-account", { confirm: "test_bob" });
  assert.equal((await request("bob", "bootstrap")).user, null);
  assert.equal((await fetch(origin + uploaded.media.url)).status, 404);
  assert.equal(
    (
      await db.execute({
        sql: "SELECT id FROM auth_user WHERE id=?",
        args: [users.bob.slice(5)],
      })
    ).rows.length,
    0,
  );
  console.log(
    "PASS: Vercel Next.js build, real password/session auth, spoofed identity denial, one-time owner claim, author permissions, posts/comments/votes/notifications, staff TOTP, signed private uploads including a video over 4.5 MB, finalization ownership/idempotency, public media, range streaming, backups and complete account deletion.",
  );
} finally {
  const rows = await db.execute(
    "SELECT object_key FROM media WHERE object_key NOT LIKE 'asset:%'",
  );
  for (const row of rows.rows) {
    assert.match(row.object_key, /^(uploads|staging|recovery)\/auth_/);
    await del(row.object_key, { token: process.env.BLOB_READ_WRITE_TOKEN });
  }
  db.close();
}
