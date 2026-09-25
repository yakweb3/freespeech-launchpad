import { all, one, statement, database, settingEnv } from "./db";
import { mentionNames } from "@/lib/forum-validation";
export async function notify(
  userId: string,
  actorId: string,
  kind: string,
  title: string,
  href: string,
  eventId: string,
) {
  if (userId === actorId) return;
  const user = await one(
    "SELECT id,notify_replies,notify_mentions,notify_followed,email_notifications,status FROM users WHERE id=?",
    userId,
  );
  if (!user || user.status === "deleted") return;
  if (
    (kind === "reply" && !user.notify_replies) ||
    (kind === "mention" && !user.notify_mentions) ||
    (kind === "follow" && !user.notify_followed)
  )
    return;
  if (kind !== "moderation") {
    const muted = await one(
      "SELECT 1 FROM preferences WHERE user_id=? AND ((kind='mute_user' AND target=?) OR (kind='mute_post' AND target=?))",
      userId,
      actorId,
      new URL(href, "https://forum.invalid").searchParams.get("post") ?? "",
    );
    if (muted) return;
  }
  const id = eventId + "_" + userId,
    now = Date.now();
  const work = [
    statement(
      "INSERT OR IGNORE INTO notifications (id,user_id,actor_id,kind,title,href,created_at) VALUES (?,?,?,?,?,?,?)",
      id,
      userId,
      actorId,
      kind,
      title,
      href,
      now,
    ),
  ];
  if (
    user.email_notifications &&
    settingEnv("EMAIL_API_KEY") &&
    settingEnv("EMAIL_FROM")
  )
    work.push(
      statement(
        "INSERT OR IGNORE INTO outbox (id,user_id,subject,body,created_at) VALUES (?,?,?,?,?)",
        id,
        userId,
        title,
        href,
        now,
      ),
    );
  await database().batch(work);
}
export async function notifyDiscussion(
  post: Record<string, any>,
  actor: Record<string, any>,
  body: string,
  eventId: string,
  commentId?: string,
  parentUserId?: string,
) {
  const href = "/?post=" + post.id + (commentId ? "#comment-" + commentId : "");
  const recipients = new Set<string>();
  if (commentId) {
    const target = parentUserId ?? post.user_id;
    await notify(
      target,
      actor.id,
      "reply",
      actor.username + " replied to " + post.title,
      href,
      eventId,
    );
    recipients.add(target);
  }
  for (const name of mentionNames(body)) {
    const u = await one("SELECT id FROM users WHERE username=?", name);
    if (u && !recipients.has(u.id)) {
      await notify(
        u.id,
        actor.id,
        "mention",
        actor.username + " mentioned you in " + post.title,
        href,
        eventId,
      );
      recipients.add(u.id);
    }
  }
  const followers = await all(
    "SELECT user_id FROM preferences WHERE kind='follow_post' AND target=?",
    post.id,
  );
  for (const u of followers)
    if (!recipients.has(u.user_id))
      await notify(
        u.user_id,
        actor.id,
        "follow",
        "New activity in " + post.title,
        href,
        eventId,
      );
}
