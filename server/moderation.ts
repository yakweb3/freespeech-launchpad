import type { Member } from "@/lib/forum-types";
import {
  ForumError,
  textValue,
  validId,
  isStaff,
} from "@/lib/forum-validation";
import { all, one, run, statement, database, limit, settings } from "./db";
import { verifiedStaff } from "./staff-auth";
import { notify } from "./notifications";
export async function staffDashboard(request: Request, user: Member | null) {
  await verifiedStaff(request, user);
  return {
    reports: await all(
      "SELECT r.*,u.username AS reporter,CASE WHEN r.target_type='post' THEN (SELECT title || char(10) || body FROM posts WHERE id=r.target_id) WHEN r.target_type='comment' THEN (SELECT body FROM comments WHERE id=r.target_id) ELSE (SELECT username || char(10) || bio FROM users WHERE id=r.target_id) END AS target_content FROM reports r JOIN users u ON u.id=r.user_id ORDER BY (r.status='open') DESC,r.created_at DESC LIMIT 100",
    ),
    tickets: await all(
      "SELECT t.*,u.username FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY (t.status='open') DESC,t.created_at DESC LIMIT 100",
    ),
    audit: await all(
      "SELECT a.*,u.username AS actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100",
    ),
    members: await all(
      "SELECT id,username,display_name,role,status,suspended_until,restriction_reason,totp_enabled FROM users WHERE status!='deleted' AND id!='community_team' ORDER BY created_at DESC LIMIT 100",
    ),
    removed: await all(
      "SELECT id,title,user_id,removal_reason FROM posts WHERE status='removed' ORDER BY updated_at DESC LIMIT 50",
    ),
    settings: await settings(),
    storage: await one(
      "SELECT COALESCE(SUM(bytes),0) AS bytes,COUNT(*) AS files FROM media",
    ),
  };
}
export async function moderate(
  request: Request,
  user: Member | null,
  data: Record<string, any>,
) {
  const action = String(data.action || ""),
    adminActions = ["role", "category", "settings"];
  const u = await verifiedStaff(request, user, adminActions.includes(action));
  await limit(u.id, "moderation", 40);
  const reason = textValue(data.reason, "Reason", 5, 1500),
    id = textValue(data.target_id, "Target", 1, 160),
    type = String(data.target_type || "");
  const logId = crypto.randomUUID(),
    now = Date.now();
  const work: ReturnType<typeof statement>[] = [];
  let recipient: string | null = null,
    href = "/?page=moderation";
  let details: Record<string, unknown> = {};
  if (type === "post" || type === "comment") {
    const table = type === "post" ? "posts" : "comments",
      target = await one("SELECT * FROM " + table + " WHERE id=?", validId(id));
    if (!target || target.status === "deleted")
      throw new ForumError(404, "This content is unavailable.");
    recipient = target.user_id;
    href = "/?post=" + (type === "post" ? id : target.post_id);
    if (action === "remove" || action === "restore") {
      if (action === "restore" && target.status !== "removed")
        throw new ForumError(409, "Only removed content can be restored.");
      work.push(
        statement(
          "UPDATE " + table + " SET status=?,removal_reason=? WHERE id=?",
          action === "remove" ? "removed" : "active",
          action === "remove" ? reason : null,
          id,
        ),
      );
    } else if (
      type === "post" &&
      ["lock", "unlock", "pin", "unpin"].includes(action)
    ) {
      const key =
        action === "lock" || action === "unlock" ? "locked" : "pinned";
      work.push(
        statement(
          "UPDATE posts SET " + key + "=? WHERE id=?",
          action === "lock" || action === "pin" ? 1 : 0,
          id,
        ),
      );
    } else if (type === "post" && action === "move") {
      const category = textValue(data.category, "Category", 1, 40);
      if (!(await one("SELECT 1 FROM categories WHERE slug=?", category)))
        throw new ForumError(400, "Category not found.");
      details = { from: target.category, to: category };
      work.push(
        statement("UPDATE posts SET category=? WHERE id=?", category, id),
      );
    } else if (type === "post" && action === "rename") {
      const title = textValue(data.title, "Title", 8, 220);
      details = { previousTitle: target.title, title };
      work.push(
        statement(
          "UPDATE posts SET title=?,edited_at=? WHERE id=?",
          title,
          now,
          id,
        ),
      );
    } else throw new ForumError(400, "Unsupported content action.");
  } else if (type === "user") {
    const target = await one("SELECT id,role,status FROM users WHERE id=?", id);
    if (!target || target.status === "deleted" || id === "community_team")
      throw new ForumError(404, "Member unavailable.");
    if (id === u.id)
      throw new ForumError(
        400,
        "Staff cannot restrict or change their own role.",
      );
    if (target.role === "admin" || (isStaff(target.role) && u.role !== "admin"))
      throw new ForumError(403, "This staff account cannot be changed here.");
    recipient = id;
    href = "/?page=contact";
    if (action === "warn") details = { warning: reason };
    else if (["suspend", "ban", "reinstate"].includes(action)) {
      const days = Number(data.days ?? 7);
      if (
        action === "suspend" &&
        (!Number.isInteger(days) || days < 1 || days > 365)
      )
        throw new ForumError(400, "Choose a suspension of 1–365 days.");
      const until = action === "suspend" ? now + days * 86400000 : null;
      work.push(
        statement(
          "UPDATE users SET status=?,suspended_until=?,restriction_reason=? WHERE id=?",
          action === "ban"
            ? "banned"
            : action === "suspend"
              ? "suspended"
              : "active",
          until,
          action === "reinstate" ? null : reason,
          id,
        ),
      );
      work.push(statement("DELETE FROM staff_sessions WHERE user_id=?", id));
      details = { suspended_until: until };
    } else if (action === "role") {
      if (!["member", "moderator", "admin"].includes(data.role))
        throw new ForumError(400, "Unknown role.");
      work.push(statement("UPDATE users SET role=? WHERE id=?", data.role, id));
      work.push(statement("DELETE FROM staff_sessions WHERE user_id=?", id));
      details = { from: target.role, to: data.role };
    } else throw new ForumError(400, "Unsupported account action.");
  } else if (type === "report" && action === "resolve") {
    const report = await one("SELECT * FROM reports WHERE id=?", id);
    if (!report) throw new ForumError(404, "Report not found.");
    work.push(
      statement(
        "UPDATE reports SET status='resolved',resolution=?,resolved_by=?,resolved_at=? WHERE id=?",
        reason,
        u.id,
        now,
        id,
      ),
    );
    recipient = report.user_id;
    href = "/?page=contact";
  } else if (type === "ticket" && action === "respond") {
    const ticket = await one("SELECT * FROM tickets WHERE id=?", id);
    if (!ticket) throw new ForumError(404, "Request not found.");
    work.push(
      statement(
        "UPDATE tickets SET status='resolved',response=?,resolved_at=? WHERE id=?",
        reason,
        now,
        id,
      ),
    );
    recipient = ticket.user_id;
    href = "/?page=contact";
  } else if (type === "category" && action === "category") {
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(id))
      throw new ForumError(400, "Use a short lowercase category slug.");
    const name = textValue(data.name, "Name", 2, 40),
      description = textValue(data.description, "Description", 5, 300),
      color = String(data.color || "#e63d0e");
    if (!/^#[0-9a-f]{6}$/i.test(color))
      throw new ForumError(400, "Use a six-digit hex color.");
    const position = Number(data.position ?? 10);
    if (!Number.isInteger(position) || position < 0 || position > 1000)
      throw new ForumError(400, "Invalid category position.");
    work.push(
      statement(
        "INSERT INTO categories (slug,name,description,color,icon,position,locked) VALUES (?,?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,color=excluded.color,position=excluded.position,locked=excluded.locked",
        id,
        name,
        description,
        color,
        "MessageSquare",
        position,
        data.locked ? 1 : 0,
      ),
    );
  } else if (type === "settings" && action === "settings") {
    const booleans = [
        "registrations_open",
        "posting_open",
        "uploads_open",
        "policy_reviewed",
      ],
      limits: Record<string, [number, number]> = {
        max_video_seconds: [1, 120],
        max_video_mb: [1, 25],
        max_image_mb: [1, 8],
        max_daily_uploads: [1, 100],
        max_storage_mb: [1, 100000],
      };
    for (const [key, value] of Object.entries(data.values || {})) {
      let val = String(value);
      if (booleans.includes(key)) {
        if (!["0", "1"].includes(val))
          throw new ForumError(400, "Invalid setting.");
      } else if (limits[key]) {
        const n = Number(value);
        if (!Number.isInteger(n) || n < limits[key][0] || n > limits[key][1])
          throw new ForumError(400, "Invalid limit for " + key);
      } else if (key === "support_email") {
        if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))
          throw new ForumError(400, "Invalid support email.");
      } else throw new ForumError(400, "Unknown setting.");
      work.push(
        statement(
          "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          key,
          val,
        ),
      );
    }
    details = { values: data.values };
  } else throw new ForumError(400, "Unsupported moderation action.");
  work.push(
    statement(
      "INSERT INTO audit_log (id,actor_id,action,target_type,target_id,reason,details,created_at) VALUES (?,?,?,?,?,?,?,?)",
      logId,
      u.id,
      action,
      type,
      id,
      reason,
      JSON.stringify(details),
      now,
    ),
  );
  await database().batch(work);
  if (recipient)
    await notify(
      recipient,
      u.id,
      "moderation",
      "Staff " + action + ": " + reason + " (Reference: " + logId + ")",
      href,
      logId,
    );
  return { ok: true, action_id: logId };
}
