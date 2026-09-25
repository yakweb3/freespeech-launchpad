import type { Member } from "@/lib/forum-types";
import { ForumError, isStaff } from "@/lib/forum-validation";
import { base32, randomToken, matchStep } from "@/lib/totp";
import {
  one,
  run,
  database,
  statement,
  requireStaff,
  limit,
  sha256,
  settingEnv,
  audit,
} from "./db";
const COOKIE = "forum_staff";
function encode(a: Uint8Array) {
  return btoa(String.fromCharCode(...a));
}
function decode(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function encryptionKey() {
  const value = settingEnv("STAFF_ENCRYPTION_KEY");
  if (!value)
    throw new ForumError(
      503,
      "Staff security needs to be configured by the site owner.",
    );
  const bytes = decode(value);
  if (bytes.length !== 32)
    throw new ForumError(503, "Staff security configuration is invalid.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
async function encrypt(secret: string, userId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
      await encryptionKey(),
      new TextEncoder().encode(secret),
    );
  return encode(iv) + "." + encode(new Uint8Array(cipher));
}
async function decrypt(value: string, userId: string) {
  const [iv, cipher] = value.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decode(iv),
        additionalData: new TextEncoder().encode(userId),
      },
      await encryptionKey(),
      decode(cipher),
    ),
  );
}
function sessionToken(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(COOKIE + "="))
      ?.slice(COOKIE.length + 1) || ""
  );
}
export async function staffVerified(request: Request, user: Member | null) {
  if (!user || !isStaff(user.role) || !user.totp_enabled) return false;
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  return !!(await one(
    "SELECT 1 FROM staff_sessions WHERE token_hash=? AND user_id=? AND expires_at>?",
    await sha256(token),
    user.id,
    Date.now(),
  ));
}
export async function verifiedStaff(
  request: Request,
  user: Member | null,
  admin = false,
) {
  const u = requireStaff(user, admin);
  if (!(await staffVerified(request, u)))
    throw new ForumError(
      403,
      "Verify your authenticator before using staff tools.",
    );
  return u;
}
export async function setupStaff(user: Member | null) {
  const u = requireStaff(user);
  if (u.totp_enabled)
    throw new ForumError(409, "Two-factor authentication is already enabled.");
  await limit(u.id, "2fa-setup", 4, 3600000);
  const secret = base32(crypto.getRandomValues(new Uint8Array(20)));
  await run(
    "UPDATE users SET totp_secret=?,totp_last_step=NULL WHERE id=? AND totp_enabled=0",
    await encrypt(secret, u.id),
    u.id,
  );
  return {
    secret,
    uri:
      "otpauth://totp/FreeSpeech:" +
      encodeURIComponent(u.username) +
      "?secret=" +
      secret +
      "&issuer=FreeSpeech&algorithm=SHA1&digits=6&period=30",
  };
}
export async function verifyStaff(
  request: Request,
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireStaff(user);
  await limit(u.id, "2fa-verify", 5, 300000);
  const row = await one(
    "SELECT totp_secret,totp_enabled,totp_last_step FROM users WHERE id=?",
    u.id,
  );
  if (!row?.totp_secret)
    throw new ForumError(409, "Set up an authenticator first.");
  const code = String(data.code || "")
    .trim()
    .replace(/\s/g, "");
  let recovery = false;
  if (row.totp_enabled && /^[a-f0-9]{24}$/.test(code)) {
    const result = await run(
      "DELETE FROM recovery_codes WHERE user_id=? AND code_hash=?",
      u.id,
      await sha256(code),
    );
    recovery = !!result.meta.changes;
    if (!recovery) throw new ForumError(403, "Invalid recovery code.");
  } else {
    const step = await matchStep(await decrypt(row.totp_secret, u.id), code);
    if (step === null)
      throw new ForumError(
        403,
        "That code is not valid. Try your current authenticator code.",
      );
    const changed = await run(
      "UPDATE users SET totp_last_step=?,totp_enabled=1 WHERE id=? AND (totp_last_step IS NULL OR totp_last_step<?)",
      step,
      u.id,
      step,
    );
    if (!changed.meta.changes)
      throw new ForumError(
        403,
        "That code was already used. Wait for the next code.",
      );
  }
  let codes: string[] = [];
  if (!row.totp_enabled) {
    codes = Array.from({ length: 8 }, () => randomToken(12));
    await database().batch(
      await Promise.all(
        codes.map(async (c) =>
          statement(
            "INSERT INTO recovery_codes (user_id,code_hash) VALUES (?,?)",
            u.id,
            await sha256(c),
          ),
        ),
      ),
    );
    await audit(
      u.id,
      "enable_2fa",
      "user",
      u.id,
      "Staff authenticator enabled.",
    );
  }
  const token = randomToken();
  await run(
    "INSERT INTO staff_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)",
    await sha256(token),
    u.id,
    Date.now() + 1800000,
  );
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    data: { ok: true, recoveryCodes: codes, usedRecoveryCode: recovery },
    cookie:
      COOKIE +
      "=" +
      token +
      "; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800" +
      secure,
  };
}
export async function lockStaff(request: Request, user: Member | null) {
  const u = requireStaff(user);
  await run("DELETE FROM staff_sessions WHERE user_id=?", u.id);
  return COOKIE + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
}
