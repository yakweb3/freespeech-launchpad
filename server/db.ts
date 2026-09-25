import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ForumError, isRestricted, isStaff } from "@/lib/forum-validation";
import type { Member } from "@/lib/forum-types";

export function database(): D1Database {
  if (!env.DB)
    throw new ForumError(
      503,
      "The forum is temporarily unavailable. Please try again shortly.",
    );
  return env.DB;
}
export function bucket(): R2Bucket {
  if (!env.BUCKET)
    throw new ForumError(503, "Uploads are temporarily unavailable.");
  return env.BUCKET;
}
export function statement(sql: string, ...args: unknown[]) {
  return database()
    .prepare(sql)
    .bind(...args);
}
export async function one<T = Record<string, any>>(
  sql: string,
  ...args: unknown[]
) {
  return statement(sql, ...args).first<T>();
}
export async function all<T = Record<string, any>>(
  sql: string,
  ...args: unknown[]
) {
  return (await statement(sql, ...args).all<T>()).results;
}
export async function run(sql: string, ...args: unknown[]) {
  return statement(sql, ...args).run();
}
export const MEMBER_FIELDS =
  "id,username,display_name,bio,avatar_id,role,status,suspended_until,restriction_reason,onboarded,created_at,notify_replies,notify_mentions,notify_followed,email_notifications,totp_enabled";
export const PUBLIC_FIELDS =
  "id,username,display_name,bio,avatar_id,role,created_at";
