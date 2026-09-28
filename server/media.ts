import type { Member } from "@/lib/forum-types";
import { ForumError, isStaff, validId } from "@/lib/forum-validation";
import { inspectMedia, readBounded } from "@/lib/media-inspection";
import { one, run, bucket, settings, limit, requireMember } from "./db";
import { mediaView } from "./queries";
import { requireRoomAccess } from "./room-access";
import { appOrigin } from "./origin";
export async function uploadMedia(
  request: Request,
  user: Member | null,
  alreadyReserved = false,
) {
  const u = requireMember(user),
    s = await settings();
  if (s.uploads_open === "0")
    throw new ForumError(403, "Uploads are temporarily paused.");
  if (!alreadyReserved)
    await limit(u.id, "upload", Number(s.max_daily_uploads) || 10, 86400000);
  const maxVideo = Math.min(25, Number(s.max_video_mb) || 25) * 1048576,
    maxImage = Math.min(8, Number(s.max_image_mb) || 8) * 1048576;
  if (
    Number(request.headers.get("content-length")) > Math.max(maxVideo, maxImage)
  )
    throw new ForumError(413, "This file is too large.");
  const input = await readBounded(request.body, Math.max(maxVideo, maxImage)),
    m = inspectMedia(input, Math.min(120, Number(s.max_video_seconds) || 120));
  if (m.bytes.length > (m.kind === "video" ? maxVideo : maxImage))
    throw new ForumError(413, "This file exceeds the upload size limit.");
  const id = crypto.randomUUID(),
    key = "uploads/" + u.id + "/" + id,
    now = Date.now(),
    quota = Math.max(1, Number(s.max_storage_mb) || 8000) * 1048576;
  // Reservation and quota check are one SQLite statement, so concurrent uploads cannot overrun the storage budget.
  const reserved = await run(
    "INSERT INTO media (id,owner_id,object_key,mime,kind,bytes,width,height,duration,status,created_at) SELECT ?,?,?,?,?,?,?,?,?,'uploading',? WHERE COALESCE((SELECT SUM(bytes) FROM media),0)+?<=?",
    id,
    u.id,
    key,
    m.mime,
    m.kind,
    m.bytes.length,
    m.width,
    m.height,
    m.duration,
    now,
    m.bytes.length,
    quota,
  );
  if (!reserved.meta.changes)
    throw new ForumError(
      507,
      "The community upload budget is full. Please share a link instead.",
    );
  try {
    await bucket().put(key, m.bytes, {
      httpMetadata: { contentType: m.mime },
      customMetadata: { mediaId: id },
    });
    await run("UPDATE media SET status='pending' WHERE id=?", id);
  } catch (e) {
    try {
      await bucket().delete(key);
      await run("DELETE FROM media WHERE id=?", id);
    } catch {}
    throw e;
  }
  return {
    media: mediaView({
      ...m,
      id,
      object_key: key,
      bytes: m.bytes.length,
      thumbnail_id: null,
    }),
  };
}
export async function serveMedia(
  request: Request,
  id: string,
  user: Member | null,
) {
  const m = await one("SELECT * FROM media WHERE id=?", validId(id));
  if (!m || ["deleted", "uploading", "finalizing"].includes(m.status))
    throw new ForumError(404, "Attachment not found.");
  if (m.status === "pending" && m.owner_id !== user?.id)
    throw new ForumError(404, "Attachment not found.");
  if (m.post_id) {
    const p = await one(
      "SELECT status,user_id,category FROM posts WHERE id=?",
      m.post_id,
    );
    if (
      !p ||
      p.status === "deleted" ||
      (p.status !== "active" &&
        p.user_id !== user?.id &&
        !isStaff(user?.role || ""))
    )
      throw new ForumError(404, "Attachment not found.");
    await requireRoomAccess(p.category, user);
  }
  if (m.comment_id) {
    const c = await one(
      "SELECT status,user_id FROM comments WHERE id=?",
      m.comment_id,
    );
    if (!c || c.status !== "active")
      throw new ForumError(404, "Attachment not found.");
  }
  if (m.object_key.startsWith("asset:"))
    return Response.redirect(new URL(m.object_key.slice(6), appOrigin()), 302);
  const range = request.headers.get("range");
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    const start = match?.[1],
      end = match?.[2];
    if (
      !match ||
      (!start && !end) ||
      (start !== "" && Number(start) >= m.bytes) ||
      (start !== "" && end !== "" && Number(end) < Number(start)) ||
      (start === "" && Number(end) === 0)
    )
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": "bytes */" + m.bytes },
      });
  }
  const object = await bucket().get(
    m.object_key,
    range ? { range: request.headers } : undefined,
  );
  if (!object) throw new ForumError(404, "Attachment not found.");
  const headers = new Headers({
    "Content-Type": m.mime,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
    "Content-Security-Policy": "default-src 'none'",
  });
  let status = 200;
  if (range && object.range) {
    const r = object.range as {
      offset?: number;
      length?: number;
      suffix?: number;
    };
    const offset =
        r.offset ?? Math.max(0, object.size - (r.suffix ?? object.size)),
      length = r.length ?? r.suffix ?? object.size;
    headers.set(
      "Content-Range",
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    );
    headers.set("Content-Length", String(length));
    status = 206;
  } else headers.set("Content-Length", String(object.size));
  return new Response(object.body, { status, headers });
}
export async function deleteUpload(user: Member | null, id: string) {
  const u = requireMember(user, { allowRestricted: true }),
    m = await one(
      "SELECT * FROM media WHERE id=? AND owner_id=? AND status='pending'",
      validId(id),
      u.id,
    );
  if (!m) throw new ForumError(404, "Draft attachment not found.");
  await run("UPDATE media SET status='deleted' WHERE id=?", id);
  await bucket().delete(m.object_key);
  await run("DELETE FROM media WHERE id=?", id);
  return { ok: true };
}

export async function linkThumbnail(
  user: Member | null,
  videoId: string,
  thumbnailId: string,
) {
  const u = requireMember(user),
    v = await one(
      "SELECT id FROM media WHERE id=? AND owner_id=? AND kind='video' AND status='pending'",
      validId(videoId),
      u.id,
    ),
    t = await one(
      "SELECT id FROM media WHERE id=? AND owner_id=? AND kind='image' AND status='pending'",
      validId(thumbnailId),
      u.id,
    );
  if (!v || !t)
    throw new ForumError(400, "These draft attachments are unavailable.");
  await run("UPDATE media SET thumbnail_id=? WHERE id=?", thumbnailId, videoId);
  return { ok: true };
}
