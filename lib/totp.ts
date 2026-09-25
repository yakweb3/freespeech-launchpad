// RFC 6238 TOTP using Web Crypto. Six digits, SHA-1, 30-second steps.
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Uint8Array) {
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
export function decode32(value: string) {
  let bits = 0,
    n = 0;
  const out: number[] = [];
  for (const c of value.replace(/=+$/, "").toUpperCase()) {
    const d = alphabet.indexOf(c);
    if (d < 0) throw new Error("Invalid authenticator secret");
    n = (n << 5) | d;
    bits += 5;
    if (bits >= 8) {
      out.push((n >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
export async function totp(secret: string, step: number, digits = 6) {
  const key = await crypto.subtle.importKey(
    "raw",
    decode32(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(step));
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter)),
    offset = digest[digest.length - 1] & 15;
  return String(
    (new DataView(digest.buffer).getUint32(offset) & 0x7fffffff) % 10 ** digits,
  ).padStart(digits, "0");
}
export function randomToken(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function matchStep(
  secret: string,
  code: string,
  now = Date.now(),
) {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30000);
  for (const candidate of [step, step - 1, step + 1])
    if ((await totp(secret, candidate)) === code) return candidate;
  return null;
}