export function settingEnv(key: string) {
  return String((env as unknown as Record<string, unknown>)[key] ?? "");
}
export async function settings() {
  return Object.fromEntries(
    (
      await all<{ key: string; value: string }>(
        "SELECT key,value FROM settings",
      )
    ).map((r) => [r.key, r.value]),
  );
}
export async function currentMember(): Promise<Member | null> {
  const identity = await getChatGPTUser();
  if (!identity) return null;
  const id = "auth_" + identity.userId;
  let user = await one<Member>(
    "SELECT " + MEMBER_FIELDS + " FROM users WHERE id=?",
    id,
  );
  if (user?.status === "deleted") return user;
  if (!user) {
    const config = await settings();
    if (config.registrations_open === "0")
      throw new ForumError(403, "New registrations are temporarily paused.");
    const admins = settingEnv("ADMIN_USER_IDS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const adminEmails = settingEnv("ADMIN_EMAILS")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const role = admins.includes(identity.userId) || adminEmails.includes(identity.email.toLowerCase())
      ? "admin" : "member";
    const suffix = (await sha256(identity.userId)).slice(0, 12);
    await run(
      "INSERT OR IGNORE INTO users (id,username,display_name,email,role,created_at) VALUES (?,?,?,?,?,?)",
      id,
      "member_" + suffix,
      "New member",
      identity.email,
      role,
      Date.now(),
    );
    user = await one<Member>(
      "SELECT " + MEMBER_FIELDS + " FROM users WHERE id=?",
      id,
    );
  }
  return user;
}
export function requireMember(
  user: Member | null,
  { allowRestricted = false, onboarded = true } = {},
): Member {
  if (!user) throw new ForumError(401, "Sign in to join the conversation.");
  if (user.status === "deleted")
    throw new ForumError(403, "This forum account has been deleted.");
  if (!allowRestricted && isRestricted(user))
    throw new ForumError(
      403,
      user.restriction_reason ||
        "Your account is currently restricted. You can appeal through Contact & appeals.",
    );
  if (onboarded && !user.onboarded)
    throw new ForumError(
      409,
      "Choose a username and accept the community guidelines first.",
    );
  return user;
}
export function requireStaff(user: Member | null, adminOnly = false) {
  const u = requireMember(user);
  if (adminOnly ? u.role !== "admin" : !isStaff(u.role))
    throw new ForumError(
      403,
      "You do not have permission to use this staff tool.",
    );
  return u;
}
export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function limit(
  userId: string,
  action: string,
  max: number,
  windowMs = 60_000,
) {
  const now = Date.now(),
    period = Math.floor(now / windowMs),
    key = action + ":" + userId + ":" + period;
  const r = await one<{ count: number }>(
    "INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    key,
    (period + 1) * windowMs,
  );
  if ((r?.count ?? 0) > max)
    throw new ForumError(
      429,
      "You are doing that a little quickly. Please wait and try again.",
    );
}
export async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  reason: string,
  details: unknown = {},
) {
  const id = crypto.randomUUID();
  await run(
    "INSERT INTO audit_log (id,actor_id,action,target_type,target_id,reason,details,created_at) VALUES (?,?,?,?,?,?,?,?)",
    id,
    actorId,
    action,
    targetType,
    targetId,
    reason,
    JSON.stringify(details),
    Date.now(),
  );
  return id;
}
let seedPromise: Promise<void> | null = null;
export async function ensureSeed() {
  if (!seedPromise)
    seedPromise = seed().catch((e) => {
      seedPromise = null;
      throw e;
    });
  return seedPromise;
}
async function seed() {
  if (await one("SELECT value FROM settings WHERE key='initialized'")) return;
  const now = Date.now(),
    cats = [
      [
        "general",
        "General",
        "Questions, ideas, and conversations that do not fit in a box.",
        "#f04412",
        "MessagesSquare",
        0,
      ],
      [
        "society",
        "Society",
        "The way we live together. Bring a perspective, stay curious.",
        "#8b5cf6",
        "Globe2",
        1,
      ],
      [
        "technology",
        "Technology",
        "Tools, discoveries, and the future we are making.",
        "#2878e8",
        "Cpu",
        2,
      ],
      [
        "culture",
        "Culture",
        "Books, photographs, art, and the things that move us.",
        "#df4e75",
        "Palette",
        3,
      ],
      [
        "feedback",
        "Feedback",
        "Help shape this little corner of the internet.",
        "#149787",
        "Lightbulb",
        4,
      ],
    ];
  const queries: D1PreparedStatement[] = [
    statement(
      "INSERT OR IGNORE INTO users (id,username,display_name,bio,role,onboarded,created_at) VALUES ('community_team','freespeech','FreeSpeech team','Community announcements and starter conversations.','moderator',1,?)",
      now - 86400000,
    ),
    ...cats.map((c) =>
      statement(
        "INSERT OR IGNORE INTO categories (slug,name,description,color,icon,position) VALUES (?,?,?,?,?,?)",
        ...c,
      ),
    ),
    ...Object.entries({
      registrations_open: "1",
      posting_open: "1",
      uploads_open: "1",
      max_video_seconds: "120",
      max_video_mb: "25",
      max_image_mb: "8",
      max_daily_uploads: "10",
      max_storage_mb: "8000",
      support_email: "",
      policy_reviewed: "0",
    }).map(([k, v]) =>
      statement(
        "INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)",
        k,
        v,
      ),
    ),
  ];
  const posts = [
    [
      "welcome_to_freespeech",
      "general",
      "Welcome to FreeSpeech. Make yourself at home.",
      "A place to ask a real question, share a different perspective, and leave with something to think about.\n\nStart with the community guidelines, choose a pseudonym, and introduce yourself below. You do not have to agree to belong here.",
      "text",
      1,
      now - 86400000,
    ],
    [
      "community_worth_joining",
      "general",
      "What makes an online community worth coming back to?",
      "For me, it is being able to disagree without the conversation falling apart.\n\nWhat makes a community feel worth your time? Thoughtful replies, interesting people, fewer distractions—or something else?",
      "text",
      0,
      now - 7200000,
    ],
    [
      "neighborhood_photo",
      "culture",
      "A quiet corner of the neighborhood. What does yours look like?",
      "A little break from the big questions. Share a photograph of a street, a park, or a place that feels like home.\n\nThis starter image was created for the forum. Your own photos are welcome in the replies.",
      "image",
      0,
      now - 5400000,
    ],
    [
      "moderation_transparency",
      "society",
      "Should platforms explain every moderation decision?",
      "A clear rule and an explanation seem like a good place to start. What should a fair appeals process look like?\n\nDisagree with an idea, ask a question, or share an experience.",
      "text",
      0,
      now - 3600000,
    ],
    [
      "reading_this_week",
      "culture",
      "What are you reading this week?",
      "An essay, a book, an article, a conversation you cannot stop thinking about. Share something worth spending time with—and tell us why.",
      "text",
      0,
      now - 1800000,
    ],
    [
      "build_this_together",
      "feedback",
      "What would make this forum better for you?",
      "We are starting small. Tell us what feels useful, what gets in your way, and what you would change.\n\nSpecific feedback helps: where were you, what did you expect, and what happened?",
      "text",
      0,
      now - 600000,
    ],
  ];
  for (const [id, cat, title, body, kind, pinned, time] of posts)
    queries.push(
      statement(
        "INSERT OR IGNORE INTO posts (id,user_id,category,title,body,kind,pinned,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        id,
        "community_team",
        cat,
        title,
        body,
        kind,
        pinned,
        time,
        time,
      ),
    );
  queries.push(
    statement(
      "INSERT OR IGNORE INTO media (id,owner_id,object_key,mime,kind,bytes,width,height,post_id,status,created_at) VALUES ('sample_neighborhood','community_team','asset:/media/neighborhood.png','image/png','image',0,1536,1024,'neighborhood_photo','attached',?)",
      now,
    ),
  );
  queries.push(
    statement(
      "INSERT OR IGNORE INTO settings (key,value) VALUES ('initialized','1')",
    ),
  );
  await database().batch(queries);
}
