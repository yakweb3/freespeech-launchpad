import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { spawnSync } from "node:child_process";
import { resolve, dirname, basename } from "node:path";
const origin = "http://127.0.0.1:5174",
  cookies = {};
const actors = {
  admin: { id: "qa_admin_env", email: "admin@sites.test" },
  bob: { id: "qa_member_b", email: "bob@sites.test" },
  carol: { id: "qa_member_c", email: "carol@sites.test" },
  newcomer: { id: "qa_newcomer", email: "new@sites.test" },
};
function headers(who, mutation = false) {
  const u = actors[who];
  return {
    ...(u
      ? {
          "oai-authenticated-user-id": u.id,
          "oai-authenticated-user-email": u.email,
        }
      : {}),
    ...(cookies[who] ? { cookie: cookies[who] } : {}),
    ...(mutation
      ? {
          "Content-Type": "application/json",
          "x-forum-request": "1",
          Origin: origin,
        }
      : {}),
  };
}
async function api(who, path, data, expected = 200) {
  const response = await fetch(origin + "/api/forum/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: headers(who, data !== undefined),
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await response.json();
  assert.equal(response.status, expected, path + ": " + JSON.stringify(value));
  const set = response.headers.getSetCookie();
  if (set.length) cookies[who] = set.map((s) => s.split(";")[0]).join("; ");
  return value;
}
for (const who of ["admin", "bob", "carol"]) {
  await api(who, "bootstrap");
  await api(who, "profile", {
    username: "qa_" + who,
    display_name: "QA " + who,
    bio: "Isolated verification fixture.",
    accept_rules: true,
    role: "admin",
  });
}
assert.equal((await api("admin", "bootstrap")).user.role, "admin");
assert.equal((await api("bob", "bootstrap")).user.role, "member");
const source = ts.transpileModule(await readFile("lib/totp.ts", "utf8"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { totp } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
const setup = await api("admin", "staff-setup", {});
const verified = await api("admin", "staff-verify", {
  code: await totp(setup.secret, Math.floor(Date.now() / 30000)),
});
assert.equal(verified.recoveryCodes.length, 8);
await api("bob", "staff", undefined, 403);
cookies.bob = cookies.admin;
await api("bob", "staff", undefined, 403);
delete cookies.bob;
const post = crypto.randomUUID();
await api("bob", "posts", {
  id: post,
  title: "Isolated discussion workflow check",
  body: "A hello to @qa_carol and the community.",
  category: "general",
});
assert(
  (await api("carol", "notifications")).notifications.some(
    (n) => n.kind === "mention",
  ),
);
const reply = crypto.randomUUID();
await api("carol", "comments", {
  id: reply,
  post_id: post,
  body: "A thoughtful first reply.",
});
assert(
  (await api("bob", "notifications")).notifications.some(
    (n) => n.kind === "reply",
  ),
);
await api(
  "carol",
  "edit-post",
  { id: post, title: "Attempted takeover", body: "Must fail." },
  403,
);
await api("carol", "delete-post", { id: post }, 403);
await api("bob", "preference", {
  kind: "mute_user",
  target: "auth_qa_member_c",
  enabled: true,
});
const before = (await api("bob", "notifications")).notifications.length;
await api("carol", "comments", {
  id: crypto.randomUUID(),
  post_id: post,
  body: "Muted notification should not arrive.",
});
assert.equal((await api("bob", "notifications")).notifications.length, before);
await api("bob", "preference", {
  kind: "mute_user",
  target: "auth_qa_member_c",
  enabled: false,
});
await api("bob", "notification-settings", {
  notify_replies: false,
  notify_mentions: false,
  notify_followed: false,
  email_notifications: false,
});
await api("carol", "comments", {
  id: crypto.randomUUID(),
  post_id: post,
  body: "Preferences suppress this notification.",
});
assert.equal((await api("bob", "notifications")).notifications.length, before);
await api("carol", "preference", {
  kind: "follow_post",
  target: post,
  enabled: true,
});
await api("bob", "comments", {
  id: crypto.randomUUID(),
  post_id: post,
  body: "A follow notification for Carol.",
});
assert(
  (await api("carol", "notifications")).notifications.some(
    (n) => n.kind === "follow",
  ),
);
await api("carol", "read-notifications", {});
assert.equal((await api("carol", "bootstrap")).unread, 0);
await api("carol", "read", { post_id: post, last_comment: reply });
assert(
  !(await api("carol", "posts?filter=unread")).posts.some((p) => p.id === post),
);
const mod = (data) =>
  api("admin", "moderate", {
    ...data,
    reason: "Isolated verification of " + data.action + ".",
  });
await mod({
  action: "category",
  target_type: "category",
  target_id: "qa-community",
  name: "QA community",
  description: "A temporary isolated community.",
  color: "#f04412",
  locked: true,
});
await api(
  "carol",
  "posts",
  {
    id: crypto.randomUUID(),
    title: "Cannot post in locked category",
    body: "This should not be created.",
    category: "qa-community",
  },
  403,
);
await mod({
  action: "category",
  target_type: "category",
  target_id: "qa-community",
  name: "Updated QA community",
  description: "Updated temporary isolated community.",
  color: "#2878e8",
  locked: false,
});
assert(
  (await api("carol", "bootstrap")).categories.some(
    (c) => c.name === "Updated QA community",
  ),
);
await mod({
  action: "move",
  target_type: "post",
  target_id: post,
  category: "qa-community",
});
await mod({
  action: "rename",
  target_type: "post",
  target_id: post,
  title: "Renamed by staff with a reason",
});
await mod({ action: "pin", target_type: "post", target_id: post });
let detail = (await api("carol", "posts/" + post)).post;
assert.equal(detail.category, "qa-community");
assert.equal(detail.pinned, 1);
assert.equal(detail.title, "Renamed by staff with a reason");
await mod({ action: "remove", target_type: "comment", target_id: reply });
assert.equal(
  (await api("carol", "posts/" + post)).comments.find((c) => c.id === reply)
    .body,
  "",
);
await mod({ action: "restore", target_type: "comment", target_id: reply });
assert.equal(
  (await api("carol", "posts/" + post)).comments.find((c) => c.id === reply)
    .body,
  "A thoughtful first reply.",
);
for (const key of ["posting_open", "uploads_open", "registrations_open"]) {
  await mod({
    action: "settings",
    target_type: "settings",
    target_id: "community",
    values: { [key]: "0" },
  });
  if (key === "posting_open")
    await api(
      "bob",
      "posts",
      {
        id: crypto.randomUUID(),
        title: "Paused posting test",
        body: "Must not publish.",
        category: "general",
      },
      403,
    );
  if (key === "registrations_open")
    await api("newcomer", "bootstrap", undefined, 403);
  if (key === "uploads_open") {
    const r = await fetch(origin + "/api/forum/upload", {
      method: "POST",
      headers: { ...headers("bob", true), "Content-Type": "image/png" },
      body: await readFile("public/media/neighborhood.png"),
    });
    assert.equal(r.status, 403);
  }
  await mod({
    action: "settings",
    target_type: "settings",
    target_id: "community",
    values: { [key]: "1" },
  });
}
await mod({
  action: "suspend",
  target_type: "user",
  target_id: "auth_qa_member_b",
  days: 2,
});
await api("bob", "vote", { post_id: post, value: 1 }, 403);
const appeal = await api("bob", "ticket", {
  kind: "appeal",
  subject: "Isolated suspension appeal",
  body: "Please review the temporary test suspension.",
});
await mod({ action: "respond", target_type: "ticket", target_id: appeal.id });
assert(
  (await api("bob", "tickets")).tickets.find((t) => t.id === appeal.id)
    .response,
);
await mod({
  action: "ban",
  target_type: "user",
  target_id: "auth_qa_member_b",
});
await api(
  "bob",
  "comments",
  {
    id: crypto.randomUUID(),
    post_id: post,
    body: "Banned members cannot comment.",
  },
  403,
);
await mod({
  action: "reinstate",
  target_type: "user",
  target_id: "auth_qa_member_b",
});
await mod({
  action: "role",
  target_type: "user",
  target_id: "auth_qa_member_b",
  role: "moderator",
});
const bSetup = await api("bob", "staff-setup", {});
await api("bob", "staff-verify", {
  code: await totp(bSetup.secret, Math.floor(Date.now() / 30000)),
});
await api(
  "bob",
  "moderate",
  {
    action: "role",
    target_type: "user",
    target_id: "auth_qa_member_c",
    role: "admin",
    reason: "Moderator role escalation must fail.",
  },
  403,
);
await api(
  "bob",
  "moderate",
  {
    action: "ban",
    target_type: "user",
    target_id: "auth_qa_admin_env",
    reason: "Moderator restriction of admin must fail.",
  },
  403,
);
await mod({
  action: "role",
  target_type: "user",
  target_id: "auth_qa_member_b",
  role: "member",
});
await api("bob", "staff", undefined, 403);
const imageResponse = await fetch(origin + "/api/forum/upload", {
  method: "POST",
  headers: { ...headers("bob", true), "Content-Type": "image/png" },
  body: await readFile("public/media/neighborhood.png"),
});
const upload = await imageResponse.json();
assert.equal(imageResponse.status, 200);
await api("bob", "backup-media", undefined, 403);
const mediaBackupPage = await api("admin", "backup-media");
assert(mediaBackupPage.media.some((item) => item.id === upload.media.id));
const backupResponse = await fetch(
  origin + "/api/forum/backup-media/" + upload.media.id,
  { headers: headers("admin") },
);
assert.equal(backupResponse.status, 200);
assert.match(backupResponse.headers.get("content-disposition"), /attachment/);
const originalBytes = Buffer.from(await backupResponse.arrayBuffer());
async function restoreFixture(expected, bytes = originalBytes) {
  const r = await fetch(
    origin + "/api/forum/restore-media/" + upload.media.id,
    {
      method: "POST",
      headers: {
        ...headers("admin", true),
        "Content-Type": "application/octet-stream",
      },
      body: bytes,
    },
  );
  assert.equal(r.status, expected, "media restore: " + (await r.text()));
}
await restoreFixture(409); // Recovery requires a deliberate maintenance freeze.
await mod({
  action: "settings",
  target_type: "settings",
  target_id: "community",
  values: { posting_open: "0", uploads_open: "0" },
});
await restoreFixture(409); // No overwriting existing content.
const fixtureState = resolve(process.env.FORUM_TEST_STATE || "");
assert.equal(dirname(fixtureState), resolve(".sites-runtime"));
assert.match(basename(fixtureState), /^isolated-[a-f0-9-]{36}$/);
const configuration = JSON.parse(
  await readFile("dist/server/wrangler.json", "utf8"),
);
const bucketName = configuration.r2_buckets.find(
  (binding) => binding.binding === "BUCKET",
).bucket_name;
const deletion = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "r2",
    "object",
    "delete",
    bucketName + "/uploads/auth_qa_member_b/" + upload.media.id,
    "--local",
    "--persist-to",
    fixtureState,
    "--config",
    "dist/server/wrangler.json",
  ],
  { encoding: "utf8", windowsHide: true },
);
assert.equal(deletion.status, 0, deletion.stdout + deletion.stderr);
await api("admin", "backup-media/" + upload.media.id, undefined, 404);
await restoreFixture(400, Buffer.from("invalid backup content"));
await restoreFixture(200);
const recovered = await fetch(
  origin + "/api/forum/backup-media/" + upload.media.id,
  { headers: headers("admin") },
);
assert.equal(recovered.status, 200);
assert.deepEqual(Buffer.from(await recovered.arrayBuffer()), originalBytes);
await restoreFixture(409);
await mod({
  action: "settings",
  target_type: "settings",
  target_id: "community",
  values: { posting_open: "1", uploads_open: "1" },
});
await api("bob", "delete-account", { confirm: "qa_bob" });
assert.equal((await api("bob", "bootstrap")).user.status, "deleted");
await api("bob", "export-account", undefined, 403);
await api("carol", "profile/qa_bob", undefined, 404);
assert.equal((await fetch(origin + upload.media.url)).status, 404);
detail = (await api("carol", "posts/" + post)).post;
assert.equal(detail.display_name, "Deleted member");
assert.equal(detail.body, "A hello to @qa_carol and the community.");
await api("admin", "staff-lock", {});
await api("admin", "staff-verify", { code: verified.recoveryCodes[0] });
await api("admin", "staff-lock", {});
await api("admin", "staff-verify", { code: verified.recoveryCodes[0] }, 403);
await api("admin", "delete-account", { confirm: "qa_admin" }, 409);
let limited = false;
for (let i = 0; i < 7; i++) {
  const r = await fetch(origin + "/api/forum/comments", {
    method: "POST",
    headers: headers("carol", true),
    body: JSON.stringify({
      id: crypto.randomUUID(),
      post_id: post,
      body: "Isolated rate-limit check " + i,
    }),
  });
  if (r.status === 429) {
    limited = true;
    break;
  }
  assert.equal(r.status, 200);
}
assert(limited);
console.log(
  "PASS: isolated compiled Worker with three identities; mentions/replies/follows, mute and notification preferences, unread state, category admin, move/rename/pin, comment remove/restore, registration/post/upload pauses, suspension/ban/appeal/reinstatement, role escalation denial, demotion revocation, media backup/download/recovery with exact byte comparison and overwrite denial, complete member deletion/media removal, recovery-code single use, last-admin protection and rate limiting.",
);
