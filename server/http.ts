import { readBounded } from "@/lib/media-inspection";
import { ForumError } from "@/lib/forum-validation";
export function response(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...extra,
    },
  });
}
export function guardMutation(request: Request) {
  const origin = request.headers.get("origin"),
    url = new URL(request.url);
  if (request.headers.get("x-forum-request") !== "1")
    throw new ForumError(403, "Refresh the page and try again.");
  if (origin) {
    let parsed: string;
    try {
      parsed = new URL(origin).origin;
    } catch {
      throw new ForumError(403, "Invalid request origin.");
    }
    if (parsed !== url.origin)
      throw new ForumError(403, "Cross-site requests are not allowed.");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ForumError(403, "Cross-site requests are not allowed.");
}
export async function jsonBody(request: Request): Promise<Record<string, any>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ForumError(415, "Use a JSON request.");
  if (Number(request.headers.get("content-length")) > 100000)
    throw new ForumError(413, "This request is too large.");
  const raw = new TextDecoder().decode(await readBounded(request.body, 100000));
  try {
    const data = JSON.parse(raw);
    if (!data || Array.isArray(data) || typeof data !== "object") throw 0;
    return data;
  } catch {
    throw new ForumError(400, "The request could not be read.");
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof ForumError)
    return response(
      { error: error.message },
      error.status,
      error.status === 429 ? { "Retry-After": "60" } : {},
    );
  const text = String(error);
  if (text.includes("UNIQUE constraint failed"))
    return response(
      { error: "That name or item is already in use. Please choose another." },
      409,
    );
  console.error("forum_request_failed", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return response(
    { error: "Something went wrong. Your draft is safe. Please try again." },
    503,
  );
}
