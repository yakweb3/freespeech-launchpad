import {
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { PUMP_SDK } from "@pump-fun/pump-sdk";
import bs58 from "bs58";
import {
  all,
  one,
  run,
  database,
  statement,
  requireMember,
  limit,
  settings,
} from "./db";
import { walletSession } from "./wallet-auth";
import { minimumUnits, rpc } from "./solana";
import { appOrigin } from "./origin";
import { ForumError, textValue, validId } from "@/lib/forum-validation";
import type { Member } from "@/lib/forum-types";

async function launchOwner(user: Member | null) {
  const u = requireMember(user),
    session = await walletSession();
  if (!session || session.user_id !== u.id)
    throw new ForumError(403, "Connect and verify your wallet first.");
  return { u, address: session.address as string };
}
export async function roomDirectory(offset = 0) {
  return all(
    "SELECT * FROM token_rooms ORDER BY created_at DESC LIMIT 25 OFFSET ?",
    offset,
  );
}
export async function prepareLaunch(
  user: Member | null,
  data: Record<string, any>,
) {
  const { u, address } = await launchOwner(user);
  if ((await settings()).posting_open === "0")
    throw new ForumError(403, "New launches are temporarily paused.");
  await limit(u.id, "prepare-launch", 5, 3600000);
  const name = textValue(data.name, "Token name", 2, 32),
    symbol = textValue(data.symbol, "Ticker", 1, 10).toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(symbol))
    throw new ForumError(400, "Use letters and numbers for the ticker.");
  const description = textValue(data.description, "Description", 10, 1000),
    minimum = minimumUnits(data.minimum);
  const imageId = validId(data.image_id);
  const image = await one(
    "SELECT id FROM media WHERE id=? AND owner_id=? AND kind='image' AND status='pending' AND post_id IS NULL AND comment_id IS NULL",
    imageId,
    u.id,
  );
  if (!image) throw new ForumError(400, "Upload a fresh token image first.");
  if ((await rpc("getGenesisHash")) !== "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d")
    throw new ForumError(503, "Launches require Solana mainnet.");
  const id = crypto.randomUUID(),
    mint = Keypair.generate(),
    creator = new PublicKey(address);
  const uri = appOrigin() + "/api/launchpad/metadata/" + id;
  if (uri.length > 200)
    throw new ForumError(503, "The metadata address is too long.");
  const instruction = await PUMP_SDK.createV2Instruction({
    mint: mint.publicKey,
    name,
    symbol,
    uri,
    creator,
    user: creator,
    mayhemMode: false,
    holderReward: false,
  });
  const block = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
  const tx = new Transaction({
    feePayer: creator,
    recentBlockhash: block.value.blockhash,
  }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    instruction,
  );
  tx.partialSign(mint);
  const message = tx.serializeMessage().toString("base64"),
    transaction = tx
      .serialize({ requireAllSignatures: false })
      .toString("base64");
  const fee = await rpc("getFeeForMessage", [
    message,
    { commitment: "confirmed" },
  ]);
  await database().batch([
    statement(
      "INSERT INTO launches (id,mint,user_id,wallet,name,symbol,description,image_id,minimum,[transaction],message,last_valid_block_height,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      id,
      mint.publicKey.toBase58(),
      u.id,
      address,
      name,
      symbol,
      description,
      imageId,
      minimum,
      transaction,
      message,
      block.value.lastValidBlockHeight,
      Date.now(),
    ),
    statement(
      "UPDATE media SET status='token-logo' WHERE id=? AND owner_id=? AND status='pending'",
      imageId,
      u.id,
    ),
  ]);
  return {
    id,
    mint: mint.publicKey.toBase58(),
    transaction,
    wallet: address,
    networkFeeLamports: fee.value,
    minimum,
    name,
    symbol,
  };
}
async function ownedLaunch(user: Member | null, id: unknown) {
  const { u, address } = await launchOwner(user);
  const launch = await one(
    "SELECT * FROM launches WHERE id=? AND user_id=? AND wallet=?",
    validId(id),
    u.id,
    address,
  );
  if (!launch) throw new ForumError(404, "Launch not found for this wallet.");
  return launch;
}
export async function submitLaunch(
  user: Member | null,
  data: Record<string, any>,
) {
  const launch = await ownedLaunch(user, data.id);
  await limit(launch.user_id, "submit-launch", 12);
  if (launch.signature) return { signature: launch.signature, id: launch.id };
  let tx: Transaction;
  try {
    const raw = String(data.transaction);
    if (raw.length > 5000) throw 0;
    tx = Transaction.from(Buffer.from(raw, "base64"));
    if (
      tx.serializeMessage().toString("base64") !== launch.message ||
      !tx.verifySignatures() ||
      !tx.signature
    )
      throw 0;
  } catch {
    throw new ForumError(
      400,
      "The signed transaction does not match this launch. Nothing was submitted.",
    );
  }
  if (
    (await rpc("getBlockHeight", [{ commitment: "confirmed" }])) >
    launch.last_valid_block_height
  )
    throw new ForumError(
      409,
      "This transaction expired. Prepare a new launch; this one was not submitted.",
    );
  const signature = bs58.encode(tx.signature!);
  // Save the exact signed transaction before sending. A retry can safely resend identical bytes.
  const saved = await run(
    "UPDATE launches SET [transaction]=?,signature=?,status='submitted' WHERE id=? AND signature IS NULL",
    tx.serialize().toString("base64"),
    signature,
    launch.id,
  );
  if (saved.meta.changes) {
    try { await rpc("sendTransaction", [
      tx.serialize().toString("base64"),
      {
        encoding: "base64",
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 3,
      },
    ]); } catch {
      // The persisted signature is the receipt even when delivery is uncertain.
      // Confirmation and the cron retry the same signed bytes, never a new launch.
    }
  }
  return { signature, id: launch.id };
}
export async function confirmLaunch(
  user: Member | null,
  data: Record<string, any>,
) {
  const launch = await ownedLaunch(user, data.id);
  await limit(launch.user_id, "confirm-launch", 30);
  return finalizeLaunch(launch);
}
export async function finalizeLaunch(launch: Record<string, any>) {
  if (launch.status === "confirmed") return { ready: true, mint: launch.mint };
  if (!launch.signature) return { ready: false, status: "prepared" };
  const chain = await rpc("getTransaction", [
    launch.signature,
    {
      encoding: "base64",
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    },
  ]);
  if (!chain) {
    const height = await rpc("getBlockHeight", [{ commitment: "finalized" }]);
    if (height > launch.last_valid_block_height) {
      await run(
        "UPDATE launches SET status='expired' WHERE id=? AND status='submitted'",
        launch.id,
      );
      throw new ForumError(
        409,
        "The transaction was not finalized before expiry. Check its explorer link before trying a new launch.",
      );
    }
    try {
      await rpc("sendTransaction", [
        launch.transaction,
        {
          encoding: "base64",
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 2,
        },
      ]);
    } catch {}
    return { ready: false, status: "confirming", signature: launch.signature };
  }
  if (!chain.meta || chain.meta.err) {
    await run(
      "UPDATE launches SET status='failed' WHERE id=? AND status='submitted'",
      launch.id,
    );
    throw new ForumError(
      409,
      "The launch transaction failed on-chain. No room was created.",
    );
  }
  let valid = false;
  try {
    const tx = Transaction.from(Buffer.from(chain.transaction[0], "base64"));
    valid =
      tx.serializeMessage().toString("base64") === launch.message &&
      !!tx.signature &&
      bs58.encode(tx.signature) === launch.signature &&
      tx.verifySignatures();
  } catch {}
  if (!valid)
    throw new ForumError(
      409,
      "The on-chain transaction does not match this launch.",
    );
  const category = "r-" + launch.id.replaceAll("-", "");
  await database().batch([
    statement(
      "INSERT OR IGNORE INTO categories (slug,name,description,color,icon,position) VALUES (?,?,?,'#f04412','MessageSquare',100)",
      category,
      launch.name,
      launch.description,
    ),
    statement(
      "INSERT OR IGNORE INTO token_rooms (mint,category,launch_id,creator_id,name,symbol,description,image_id,minimum,decimals,created_at) VALUES (?,?,?,?,?,?,?,?,?,6,?)",
      launch.mint,
      category,
      launch.id,
      launch.user_id,
      launch.name,
      launch.symbol,
      launch.description,
      launch.image_id,
      launch.minimum,
      Date.now(),
    ),
    statement("UPDATE launches SET status='confirmed' WHERE id=?", launch.id),
  ]);
  return { ready: true, mint: launch.mint };
}
export async function manageRoom(
  user: Member | null,
  data: Record<string, any>,
) {
  const { u } = await launchOwner(user);
  const room = await one(
    "SELECT * FROM token_rooms WHERE mint=? AND creator_id=?",
    String(data.mint),
    u.id,
  );
  if (!room)
    throw new ForumError(
      403,
      "Only this room's creator can use its management tools.",
    );
  await limit(u.id, "room-manage", 20);
  const reason = textValue(data.reason, "Reason", 5, 500),
    action = String(data.action);
  const work = [];
  if (action === "lock-room" || action === "unlock-room") {
    work.push(
      statement(
        "UPDATE categories SET locked=? WHERE slug=?",
        action === "lock-room" ? 1 : 0,
        room.category,
      ),
    );
  } else if (
    ["remove-post", "lock-post", "unlock-post", "remove-comment"].includes(
      action,
    )
  ) {
    const id = validId(data.id);
    const target =
      action === "remove-comment"
        ? await one(
            "SELECT c.id,c.user_id FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=? AND p.category=? AND c.status='active'",
            id,
            room.category,
          )
        : await one(
            "SELECT id,user_id FROM posts WHERE id=? AND category=? AND status='active'",
            id,
            room.category,
          );
    if (!target)
      throw new ForumError(404, "This content is not available in your room.");
    if (action.startsWith("remove"))
      work.push(
        statement(
          "UPDATE " +
            (action === "remove-comment" ? "comments" : "posts") +
            " SET status='removed',removal_reason=? WHERE id=?",
          reason,
          id,
        ),
      );
    else
      work.push(
        statement(
          "UPDATE posts SET locked=? WHERE id=?",
          action === "lock-post" ? 1 : 0,
          id,
        ),
      );
    work.push(
      statement(
        "INSERT INTO notifications (id,user_id,actor_id,kind,title,href,created_at) VALUES (?,?,?,'moderation',?,?,?)",
        crypto.randomUUID(),
        target.user_id,
        u.id,
        "Room moderation: " + reason,
        "/?page=contact",
        Date.now(),
      ),
    );
  } else throw new ForumError(400, "Unsupported room action.");
  work.push(
    statement(
      "INSERT INTO audit_log (id,actor_id,action,target_type,target_id,reason,details,created_at) VALUES (?,?,?,'room',?,?,?,?)",
      crypto.randomUUID(),
      u.id,
      action,
      room.mint,
      reason,
      JSON.stringify({ content_id: data.id || null }),
      Date.now(),
    ),
  );
  await database().batch(work);
  return { ok: true };
}
export async function launchMetadata(id: string) {
  const launch = await one(
    "SELECT mint,name,symbol,description,image_id FROM launches WHERE id=?",
    validId(id),
  );
  if (!launch) throw new ForumError(404, "Metadata not found.");
  return {
    name: launch.name,
    symbol: launch.symbol,
    description: launch.description,
    image: appOrigin() + "/api/forum/media/" + launch.image_id,
    external_url: appOrigin() + "/rooms/" + launch.mint,
    showName: true,
  };
}
