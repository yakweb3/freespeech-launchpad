export class ForumError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ForumError";
  }
}
export function textValue(
  value: unknown,
  name: string,
  min: number,
  max: number,
) {
  if (typeof value !== "string")
    throw new ForumError(400, name + " is required.");
  const v = value.trim();
  if (v.length < min || v.length > max)
    throw new ForumError(
      400,
      name + " must be " + min + "–" + max + " characters.",
    );
  return v;
}
export function validUsername(value: unknown) {
  const v = textValue(value, "Username", 3, 24).toLowerCase();
  if (
    !/^[a-z][a-z0-9_]+$/.test(v) ||
    [
      "admin",
      "moderator",
      "deleted",
      "system",
      "support",
      "freespeech",
    ].includes(v)
  )
    throw new ForumError(
      400,
      "Use 3–24 letters, numbers, or underscores. Start with a letter and choose a non-reserved name.",
    );
  return v;
}
export function safeUrl(value: unknown) {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw new ForumError(400, "Enter a complete https:// link.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.length > 2000
  )
    throw new ForumError(
      400,
      "Only ordinary HTTP and HTTPS links are supported.",
    );
  return url.href;
}
export function validId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{5,80}$/.test(value))
    throw new ForumError(400, "Invalid item identifier.");
  return value;
}
export function isStaff(role: string) {
  return role === "admin" || role === "moderator";
}
export function isRestricted(
  user: { status: string; suspended_until: number | null },
  now = Date.now(),
) {
  return (
    user.status === "banned" ||
    user.status === "deleted" ||
    (user.status === "suspended" &&
      (!user.suspended_until || user.suspended_until > now))
  );
}
export function mentionNames(body: string) {
  return [
    ...new Set(
      [...body.matchAll(/(?:^|\s)@([a-z][a-z0-9_]{2,23})\b/gi)].map((m) =>
        m[1].toLowerCase(),
      ),
    ),
  ].slice(0, 10);
}
export const REPORT_REASONS = [
  "Spam",
  "Threats or violence",
  "Private information",
  "Targeted harassment",
  "Prohibited content",
  "Other",
];
export function voteValue(value: unknown) {
  if (value !== -1 && value !== 0 && value !== 1)
    throw new ForumError(400, "Vote must be -1, 0, or 1.");
  return value;
}
export function positiveInt(value: unknown, fallback: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, max) : fallback;
}
