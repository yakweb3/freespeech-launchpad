import assert from "node:assert/strict";
const origin = "http://localhost:5173";
const login = await fetch(origin + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = login.headers
  .getSetCookie()
  .map((s) => s.split(";")[0])
  .join("; ");
async function api(path, data, expected = 200) {
  const r = await fetch(origin + "/api/forum/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      cookie,
      ...(data === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "x-forum-request": "1",
            Origin: origin,
          }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await r.json();
  assert.equal(r.status, expected, JSON.stringify(result));
  return result;
}
const root = await fetch(origin);
assert.equal(root.status, 200);
assert.equal(root.headers.get("x-content-type-options"), "nosniff");
assert(root.headers.get("cache-control").includes("no-store"));
assert(
  root.headers.get("content-security-policy").includes("object-src 'none'"),
);
const profile = (await api("profile/local_tester")).profile;
assert(!("email" in profile));
assert(!("totp_secret" in profile));
await api("delete-account", { confirm: "local_tester" }, 409);
const results = await api("posts?category=culture&q=reading");
assert(
  results.posts.length === 1 && results.posts[0].id === "reading_this_week",
);
assert.equal(
  (await api("posts?q=" + encodeURIComponent("' OR 1=1 --"))).posts.length,
  0,
);
const postId = "f065939c-5d3f-4260-a8aa-85729a381687";
const video = (await api("posts/" + postId)).post.media[0];
assert.equal(video.kind, "video");
assert.equal(video.duration, 6);
assert(video.thumbnail_url);
const range = await fetch(origin + video.url, {
  headers: { Range: "bytes=0-99" },
});
assert.equal(range.status, 206);
assert.equal((await range.arrayBuffer()).byteLength, 100);
assert(range.headers.get("content-range").startsWith("bytes 0-99/"));
for (const value of [
  "bytes=-",
  "bytes=-0",
  "bytes=999999999-",
  "bytes=10-5",
  "bytes=0-5,10-15",
])
  assert.equal(
    (await fetch(origin + video.url, { headers: { Range: value } })).status,
    416,
  );
const thumbnail = await fetch(origin + video.thumbnail_url);
assert.equal(thumbnail.status, 200);
assert.equal(thumbnail.headers.get("content-type"), "image/jpeg");
await api("delete-post", { id: postId });
assert.equal((await fetch(origin + video.url)).status, 404);
assert.equal((await fetch(origin + video.thumbnail_url)).status, 404);
await api("delete-post", { id: "bb08cfa2-1043-4866-8697-16f3bb336c44" });
console.log(
  "PASS: HTML security headers, private profile fields, last-admin deletion guard, category/text search, SQL-injection string, video duration, range streaming and invalid-range handling, thumbnail access and deletion, and browser-test content cleanup.",
);
