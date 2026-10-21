import { DEFAULT_TOPICS } from "@/lib/topics";
import {
  all,
  one,
  run,
  statement,
  database,
  requireMember,
  limit,
  settings,
  audit,
  bucket,
  MEMBER_FIELDS,
} from "./db";
import {
  ForumError,
  textValue,
  validUsername,
  validId,
  safeUrl,
  voteValue,
  REPORT_REASONS,
  isStaff,
} from "@/lib/forum-validation";
import type { Member } from "@/lib/forum-types";
import { getPost } from "./queries";
import { notifyDiscussion, notify } from "./notifications";
import { requireRoomAccess } from "./room-access";

async function postingAllowed() {
  const s = await settings();
  if (s.posting_open === "0")
    throw new ForumError(
      403,
      "Posting is temporarily paused. Existing discussions are still available.",
    );
}
async function categoryAllowed(slug: string) {
  const c = await one("SELECT * FROM categories WHERE slug=?", slug);
  if (!c) throw new ForumError(400, "Choose an existing category.");
  if (c.locked)
    throw new ForumError(403, "This category is currently read-only.");
}
async function uploadAttachments(ids: unknown, userId: string) {
  if (!Array.isArray(ids) || ids.length > 6)
    throw new ForumError(400, "Attach up to six files.");
  const unique = [...new Set(ids.map(validId))];
  if (!unique.length) return [];
  const rows = await all(
    "SELECT * FROM media WHERE id IN (" + unique.map(() => "?").join(",") + ")",
    ...unique,
  );
  if (
    rows.length !== unique.length ||
    rows.some(
      (m) =>
        m.owner_id !== userId ||
        m.status !== "pending" ||
        m.post_id ||
        m.comment_id,
    )
  )
    throw new ForumError(
      400,
      "One of these attachments is unavailable. Upload it again.",
    );
  if (rows.filter((m) => m.kind === "video").length > 1)
    throw new ForumError(400, "Attach one video per post.");
  return rows;
}
export async function updateProfile(
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireMember(user, { allowRestricted: true, onboarded: false });
  await limit(u.id, "profile", 10);
  const username = validUsername(data.username),
    display = textValue(data.display_name, "Display name", 1, 50),
    bio = textValue(data.bio ?? "", "Bio", 0, 400);
  if (!u.onboarded && data.accept_rules !== true)
    throw new ForumError(
      400,
      "Accept the community guidelines and confirm you are an adult to continue.",
    );
  let avatar: string | null = u.avatar_id;
  if (data.avatar_id === null) avatar = null;
  else if (data.avatar_id) {
    const row = await one(
      "SELECT * FROM media WHERE id=? AND owner_id=? AND kind='image' AND status='pending'",
      validId(data.avatar_id),
      u.id,
    );
    if (!row) throw new ForumError(400, "Upload a new image for your avatar.");
    avatar = row.id;
  }
  const work = [
    statement(
      "UPDATE users SET username=?,display_name=?,bio=?,onboarded=1,avatar_id=? WHERE id=?",
      username,
      display,
      bio,
      avatar,
      u.id,
    ),
  ];
  if (avatar && avatar !== u.avatar_id)
    work.push(statement("UPDATE media SET status='avatar' WHERE id=?", avatar));
  await database().batch(work);
  if (u.avatar_id && u.avatar_id !== avatar) {
    await run(
      "UPDATE media SET status='deleted' WHERE id=? AND owner_id=?",
      u.avatar_id,
      u.id,
    );
    const old = await one(
      "SELECT object_key FROM media WHERE id=?",
      u.avatar_id,
    );
    if (old) {
      try {
        await bucket().delete(old.object_key);
        await run("UPDATE media SET bytes=0 WHERE id=?", u.avatar_id);
      } catch {
        console.error("avatar_delete_retry_needed", { id: u.avatar_id });
      }
    }
  }
  return {
    user: await one("SELECT " + MEMBER_FIELDS + " FROM users WHERE id=?", u.id),
  };
}
export async function createPost(
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireMember(user),
    id = validId(data.id);
  await postingAllowed();
  const existing = await one("SELECT id,user_id FROM posts WHERE id=?", id);
  if (existing) {
    if (existing.user_id !== u.id)
      throw new ForumError(409, "That post identifier is already used.");
    return { id };
  }
  await limit(
    u.id,
    "post",
    u.created_at > Date.now() - 86400000 ? 3 : 8,
    600000,
  );
  const title = textValue(data.title, "Title", 8, 220),
    body = textValue(data.body ?? "", "Post", 0, 20000),
    cat = textValue(data.category, "Category", 1, 40);
  await categoryAllowed(cat);
  await requireRoomAccess(cat, u);
  const link = safeUrl(data.link_url);
  const media = await uploadAttachments(data.media_ids ?? [], u.id);
  if (!body && !media.length && !link)
    throw new ForumError(400, "Add some text, a link, or an attachment.");
  const now = Date.now(),
    kind = media.some((m) => m.kind === "video")
      ? "video"
      : media.length
        ? "image"
        : link
          ? "link"
          : "text";
  const work = [
    statement(
      "INSERT INTO posts (id,user_id,category,title,body,kind,link_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      id,
      u.id,
      cat,
      title,
      body,
      kind,
      link,
      now,
      now,
    ),
    statement(
      "INSERT OR IGNORE INTO preferences (user_id,kind,target) VALUES (?,'follow_post',?)",
      u.id,
      id,
    ),
  ];
  for (const m of media)
    work.push(
      statement(
        "UPDATE media SET post_id=?,status='attached' WHERE id=? AND owner_id=? AND status='pending'",
        id,
        m.id,
        u.id,
      ),
    );
  for (const m of media)
    if (m.thumbnail_id)
      work.push(
        statement(
          "UPDATE media SET post_id=?,status='thumbnail' WHERE id=? AND owner_id=? AND status='pending'",
          id,
          m.thumbnail_id,
          u.id,
        ),
      );
  await database().batch(work);
  await notifyDiscussion({ id, title, user_id: u.id }, u, body, id);
  return { id };
}
export async function editPost(
  user: Member | null,
  id: string,
  data: Record<string, any>,
) {
  const u = requireMember(user),
    post = await getPost(id, u);
  if (post.user_id !== u.id)
    throw new ForumError(403, "You can only edit your own posts.");
  if (post.status !== "active")
    throw new ForumError(403, "This post cannot be edited.");
  await limit(u.id, "edit", 12);
  const title = textValue(data.title, "Title", 8, 220),
    body = textValue(data.body ?? "", "Post", 0, 20000),
    link = safeUrl(data.link_url);
  if (!body && !post.media.length && !link)
    throw new ForumError(
      400,
      "Keep text, a link, or an attachment in the post.",
    );
  await run(
    "UPDATE posts SET title=?,body=?,link_url=?,edited_at=?,updated_at=? WHERE id=?",
    title,
    body,
    link,
    Date.now(),
    Date.now(),
    id,
  );
  return { id };
}
export async function deletePost(user: Member | null, id: string) {
  const u = requireMember(user, { allowRestricted: true }),
    p = await one("SELECT * FROM posts WHERE id=?", id);
  if (!p || p.user_id !== u.id)
    throw new ForumError(403, "You can only delete your own posts.");
  await database().batch([
    statement(
      "UPDATE posts SET status='deleted',title='Deleted post',body='',link_url=NULL,updated_at=? WHERE id=?",
      Date.now(),
      id,
    ),
    statement("UPDATE media SET status='deleted' WHERE post_id=?", id),
  ]);
  await purgeMedia("post_id", id);
  return { ok: true };
}
export async function createComment(
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireMember(user),
    id = validId(data.id),
    post = await getPost(validId(data.post_id), u);
  await postingAllowed();
  if (post.locked || post.status !== "active")
    throw new ForumError(403, "This discussion is closed to new replies.");
  await categoryAllowed(post.category);
  const exists = await one("SELECT id,user_id FROM comments WHERE id=?", id);
  if (exists) {
    if (exists.user_id !== u.id)
      throw new ForumError(409, "That comment identifier is already used.");
    return { id };
  }
  await limit(
    u.id,
    "comment",
    u.created_at > Date.now() - 86400000 ? 6 : 20,
    600000,
  );
  const body = textValue(data.body ?? "", "Comment", 0, 10000),
    media = await uploadAttachments(data.media_ids ?? [], u.id);
  if (!body && !media.length)
    throw new ForumError(400, "Write a reply or attach a picture.");
  if (media.some((m) => m.kind === "video"))
    throw new ForumError(
      400,
      "Video uploads belong in posts. Comments support pictures.",
    );
  let parent: null | Record<string, any> = null;
  if (data.parent_id) {
    parent = await one(
      "SELECT id,user_id,post_id FROM comments WHERE id=?",
      validId(data.parent_id),
    );
    if (!parent || parent.post_id !== post.id)
      throw new ForumError(
        400,
        "The reply target is not part of this discussion.",
      );
  }
  const now = Date.now(),
    work = [
      statement(
        "INSERT INTO comments (id,post_id,user_id,parent_id,body,created_at) VALUES (?,?,?,?,?,?)",
        id,
        post.id,
        u.id,
        parent?.id ?? null,
        body,
        now,
      ),
      statement("UPDATE posts SET updated_at=? WHERE id=?", now, post.id),
    ];
  for (const m of media)
    work.push(
      statement(
        "UPDATE media SET post_id=?,comment_id=?,status='attached' WHERE id=? AND owner_id=? AND status='pending'",
        post.id,
        id,
        m.id,
        u.id,
      ),
    );
  await database().batch(work);
  await notifyDiscussion(post, u, body, id, id, parent?.user_id);
  return { id };
}
export async function editComment(
  user: Member | null,
  id: string,
  data: Record<string, any>,
) {
  const u = requireMember(user),
    c = await one("SELECT * FROM comments WHERE id=?", id);
  if (!c || c.user_id !== u.id || c.status !== "active")
    throw new ForumError(403, "You can only edit your own available comments.");
  await getPost(c.post_id, u);
  const body = textValue(data.body, "Comment", 1, 10000);
  await limit(u.id, "edit", 12);
  await run(
    "UPDATE comments SET body=?,edited_at=? WHERE id=?",
    body,
    Date.now(),
    id,
  );
  return { id };
}
export async function deleteComment(user: Member | null, id: string) {
  const u = requireMember(user, { allowRestricted: true }),
    c = await one("SELECT * FROM comments WHERE id=?", id);
  if (!c || c.user_id !== u.id)
    throw new ForumError(403, "You can only delete your own comments.");
  await database().batch([
    statement("UPDATE comments SET status='deleted',body='' WHERE id=?", id),
    statement("UPDATE media SET status='deleted' WHERE comment_id=?", id),
  ]);
  await purgeMedia("comment_id", id);
  return { ok: true };
}
export async function setVote(user: Member | null, data: Record<string, any>) {
  const u = requireMember(user),
    id = validId(data.post_id),
    value = voteValue(data.value);
  await getPost(id, u);
  await limit(u.id, "vote", 60);
  if (value === 0)
    await run("DELETE FROM votes WHERE user_id=? AND post_id=?", u.id, id);
  else
    await run(
      "INSERT INTO votes (user_id,post_id,value) VALUES (?,?,?) ON CONFLICT(user_id,post_id) DO UPDATE SET value=excluded.value",
      u.id,
      id,
      value,
    );
  const score = await one<{ score: number }>(
    "SELECT COALESCE(SUM(value),0) AS score FROM votes WHERE post_id=?",
    id,
  );
  return { score: score?.score ?? 0, my_vote: value };
}
export async function setBookmark(
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireMember(user),
    id = validId(data.post_id);
  await getPost(id, u);
  await limit(u.id, "bookmark", 60);
  if (data.enabled)
    await run(
      "INSERT OR IGNORE INTO bookmarks (user_id,post_id,created_at) VALUES (?,?,?)",
      u.id,
      id,
      Date.now(),
    );
  else
    await run("DELETE FROM bookmarks WHERE user_id=? AND post_id=?", u.id, id);
  return { ok: true };
}
export async function setPreference(
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireMember(user, { allowRestricted: true }),
    kind = textValue(data.kind, "Preference", 1, 30),
    target = textValue(data.target, "Target", 1, 160);
  if (
    ![
      "follow_post",
      "mute_post",
      "mute_user",
      "mute_category",
      "join_category",
    ].includes(kind)
  )
    throw new ForumError(400, "Unknown preference.");
  const table = kind.endsWith("category")
      ? "categories"
      : kind === "mute_user"
        ? "users"
        : "posts",
    key = table === "categories" ? "slug" : "id";
  if (!(await one("SELECT 1 FROM " + table + " WHERE " + key + "=?", target)))
    throw new ForumError(404, "That item is unavailable.");
  if (data.enabled)
    await run(
      "INSERT OR IGNORE INTO preferences (user_id,kind,target) VALUES (?,?,?)",
      u.id,
      kind,
      target,
    );
  else
    await run(
      "DELETE FROM preferences WHERE user_id=? AND kind=? AND target=?",
      u.id,
      kind,
      target,
    );
  return { ok: true };
}
export async function markRead(user: Member | null, data: Record<string, any>) {
  const u = requireMember(user, { allowRestricted: true }),
    id = validId(data.post_id);
  await getPost(id, u);
  let comment: string | null = null;
  if (data.last_comment) {
    const c = await one(
      "SELECT id FROM comments WHERE id=? AND post_id=?",
      validId(data.last_comment),
      id,
    );
    if (c) comment = c.id;
  }
  await run(
    "INSERT INTO reads (user_id,post_id,read_at,last_comment) VALUES (?,?,?,?) ON CONFLICT(user_id,post_id) DO UPDATE SET read_at=excluded.read_at,last_comment=COALESCE(excluded.last_comment,reads.last_comment)",
    u.id,
    id,
    Date.now(),
    comment,
  );
  return { ok: true };
}
export async function reportContent(
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireMember(user),
    type = data.target_type,
    id = textValue(data.target_id, "Target", 1, 160);
  if (!["post", "comment", "user"].includes(type))
    throw new ForumError(400, "Choose a valid report target.");
  const table =
    type === "post" ? "posts" : type === "comment" ? "comments" : "users";
  if (!(await one("SELECT id FROM " + table + " WHERE id=?", id)))
    throw new ForumError(404, "That item is unavailable.");
  const reason = textValue(data.reason, "Reason", 1, 100),
    details = textValue(data.details ?? "", "Details", 0, 3000);
  if (!REPORT_REASONS.includes(reason))
    throw new ForumError(400, "Choose a report reason.");
  await limit(u.id, "report", 5, 3600000);
  const existing = await one(
    "SELECT id FROM reports WHERE user_id=? AND target_type=? AND target_id=? AND status='open'",
    u.id,
    type,
    id,
  );
  if (existing) return { id: existing.id };
  const reportId = crypto.randomUUID();
  await run(
    "INSERT INTO reports (id,user_id,target_type,target_id,reason,details,created_at) VALUES (?,?,?,?,?,?,?)",
    reportId,
    u.id,
    type,
    id,
    reason,
    details,
    Date.now(),
  );
  return { id: reportId };
}
export async function submitTicket(
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireMember(user, { allowRestricted: true, onboarded: false });
  await limit(u.id, "ticket", 5, 86400000);
  const kind =
      data.kind === "appeal"
        ? "appeal"
        : data.kind === "privacy"
          ? "privacy"
          : "support",
    subject = textValue(data.subject, "Subject", 5, 150),
    body = textValue(data.body, "Message", 10, 5000),
    id = crypto.randomUUID();
  await run(
    "INSERT INTO tickets (id,user_id,kind,subject,body,action_id,created_at) VALUES (?,?,?,?,?,?,?)",
    id,
    u.id,
    kind,
    subject,
    body,
    data.action_id
      ? textValue(data.action_id, "Action reference", 1, 100)
      : null,
    Date.now(),
  );
  return { id };
}
export async function updateNotifications(
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireMember(user, { allowRestricted: true });
  await run(
    "UPDATE users SET notify_replies=?,notify_mentions=?,notify_followed=?,email_notifications=? WHERE id=?",
    data.notify_replies ? 1 : 0,
    data.notify_mentions ? 1 : 0,
    data.notify_followed ? 1 : 0,
    data.email_notifications ? 1 : 0,
    u.id,
  );
  return { ok: true };
}
export async function purgeMedia(
  column: "post_id" | "comment_id" | "owner_id",
  id: string,
) {
  const media = await all(
    "SELECT id,object_key,thumbnail_id FROM media WHERE " + column + "=?",
    id,
  );
  for (const m of media) {
    if (!m.object_key.startsWith("asset:")) {
      try {
        await bucket().delete(m.object_key);
        await run("UPDATE media SET bytes=0 WHERE id=?", m.id);
      } catch {
        console.error("media_delete_retry_needed", { id: m.id });
      }
    }
  }
}
export async function deleteAccount(
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireMember(user, { allowRestricted: true });
  if (data.confirm !== u.username)
    throw new ForumError(
      400,
      "Type your username to confirm account deletion.",
    );
  if (u.role === "admin") {
    const count = await one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM users WHERE role='admin' AND status='active'",
    );
    if ((count?.n ?? 0) <= 1)
      throw new ForumError(
        409,
        "Assign another administrator before deleting the last administrator account.",
      );
  }
  const work = [
    statement(
      "UPDATE users SET username=?,display_name='Deleted member',bio='',email='',avatar_id=NULL,status='deleted',role='member',deleted_at=?,totp_secret=NULL,totp_enabled=0 WHERE id=?",
      "deleted_" + crypto.randomUUID().slice(0, 12),
      Date.now(),
      u.id,
    ),
    ...[
      "preferences",
      "bookmarks",
      "votes",
      "reads",
      "notifications",
      "outbox",
      "staff_sessions",
      "recovery_codes",
      "wallet_sessions",
      "wallet_challenges",
    ].map((t) => statement("DELETE FROM " + t + " WHERE user_id=?", u.id)),
    statement("UPDATE media SET status='deleted' WHERE owner_id=?", u.id),
    statement("DELETE FROM auth_user WHERE id=?", u.id.replace(/^auth_/, "")),
  ];
  await database().batch(work);
  await purgeMedia("owner_id", u.id);
  return { ok: true };
}

