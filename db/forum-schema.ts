import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull().default(""),
    bio: text("bio").notNull().default(""),
    avatarId: text("avatar_id"),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
    suspendedUntil: integer("suspended_until"),
    restrictionReason: text("restriction_reason"),
    onboarded: integer("onboarded").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    deletedAt: integer("deleted_at"),
    notifyReplies: integer("notify_replies").notNull().default(1),
    notifyMentions: integer("notify_mentions").notNull().default(1),
    notifyFollowed: integer("notify_followed").notNull().default(1),
    emailNotifications: integer("email_notifications").notNull().default(0),
    totpSecret: text("totp_secret"),
    totpEnabled: integer("totp_enabled").notNull().default(0),
    totpLastStep: integer("totp_last_step"),
  },
  (t) => [index("idx_users_status").on(t.status)],
);
export const categories = sqliteTable("categories", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  position: integer("position").notNull().default(0),
  locked: integer("locked").notNull().default(0),
});
export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    category: text("category")
      .notNull()
      .references(() => categories.slug),
    title: text("title").notNull(),
    body: text("body").notNull(),
    kind: text("kind").notNull().default("text"),
    linkUrl: text("link_url"),
    status: text("status").notNull().default("active"),
    pinned: integer("pinned").notNull().default(0),
    locked: integer("locked").notNull().default(0),
    removalReason: text("removal_reason"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    editedAt: integer("edited_at"),
  },
  (t) => [
    index("idx_posts_category_created").on(t.category, t.createdAt),
    index("idx_posts_user_created").on(t.userId, t.createdAt),
    index("idx_posts_status_created").on(t.status, t.createdAt),
  ],
);
export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    parentId: text("parent_id"),
    body: text("body").notNull(),
    status: text("status").notNull().default("active"),
    removalReason: text("removal_reason"),
    createdAt: integer("created_at").notNull(),
    editedAt: integer("edited_at"),
  },
  (t) => [
    index("idx_comments_post_created").on(t.postId, t.createdAt),
    index("idx_comments_user").on(t.userId),
  ],
);
export const votes = sqliteTable(
  "votes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    value: integer("value").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    index("idx_votes_post").on(t.postId),
  ],
);
export const bookmarks = sqliteTable(
  "bookmarks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);
export const preferences = sqliteTable(
  "preferences",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(),
    target: text("target").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.target] })],
);
export const reads = sqliteTable(
  "reads",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    readAt: integer("read_at").notNull(),
    lastComment: text("last_comment"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);
export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    objectKey: text("object_key").notNull().unique(),
    mime: text("mime").notNull(),
    kind: text("kind").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    duration: integer("duration"),
    thumbnailId: text("thumbnail_id"),
    postId: text("post_id").references(() => posts.id),
    commentId: text("comment_id").references(() => comments.id),
    status: text("status").notNull().default("pending"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_media_post").on(t.postId),
    index("idx_media_comment").on(t.commentId),
    index("idx_media_owner_created").on(t.ownerId, t.createdAt),
  ],
);
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    actorId: text("actor_id"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    href: text("href").notNull(),
    readAt: integer("read_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_notifications_user_created").on(t.userId, t.createdAt)],
);
export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull(),
    status: text("status").notNull().default("open"),
    resolution: text("resolution"),
    resolvedBy: text("resolved_by"),
    createdAt: integer("created_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (t) => [
    index("idx_reports_status_created").on(t.status, t.createdAt),
    index("idx_reports_user").on(t.userId),
  ],
);
export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    actionId: text("action_id"),
    status: text("status").notNull().default("open"),
    response: text("response"),
    createdAt: integer("created_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (t) => [
    index("idx_tickets_status").on(t.status),
    index("idx_tickets_user").on(t.userId),
  ],
);
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_audit_created").on(t.createdAt),
    index("idx_audit_target").on(t.targetType, t.targetId),
  ],
);
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("idx_rate_limits_expiry").on(t.expiresAt)],
);
export const outbox = sqliteTable(
  "outbox",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lockedUntil: integer("locked_until"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_outbox_status").on(t.status)],
);
export const staffSessions = sqliteTable(
  "staff_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("idx_staff_sessions_user").on(t.userId)],
);
export const recoveryCodes = sqliteTable(
  "recovery_codes",
  { userId: text("user_id").notNull(), codeHash: text("code_hash").notNull() },
  (t) => [primaryKey({ columns: [t.userId, t.codeHash] })],
);
