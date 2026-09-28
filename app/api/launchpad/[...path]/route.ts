import {
  ensureSeed,
  currentMember,
  one,
  all,
  limit,
  sha256,
} from "@/server/db";
import {
  response,
  errorResponse,
  guardMutation,
  jsonBody,
} from "@/server/http";
import {
  walletChallenge,
  verifyWallet,
  walletSession,
  signOutWallet,
} from "@/server/wallet-auth";
import {
  prepareLaunch,
  submitLaunch,
  confirmLaunch,
  roomDirectory,
  launchMetadata,
  manageRoom,
} from "@/server/launchpad";
import { requireRoomAccess } from "@/server/room-access";
import { ForumError, positiveInt } from "@/lib/forum-validation";
import { rpc } from "@/server/solana";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await ensureSeed();
    const url = new URL(request.url),
      parts = url.pathname.replace("/api/launchpad/", "").split("/");
    if (parts[0] === "metadata")
      return response(await launchMetadata(parts[1]));
    if (parts[0] === "rooms")
      return response({
        rooms: await roomDirectory(
          positiveInt(url.searchParams.get("offset"), 0, 100000),
        ),
      });
    if (parts[0] === "network") {
      await limit(
        await sha256(
          request.headers.get("x-vercel-forwarded-for") ||
            request.headers.get("x-forwarded-for") ||
            "local",
        ),
        "network-check",
        12,
      );
      const genesis = await rpc("getGenesisHash");
      if (genesis !== "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")
        throw new ForumError(503, "Solana mainnet is not connected.");
      return response({ ok: true, network: "solana:mainnet" });
    }
    const user = await currentMember(),
      session = await walletSession();
    if (parts[0] === "session")
      return response({
        address: user && session?.user_id === user.id ? session.address : null,
        user,
      });
    if (parts[0] === "launches")
      return response({
        launches: user
          ? await all(
              "SELECT id,mint,name,symbol,status,signature,created_at FROM launches WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
              user.id,
            )
          : [],
      });
    if (parts[0] === "access") {
      const room = await one(
        "SELECT * FROM token_rooms WHERE mint=?",
        parts[1],
      );
      if (!room) throw new ForumError(404, "Room not found.");
      await requireRoomAccess(room.category, user);
      return response({ unlocked: true });
    }
    throw new ForumError(404, "Not found.");
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    guardMutation(request);
    await ensureSeed();
    const action = new URL(request.url).pathname.replace("/api/launchpad/", ""),
      data = await jsonBody(request);
    if (action === "logout")
      return response({ ok: true }, 200, {
        "Set-Cookie": await signOutWallet(),
      });
    const user = await currentMember();
    if (action === "challenge") {
      await limit(
        await sha256(
          request.headers.get("x-vercel-forwarded-for") ||
            request.headers.get("x-forwarded-for") ||
            "local",
        ),
        "wallet-ip",
        30,
      );
      return response(await walletChallenge(data, user));
    }
    if (action === "verify") {
      const r = await verifyWallet(data, user);
      return response({ address: r.address }, 200, { "Set-Cookie": r.cookie });
    }
    if (action === "prepare") return response(await prepareLaunch(user, data));
    if (action === "submit") return response(await submitLaunch(user, data));
    if (action === "confirm") return response(await confirmLaunch(user, data));
    if (action === "manage") return response(await manageRoom(user, data));
    throw new ForumError(404, "Not found.");
  } catch (e) {
    return errorResponse(e);
  }
}
