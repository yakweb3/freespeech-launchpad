import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { one, run, limit, settings, requireMember } from "./db";
import { publicKey } from "./solana";
import { appOrigin } from "./origin";
import { ForumError } from "@/lib/forum-validation";
import type { Member } from "@/lib/forum-types";
const cookieName = "forum-wallet";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function walletCookie(token: string, age = 86400) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${appOrigin().startsWith("https:") ? "; Secure" : ""}`;
}
export async function walletSession() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return one(
    "SELECT s.user_id,s.address FROM wallet_sessions s JOIN users u ON u.id=s.user_id JOIN wallets w ON w.address=s.address AND w.user_id=s.user_id WHERE token_hash=? AND expires_at>? AND u.status!='deleted'",
    hash(token),
    Date.now(),
  );
}
export async function walletChallenge(
  data: Record<string, any>,
  user: Member | null,
) {
  const address = publicKey(data.address);
  await limit(address, "wallet-challenge", 6);
  const linked = user ? requireMember(user, { onboarded: false }).id : null;
  const id = randomBytes(32).toString("base64url"),
    now = Date.now();
  const message = `${new URL(appOrigin()).host} wants you to sign in with your Solana account:\n${address}\n\n${linked ? "Link this wallet to your current FreeSpeech account." : "Sign in to FreeSpeech."} This signature does not authorize a transaction or spending.\n\nURI: ${appOrigin()}\nVersion: 1\nChain: solana:mainnet\nNonce: ${id}\nIssued At: ${new Date(now).toISOString()}\nExpiration Time: ${new Date(now + 300000).toISOString()}`;
  await run("DELETE FROM wallet_challenges WHERE expires_at<?", now);
  await run(
    "INSERT INTO wallet_challenges (id,address,message,user_id,expires_at) VALUES (?,?,?,?,?)",
    id,
    address,
    message,
    linked,
    now + 300000,
  );
  return { id, message };
}
export async function verifyWallet(
  data: Record<string, any>,
  current: Member | null,
) {
  const c = await one(
    "SELECT * FROM wallet_challenges WHERE id=? AND expires_at>?",
    String(data.id).slice(0, 100),
    Date.now(),
  );
  if (!c)
    throw new ForumError(
      401,
      "The wallet request expired or was already used. Connect again.",
    );
  await limit(c.address, "wallet-verify", 10);
  if ((current?.id ?? null) !== c.user_id)
    throw new ForumError(
      401,
      "Your account changed. Connect the wallet again.",
    );
  let valid = false;
  try {
    valid = nacl.sign.detached.verify(
      new TextEncoder().encode(c.message),
      bs58.decode(String(data.signature).slice(0, 150)),
      new PublicKey(c.address).toBytes(),
    );
  } catch {}
  if (!valid)
    throw new ForumError(401, "The wallet signature could not be verified.");
  const consumed = await run(
    "DELETE FROM wallet_challenges WHERE id=? AND expires_at>?",
    c.id,
    Date.now(),
  );
  if (!consumed.meta.changes)
    throw new ForumError(401, "This sign-in request was already used.");
  let linked = await one(
    "SELECT user_id FROM wallets WHERE address=?",
    c.address,
  );
  if (linked && current && linked.user_id !== current.id)
    throw new ForumError(
      409,
      "This wallet is linked to another account. Sign out first to use it.",
    );
  if (!linked) {
    if (!current && (await settings()).registrations_open === "0")
      throw new ForumError(403, "Registrations are paused.");
    const id = current?.id ?? "auth_wallet_" + hash(c.address);
    if (!current)
      await run(
        "INSERT OR IGNORE INTO users (id,username,display_name,email,created_at) VALUES (?,?,?,'',?)",
        id,
        "wallet_" + hash(c.address).slice(0, 12),
        "New member",
        Date.now(),
      );
    await run(
      "INSERT OR IGNORE INTO wallets (address,user_id,created_at) VALUES (?,?,?)",
      c.address,
      id,
      Date.now(),
    );
    linked = await one(
      "SELECT user_id FROM wallets WHERE address=?",
      c.address,
    );
    if (linked?.user_id !== id)
      throw new ForumError(
        409,
        "This wallet is already linked to another account.",
      );
  }
  const user = await one(
    "SELECT status FROM users WHERE id=?",
    linked!.user_id,
  );
  if (!user || user.status === "deleted")
    throw new ForumError(403, "This account was deleted.");
  const token = randomBytes(32).toString("base64url");
  await run("DELETE FROM wallet_sessions WHERE expires_at<?", Date.now());
  await run(
    "INSERT INTO wallet_sessions (token_hash,address,user_id,expires_at) VALUES (?,?,?,?)",
    hash(token),
    c.address,
    linked!.user_id,
    Date.now() + 86400000,
  );
  return { cookie: walletCookie(token), address: c.address };
}
export async function signOutWallet() {
  const token = (await cookies()).get(cookieName)?.value;
  if (token)
    await run("DELETE FROM wallet_sessions WHERE token_hash=?", hash(token));
  return walletCookie("", 0);
}
