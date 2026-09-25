import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const origin = "http://localhost:5173";
const auth = await fetch(origin + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = auth.headers
  .getSetCookie()
  .map((s) => s.split(";")[0])
  .join("; ");
assert(cookie, "Local sign-in should set a session cookie");
async function call(path, data, expected = 200, authenticated = true) {
  const r = await fetch(origin + "/api/forum/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      ...(authenticated ? { cookie } : {}),
      ...(data !== undefined
        ? {
            "Content-Type": "application/json",
            "x-forum-request": "1",
            Origin: origin,
          }
        : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await r.json();
  assert.equal(r.status, expected, JSON.stringify(value));
  return value;
}
const b = await call("bootstrap");
assert(b.user);
assert.equal(b.user.role, "admin");
if (!b.user.onboarded)
  await call("profile", {
    username: "local_tester",
    display_name: "Local test member",
    bio: "Local development test account.",
    accept_rules: true,
  });
await call(
  "posts",
  {
    id: crypto.randomUUID(),
    title: "Should not publish",
    body: "Anonymous posting is not allowed.",
    category: "general",
  },
  401,
  false,
);
const csrf = await fetch(origin + "/api/forum/posts", {
  method: "POST",
  headers: { cookie, "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(csrf.status, 403);
const cross = await fetch(origin + "/api/forum/posts", {
  method: "POST",
  headers: {
    cookie,
    "Content-Type": "application/json",
    "x-forum-request": "1",
    Origin: "https://untrusted.invalid",
  },
  body: "{}",
});
assert.equal(cross.status, 403);
const bytes = await readFile("public/media/neighborhood.png");
const uploaded = await fetch(origin + "/api/forum/upload", {
  method: "POST",
  headers: {
    cookie,
    "x-forum-request": "1",
    "Content-Type": "image/png",
    Origin: origin,
  },
  body: bytes,
});
const media = await uploaded.json();
assert.equal(uploaded.status, 200, JSON.stringify(media));
assert.equal(media.media.mime, "image/png");
assert.equal(media.media.width, 1536);
const other = await fetch(origin + media.media.url);
assert.equal(other.status, 404, "Draft media must be private");
const id = crypto.randomUUID(),
  data = {
    id,
    title: "Local integration check — picture discussion",
    body: "Test content for the local development workflow.",
    category: "feedback",
    media_ids: [media.media.id],
  };
await call("posts", data);
await call("posts", data);
const detail = await call("posts/" + id);
assert.equal(detail.post.media.length, 1);
const visible = await fetch(origin + media.media.url);
assert.equal(visible.status, 200);
assert.equal(visible.headers.get("content-type"), "image/png");
const v = await call("vote", { post_id: id, value: 1 });
assert.equal(v.score, 1);
await call("vote", { post_id: id, value: 1 });
assert.equal((await call("posts/" + id)).post.score, 1);
await call("vote", { post_id: id, value: 0 });
await call("bookmark", { post_id: id, enabled: true });
assert((await call("posts?filter=saved")).posts.some((p) => p.id === id));
await call("bookmark", { post_id: id, enabled: false });
const c = crypto.randomUUID();
await call("comments", { id: c, post_id: id, body: "A local test reply." });
await call("comments", { id: c, post_id: id, body: "A local test reply." });
assert.equal((await call("posts/" + id)).comments.length, 1);
await call("edit-comment", { id: c, body: "Edited local reply." });
assert.equal(
  (await call("posts/" + id)).comments[0].body,
  "Edited local reply.",
);
await call("delete-comment", { id: c });
await call("delete-post", { id });
assert.equal((await fetch(origin + media.media.url)).status, 404);
await call("posts/" + id, undefined, 404);
const invalid = await fetch(origin + "/api/forum/upload", {
  method: "POST",
  headers: {
    cookie,
    "x-forum-request": "1",
    "Content-Type": "image/png",
    Origin: origin,
  },
  body: '<svg onload="alert(1)">not a PNG</svg>',
});
assert.equal(invalid.status, 400);
console.log(
  "PASS: local sign-in, onboarding, anonymous denial, CSRF, origin, image upload, draft privacy, post idempotency, votes, bookmarks, comments, edits, deletion, media privacy, spoofed-file rejection.",
);
