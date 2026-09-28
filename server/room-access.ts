import { one, requireMember, limit } from "./db";
import { walletSession } from "./wallet-auth";
import { tokenBalance } from "./solana";
import type { Member } from "@/lib/forum-types";
import { ForumError } from "@/lib/forum-validation";
export async function requireRoomAccess(category: string, user: Member | null) {
  const room = await one(
    "SELECT mint,minimum FROM token_rooms WHERE category=?",
    category,
  );
  if (!room) return;
  const u = requireMember(user, { onboarded: false });
  const session = await walletSession();
  if (!session || session.user_id !== u.id)
    throw new ForumError(
      403,
      "Connect and verify your wallet to unlock this room.",
    );
  await limit(u.id, "room-balance", 180);
  const balance = await tokenBalance(session.address, room.mint);
  if (balance < BigInt(room.minimum))
    throw new ForumError(
      403,
      "Your wallet does not hold the minimum token balance for this room.",
    );
}
