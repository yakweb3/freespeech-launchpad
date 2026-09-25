import type { Member } from "@/lib/forum-types";
import { ForumError } from "@/lib/forum-validation";
import { requireMember, limit, sha256, run, audit, settingEnv } from "./db";
export async function claimOwner(
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireMember(user);
  await limit(u.id, "owner-setup", 5, 3600000);
  const expected = settingEnv("OWNER_SETUP_CODE"),
    supplied = String(data.code || "");
  if (
    !expected ||
    supplied.length < 32 ||
    supplied.length > 128 ||
    (await sha256(expected)) !== (await sha256(supplied))
  )
    throw new ForumError(403, "Invalid owner setup code.");
  const result = await run(
    "UPDATE users SET role='admin' WHERE id=? AND role='member' AND status='active' AND NOT EXISTS (SELECT 1 FROM users WHERE role='admin' AND status!='deleted')",
    u.id,
  );
  if (!result.meta.changes)
    throw new ForumError(
      409,
      "An administrator already exists, or this account is ineligible.",
    );
  await audit(
    u.id,
    "owner_setup",
    "user",
    u.id,
    "Owner claimed administrator access with the private setup code.",
  );
  return { ok: true };
}
