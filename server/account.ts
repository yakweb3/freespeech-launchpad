import type { Member } from "@/lib/forum-types";
import { all, one, requireMember, limit } from "./db";
export async function exportAccount(user: Member | null) {
  const u = requireMember(user, { allowRestricted: true });
  await limit(u.id, "export", 2, 3600000);
  const profile = await one(
    "SELECT id,username,display_name,email,bio,avatar_id,role,status,created_at,notify_replies,notify_mentions,notify_followed,email_notifications FROM users WHERE id=?",
    u.id,
  );
  const tables = [
    "posts",
    "comments",
    "votes",
    "bookmarks",
    "preferences",
    "reads",
    "notifications",
    "reports",
    "tickets",
    "wallets",
    "launches",
  ];
  const records = await Promise.all(
    tables.map(async (table) => [
      table,
      await all("SELECT * FROM " + table + " WHERE user_id=?", u.id),
    ]),
  );
  return {
    format: "freespeech-account-export-v1",
    exported_at: new Date().toISOString(),
    profile,
    ...Object.fromEntries(records),
    media: await all(
      "SELECT id,mime,kind,bytes,width,height,duration,post_id,comment_id,status,created_at FROM media WHERE owner_id=?",
      u.id,
    ),
  };
}
