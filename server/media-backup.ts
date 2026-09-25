import type { Member } from "@/lib/forum-types";
import { ForumError, validId, positiveInt } from "@/lib/forum-validation";
import { inspectMedia, readBounded } from "@/lib/media-inspection";
import { all, one, bucket, settings, audit, limit } from "./db";
import { verifiedStaff } from "./staff-auth";

async function record(id: string) {
  const row = await one("SELECT * FROM media WHERE id=?", validId(id));
  if (
    !row ||
    ["deleted", "uploading"].includes(row.status) ||
    !row.bytes ||
    row.object_key.startsWith("asset:")
  )
    throw new ForumError(
      404,
      "This media record cannot be backed up or restored.",
    );
  return row;
}
export async function listMediaBackups(request: Request, user: Member | null) {
  await verifiedStaff(request, user, true);
  const offset = positiveInt(
    new URL(request.url).searchParams.get("offset"),
    0,
    10000000,
  );
  const rows = await all(
    "SELECT id,mime,bytes,status,created_at FROM media WHERE status NOT IN ('deleted','uploading') AND bytes>0 AND object_key NOT LIKE 'asset:%' ORDER BY created_at,id LIMIT 51 OFFSET ?",
    offset,
  );
  return {
    media: rows.slice(0, 50),
    nextOffset: rows.length > 50 ? offset + 50 : null,
  };
}
export async function downloadMediaBackup(
  request: Request,
  user: Member | null,
  id: string,
) {
  const u = await verifiedStaff(request, user, true);
  const row = await record(id);
  const object = await bucket().get(row.object_key);
  if (!object)
    throw new ForumError(
      404,
      "The stored file is missing. Restore it from a saved backup.",
    );
  await audit(
    u.id,
    "media_backup",
    "media",
    row.id,
    "Administrator downloaded a media backup.",
  );
  const extension =
    row.mime === "video/mp4" ? "mp4" : row.mime === "image/png" ? "png" : "jpg";
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${row.id}.${extension}"`,
      "Content-Length": String(object.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function restoreMediaBackup(
  request: Request,
  user: Member | null,
  id: string,
) {
  const u = await verifiedStaff(request, user, true);
  const configuration = await settings();
  if (configuration.posting_open !== "0" || configuration.uploads_open !== "0")
    throw new ForumError(
      409,
      "Pause posting and uploads in community controls before restoring media.",
    );
  await limit(u.id, "restore-media", 60, 3600000);
  const row = await record(id);
  if (await bucket().head(row.object_key))
    throw new ForumError(
      409,
      "This file already exists. Recovery never overwrites stored files.",
    );
  const bytes = await readBounded(
    request.body,
    Math.min(row.bytes, 25 * 1048576),
  );
  const inspected = inspectMedia(bytes);
  if (
    bytes.length !== row.bytes ||
    inspected.mime !== row.mime ||
    inspected.width !== row.width ||
    inspected.height !== row.height ||
    inspected.duration !== row.duration
  )
    throw new ForumError(
      400,
      "This backup does not match the media record's size, format, dimensions and duration.",
    );
  const restored = await bucket().put(row.object_key, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: row.mime },
    customMetadata: { mediaId: row.id },
  });
  if (!restored)
    throw new ForumError(409, "The file was restored by another request.");
  // Account/content deletion remains available during a recovery freeze.
  const current = await one(
    "SELECT status,bytes FROM media WHERE id=?",
    row.id,
  );
  if (!current || current.status === "deleted" || !current.bytes) {
    await bucket().delete(row.object_key);
    throw new ForumError(
      409,
      "This media was deleted during recovery and cannot be restored.",
    );
  }
  await audit(
    u.id,
    "media_restore",
    "media",
    row.id,
    "Administrator restored a missing media file from backup.",
  );
  return { ok: true };
}
