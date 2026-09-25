import { all, one, settings, MEMBER_FIELDS, settingEnv } from "./db";
import type { Member, Post, Media, Category } from "@/lib/forum-types";
import { ForumError, positiveInt, isStaff } from "@/lib/forum-validation";
const PUBLIC_POST =
  "p.*,u.username,u.display_name,u.avatar_id,c.name AS category_name,c.color AS category_color,c.icon AS category_icon";
export function mediaView(m: Record<string, any>): Media {
  return {
    id: m.id,
    kind: m.kind,
    mime: m.mime,
    bytes: m.bytes,
    width: m.width,
    height: m.height,
    duration: m.duration,
    thumbnail_id: m.thumbnail_id,
    url: m.object_key?.startsWith("asset:")
      ? m.object_key.slice(6)
      : "/api/forum/media/" + m.id,
    thumbnail_url: m.thumbnail_id ? "/api/forum/media/" + m.thumbnail_id : null,
  };
}
export async function attachMedia(posts: Record<string, any>[]) {
  if (!posts.length) return posts as Post[];
  const rows = await all(
    "SELECT * FROM media WHERE status='attached' AND comment_id IS NULL AND post_id IN (" +
      posts.map(() => "?").join(",") +
      ")",
    ...posts.map((p) => p.id),
  );
  return posts.map((p) => ({
    ...p,
    media: rows.filter((m) => m.post_id === p.id).map(mediaView),
  })) as Post[];
}
export function postSelect(userId: string) {
  return {
    sql:
      "SELECT " +
      PUBLIC_POST +
      ",COALESCE((SELECT SUM(value) FROM votes WHERE post_id=p.id),0) AS score,(SELECT COUNT(*) FROM comments WHERE post_id=p.id AND status='active') AS comment_count,COALESCE((SELECT value FROM votes WHERE post_id=p.id AND user_id=?),0) AS my_vote,EXISTS(SELECT 1 FROM bookmarks WHERE post_id=p.id AND user_id=?) AS saved,EXISTS(SELECT 1 FROM preferences WHERE user_id=? AND kind='follow_post' AND target=p.id) AS followed,CASE WHEN p.updated_at>COALESCE((SELECT read_at FROM reads WHERE post_id=p.id AND user_id=?),0) THEN 1 ELSE 0 END AS is_unread FROM posts p JOIN users u ON u.id=p.user_id JOIN categories c ON c.slug=p.category",
    args: [userId, userId, userId, userId],
  };
}
export async function listPosts(params: URLSearchParams, user: Member | null) {
  const uid = user?.id ?? "",
    base = postSelect(uid),
    conditions = ["p.status='active'"],
    args: unknown[] = [...base.args];
  const category = params.get("category"),
    author = params.get("author"),
    q = params.get("q")?.trim().slice(0, 200),
    filter = params.get("filter");
  if (category) {
    conditions.push("p.category=?");
    args.push(category);
  }
  if (author) {
    conditions.push("u.username=?");
    args.push(author.toLowerCase());
  }
  if (q) {
    conditions.push(
      "(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')",
    );
    const term = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
    args.push(term, term);
  }
  if (filter === "saved") {
    if (!user) throw new ForumError(401, "Sign in to view saved posts.");
    conditions.push(
      "EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id=p.id AND b.user_id=?)",
    );
    args.push(uid);
  }
  if (filter === "following") {
    if (!user)
      throw new ForumError(401, "Sign in to view followed discussions.");
    conditions.push(
      "EXISTS(SELECT 1 FROM preferences f WHERE f.user_id=? AND ((f.kind='follow_post' AND f.target=p.id) OR (f.kind='join_category' AND f.target=p.category)))",
    );
    args.push(uid);
  }
  if (filter === "unread") {
    if (!user) throw new ForumError(401, "Sign in to see unread posts.");
    conditions.push(
      "p.updated_at>COALESCE((SELECT read_at FROM reads WHERE user_id=? AND post_id=p.id),0)",
    );
    args.push(uid);
  }
  if (uid) {
    conditions.push(
      "NOT EXISTS(SELECT 1 FROM preferences x WHERE x.user_id=? AND ((x.kind='mute_user' AND x.target=p.user_id) OR (x.kind='mute_post' AND x.target=p.id) OR (x.kind='mute_category' AND x.target=p.category)))",
    );
    args.push(uid);
  }
  const sort = params.get("sort") ?? "hot",
    order =
      sort === "new"
        ? "p.created_at DESC"
        : sort === "top"
          ? "score DESC,p.created_at DESC"
          : "(COALESCE((SELECT SUM(value) FROM votes WHERE post_id=p.id),0)+(SELECT COUNT(*) FROM comments WHERE post_id=p.id AND status='active')*0.7+2)/(1+(?-p.created_at)/3600000.0) DESC";
  if (sort !== "new" && sort !== "top") args.push(Date.now());
  const offset = positiveInt(params.get("offset"), 0, 100000),
    limit = 20;
  const rows = await all(
    base.sql +
      " WHERE " +
      conditions.join(" AND ") +
      " ORDER BY p.pinned DESC," +
      order +
      " LIMIT ? OFFSET ?",
    ...args,
    limit + 1,
    offset,
  );
  return {
    posts: await attachMedia(rows.slice(0, limit)),
    nextOffset: rows.length > limit ? offset + limit : null,
  };
}
export async function getPost(id: string, user: Member | null) {
  const b = postSelect(user?.id ?? "");
  const row = await one(b.sql + " WHERE p.id=?", ...b.args, id);
  if (
    !row ||
    row.status === "deleted" ||
    (row.status === "removed" &&
      row.user_id !== user?.id &&
      !isStaff(user?.role ?? ""))
  )
    throw new ForumError(
      404,
      "This discussion is unavailable. It may have been removed or deleted.",
    );
  return (await attachMedia([row]))[0];
}
export async function getComments(
  postId: string,
  user: Member | null,
  offset = 0,
) {
  const rows = await all(
    "SELECT c.*,u.username,u.display_name,u.avatar_id FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.created_at ASC,c.id ASC LIMIT 101 OFFSET ?",
    postId,
    offset,
  );
  const ids = rows.slice(0, 100).map((c) => c.id);
  const media = ids.length
    ? await all(
        "SELECT * FROM media WHERE status='attached' AND comment_id IN (" +
          ids.map(() => "?").join(",") +
          ")",
        ...ids,
      )
    : [];
  const mutes = user
    ? await all(
        "SELECT target FROM preferences WHERE user_id=? AND kind='mute_user'",
        user.id,
      )
    : [];
  return {
    comments: rows
      .slice(0, 100)
      .map((c) => ({
        ...c,
        body:
          c.status !== "active"
            ? ""
            : mutes.some((m) => m.target === c.user_id)
              ? "[Content from a muted member]"
              : c.body,
        media:
          c.status === "active" && !mutes.some((m) => m.target === c.user_id)
            ? media.filter((m) => m.comment_id === c.id).map(mediaView)
            : [],
      })),
    nextOffset: rows.length > 100 ? offset + 100 : null,
  };
}
export async function bootstrap(user: Member | null) {
  const categories = await all<Category>(
    "SELECT c.*,(SELECT COUNT(*) FROM posts WHERE category=c.slug AND status='active') AS post_count,EXISTS(SELECT 1 FROM preferences WHERE user_id=? AND kind='join_category' AND target=c.slug) AS joined FROM categories c ORDER BY position,name",
    user?.id ?? "",
  );
  const stats = await one<{ members: number; posts: number; comments: number }>(
    "SELECT (SELECT COUNT(*) FROM users WHERE status!='deleted' AND id!='community_team') AS members,(SELECT COUNT(*) FROM posts WHERE status='active') AS posts,(SELECT COUNT(*) FROM comments WHERE status='active') AS comments",
  );
  const unread = user
    ? await one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL",
        user.id,
      )
    : null;
  return {
    user,
    categories,
    stats: stats ?? { members: 0, posts: 0, comments: 0 },
    unread: unread?.n ?? 0,
    settings: await settings(),
    preferences: user
      ? await all<{ kind: string; target: string }>(
          "SELECT kind,target FROM preferences WHERE user_id=?",
          user.id,
        )
      : [],
    signInUrl: "/signin-with-chatgpt?return_to=/",
    signOutUrl: "/signout-with-chatgpt?return_to=/",
    emailConfigured: !!(
      settingEnv("EMAIL_API_KEY") &&
      settingEnv("EMAIL_FROM") &&
      settingEnv("APP_ORIGIN")
    ),
  };
}