export async function createTopic(user: Member | null, data: Record<string, unknown>) {
  const u = requireMember(user);
  if (typeof data.name !== "string") throw new ForumError(400, "Enter a topic name.");
  const name = data.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 32 || !/^[\p{L}\p{N} &+'’.-]+$/u.test(name)) throw new ForumError(400, "Use 2–32 characters: letters, numbers, spaces, or simple punctuation.");
  if (DEFAULT_TOPICS.some(t => t.toLowerCase() === name.toLowerCase())) throw new ForumError(409, "That topic already exists.");
  await limit(u.id, "create-topic", 3, 86400000);
  await run("INSERT INTO forum_topics (id,name,creator_id,created_at) VALUES (?,?,?,?)", crypto.randomUUID(), name, u.id, Date.now());
  return { name };
}

export async function createPublicCommunity(user: Member | null, data: Record<string, unknown>) {
  const u = requireMember(user);
  const name = textValue(data.name, "Name", 2, 48);
  const description = textValue(data.description, "Description", 10, 500);
  const topic = textValue(data.topic, "Topic", 2, 32);
  if (!DEFAULT_TOPICS.includes(topic) && !(await one("SELECT id FROM forum_topics WHERE name=?", topic))) throw new ForumError(400, "Choose an existing topic.");
  await limit(u.id, "create-public-community", 3, 86400000);
  const slug = "c-" + crypto.randomUUID().replaceAll("-", "").slice(0, 24);
  await database().batch([
    statement("INSERT INTO categories (slug,name,description,color,icon,position,locked) VALUES (?,?,?,'#e74413','community',100,0)", slug,name,description),
    statement("INSERT INTO public_communities (category,creator_id,topic,created_at) VALUES (?,?,?,?)",slug,u.id,topic,Date.now()),
    statement("INSERT INTO preferences (user_id,kind,target) VALUES (?,'join_category',?)",u.id,slug),
  ]);
  return { slug };
}
