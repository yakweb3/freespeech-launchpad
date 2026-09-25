import type { Member } from "@/lib/forum-types";
import { ForumError } from "@/lib/forum-validation";
import {
  one,
  all,
  run,
  database,
  statement,
  bucket,
  settingEnv,
  sha256,
  limit,
} from "./db";
import { verifiedStaff } from "./staff-auth";
export const BACKUP_TABLES = [
  "auth_user",
  "auth_account",
  "users",
  "categories",
  "posts",
  "comments",
  "votes",
  "bookmarks",
  "preferences",
  "reads",
  "media",
  "notifications",
  "reports",
  "tickets",
  "audit_log",
  "settings",
  "recovery_codes",
];
export async function health() {
  await one("SELECT 1 AS ok");
  await bucket().head("__health_probe__");
  return { ok: true, checked_at: new Date().toISOString() };
}
export async function backup(request: Request, user: Member | null) {
  const u = await verifiedStaff(request, user, true);
  await limit(u.id, "backup", 2, 3600000);
  const results = await database().batch(
    BACKUP_TABLES.map((t) => statement("SELECT * FROM " + t)),
  );
  return {
    format: "freespeech-backup-v1",
    schema: 3,
    created_at: new Date().toISOString(),
    tables: Object.fromEntries(
      BACKUP_TABLES.map((t, i) => [t, results[i].results]),
    ),
    notes:
      "Database only, including private login data and password hashes. Encrypt this backup. Back up Blob objects separately; keep the staff encryption key in a separate secure vault. Sessions, reset/verification tokens, rate limits and outgoing email queue are deliberately excluded.",
  };
}
async function authorizeMaintenance(request: Request, user: Member | null) {
  const configured = settingEnv("MAINTENANCE_TOKEN"),
    supplied =
      request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (
    configured &&
    supplied.length >= 32 &&
    (await sha256(configured)) === (await sha256(supplied))
  )
    return;
  await verifiedStaff(request, user, true);
}
export async function maintenance(request: Request, user: Member | null) {
  await authorizeMaintenance(request, user);
  await limit("system", "maintenance", 2, 60000);
  const now = Date.now();
  await database().batch([
    statement("DELETE FROM rate_limits WHERE expires_at<?", now - 86400000),
    statement("DELETE FROM staff_sessions WHERE expires_at<?", now),
    statement(
      "UPDATE media SET status='deleted' WHERE status IN ('pending','uploading','finalizing') AND created_at<?",
      now - 86400000,
    ),
    statement(
      "UPDATE outbox SET status='pending',locked_until=NULL WHERE status='sending' AND locked_until<?",
      now,
    ),
  ]);
  const pending = await all(
    "SELECT id,object_key FROM media WHERE status='deleted' AND bytes>0 LIMIT 50",
  );
  let deleted = 0;
  for (const m of pending) {
    try {
      if (!m.object_key.startsWith("asset:"))
        await bucket().delete(m.object_key);
      await run("UPDATE media SET bytes=0 WHERE id=?", m.id);
      deleted++;
    } catch {
      console.error("media_cleanup_failed", { id: m.id });
    }
  }
  const mail = await deliverMail();
  return { ok: true, deletedMedia: deleted, ...mail };
}
async function deliverMail() {
  const apiKey = settingEnv("EMAIL_API_KEY"),
    from = settingEnv("EMAIL_FROM"),
    origin = settingEnv("APP_ORIGIN");
  if (!apiKey || !from || !origin)
    return { emailConfigured: false, emailSent: 0, emailFailed: 0 };
  const base = new URL(origin);
  if (base.protocol !== "https:")
    throw new ForumError(503, "Email requires an HTTPS application origin.");
  let sent = 0,
    failed = 0;
  const now = Date.now();
  // Avoid sending delayed duplicates outside the provider's idempotency retention window.
  await run(
    "UPDATE outbox SET status='expired' WHERE status='pending' AND created_at<?",
    now - 23 * 3600000,
  );
  const candidates = await all(
    "SELECT id FROM outbox WHERE status='pending' AND attempts<5 ORDER BY created_at LIMIT 10",
  );
  for (const candidate of candidates) {
    const item = await one(
      "UPDATE outbox SET status='sending',attempts=attempts+1,locked_until=? WHERE id=? AND status='pending' RETURNING *",
      now + 300000,
      candidate.id,
    );
    if (!item) continue;
    const user = await one(
      "SELECT email,email_notifications FROM users WHERE id=? AND status!='deleted'",
      item.user_id,
    );
    if (!user?.email || !user.email_notifications) {
      await run(
        "UPDATE outbox SET status='skipped',locked_until=NULL WHERE id=?",
        item.id,
      );
      continue;
    }
    const destination = new URL(item.body, base);
    if (destination.origin !== base.origin) {
      await run(
        "UPDATE outbox SET status='failed',locked_until=NULL WHERE id=?",
        item.id,
      );
      failed++;
      continue;
    }
    try {
      const result = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Idempotency-Key": "forum-" + item.id,
        },
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: item.subject,
          text:
            item.subject +
            "\n\n" +
            destination.href +
            "\n\nManage email preferences in your FreeSpeech account settings.",
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!result.ok) throw new Error("Email provider rejected request");
      await run(
        "UPDATE outbox SET status='sent',locked_until=NULL WHERE id=?",
        item.id,
      );
      sent++;
    } catch {
      await run(
        "UPDATE outbox SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,locked_until=NULL WHERE id=?",
        item.id,
      );
      failed++;
      console.error("notification_email_failed", { id: item.id });
    }
  }
  return { emailConfigured: true, emailSent: sent, emailFailed: failed };
}
