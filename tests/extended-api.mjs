import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
const origin = "http://localhost:5173";
const login = await fetch(origin + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
let cookie = login.headers
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
  const value = await r.json();
  assert.equal(r.status, expected, JSON.stringify(value));
  for (const c of r.headers.getSetCookie()) cookie += "; " + c.split(";")[0];
  return value;
}
await api(
  "edit-post",
  {
    id: "welcome_to_freespeech",
    title: "Unauthorized modification",
    body: "Must be rejected.",
  },
  403,
);
await api("delete-post", { id: "welcome_to_freespeech" }, 403);
await api(
  "thumbnail",
  { video_id: "sample_neighborhood", thumbnail_id: "sample_neighborhood" },
  400,
);
const ticket = await api("ticket", {
  kind: "appeal",
  subject: "Local appeal verification",
  body: "This is a local test of appeal submission and response.",
});
assert((await api("tickets")).tickets.some((t) => t.id === ticket.id));
const report = await api("report", {
  target_type: "post",
  target_id: "reading_this_week",
  reason: "Other",
  details: "Local report workflow test.",
});
const repeat = await api("report", {
  target_type: "post",
  target_id: "reading_this_week",
  reason: "Other",
  details: "Repeated local report.",
});
assert.equal(report.id, repeat.id);
await api("preference", {
  kind: "mute_post",
  target: "reading_this_week",
  enabled: true,
});
assert(!(await api("posts")).posts.some((p) => p.id === "reading_this_week"));
await api("preference", {
  kind: "mute_post",
  target: "reading_this_week",
  enabled: false,
});
await api("preference", {
  kind: "join_category",
  target: "technology",
  enabled: true,
});
assert(
  (await api("bootstrap")).categories.find((c) => c.slug === "technology")
    .joined,
);
await api("preference", {
  kind: "join_category",
  target: "technology",
  enabled: false,
});
const exported = await api("export-account");
assert.equal(exported.format, "freespeech-account-export-v1");
assert(!("totp_secret" in exported.profile));
assert(!("recovery_codes" in exported));
assert((await api("health")).ok);
const source = ts.transpileModule(await readFile("lib/totp.ts", "utf8"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { totp } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
await api("staff-verify", {
  code: await totp(
    (await readFile(".sites-runtime/test-totp-secret", "utf8")).trim(),
    Math.floor(Date.now() / 30000),
  ),
});
await api("moderate", {
  action: "respond",
  target_type: "ticket",
  target_id: ticket.id,
  reason: "Local test response. No moderation action was necessary.",
});
assert(
  (await api("tickets")).tickets
    .find((t) => t.id === ticket.id)
    .response.includes("Local test response"),
);
await api("moderate", {
  action: "resolve",
  target_type: "report",
  target_id: report.id,
  reason: "Local verification complete. No policy violation.",
});
const backup = await api("backup");
assert.equal(backup.format, "freespeech-backup-v1");
assert(!("staff_sessions" in backup.tables));
await writeFile(".sites-runtime/recovery-test.json", JSON.stringify(backup));
const maintenance = await api("maintenance", {});
assert.equal(maintenance.emailConfigured, false);
await api("staff-lock", {});
console.log(
  "PASS: cross-author edit/delete denial, attachment ownership, appeals and staff response, report deduplication, mute/join preferences, private account export, health, protected database backup, and maintenance without email credentials.",
);
