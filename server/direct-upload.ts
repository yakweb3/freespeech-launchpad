import { issueSignedToken, presignUrl } from "@vercel/blob";
import type { Member } from "@/lib/forum-types";
import { ForumError, validId } from "@/lib/forum-validation";
import { one, run, requireMember, settings, limit, bucket } from "./db";
import { uploadMedia } from "./media";
import { mediaView } from "./queries";

export async function beginUpload(
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireMember(user),
    s = await settings();
  if (s.uploads_open === "0")
    throw new ForumError(403, "Uploads are temporarily paused.");
  await limit(u.id, "upload", Number(s.max_daily_uploads) || 10, 86400000);
  const mime = data.mime,
    bytes = Number(data.bytes),
    video = mime === "video/mp4";
  const max =
    (video
      ? Math.min(25, Number(s.max_video_mb) || 25)
      : Math.min(8, Number(s.max_image_mb) || 8)) * 1048576;
  if (
    !["image/jpeg", "image/png", "video/mp4"].includes(mime) ||
    !Number.isSafeInteger(bytes) ||
    bytes < 16 ||
    bytes > max
  )
    throw new ForumError(
      400,
      "Choose a supported picture or MP4 within the upload limits.",
    );
  const id = crypto.randomUUID(),
    key = "staging/" + u.id + "/" + id;
  const result = await run(
    "INSERT INTO media (id,owner_id,object_key,mime,kind,bytes,status,created_at) SELECT ?,?,?,?,?,?,'uploading',? WHERE COALESCE((SELECT SUM(bytes) FROM media),0)+?<=?",
    id,
    u.id,
    key,
    mime,
    video ? "video" : "image",
    bytes,
    Date.now(),
    bytes * 2,
    Number(s.max_storage_mb || 8000) * 1048576,
  );
  if (!result.meta.changes)
    throw new ForumError(507, "The community upload budget is full.");
  const validUntil = Date.now() + 5 * 60000;
  const token = await issueSignedToken({
    token: process.env.BLOB_READ_WRITE_TOKEN,
    pathname: key,
    operations: ["put"],
    validUntil,
    maximumSizeInBytes: bytes,
    allowedContentTypes: [mime],
  });
  const { presignedUrl } = await presignUrl(token, {
    access: "private",
    operation: "put",
    pathname: key,
    validUntil,
    maximumSizeInBytes: bytes,
    allowedContentTypes: [mime],
    addRandomSuffix: false,
    allowOverwrite: false,
  });
  return { id, uploadUrl: presignedUrl };
}
export async function finishUpload(
  user: Member | null,
  data: Record<string, any>,
) {
  const u = requireMember(user),
    id = validId(data.id);
  const row = await one(
    "SELECT * FROM media WHERE id=? AND owner_id=? AND status='uploading' AND object_key LIKE 'staging/%'",
    id,
    u.id,
  );
  if (!row) throw new ForumError(404, "Upload reservation not found.");
  if (row.thumbnail_id) {
    const completed = await one(
      "SELECT * FROM media WHERE id=? AND owner_id=? AND status='pending'",
      row.thumbnail_id,
      u.id,
    );
    if (!completed)
      throw new ForumError(409, "This upload has already been used.");
    return { media: mediaView(completed) };
  }
  const claim = await run(
    "UPDATE media SET status='finalizing' WHERE id=? AND status='uploading' AND thumbnail_id IS NULL",
    id,
  );
  if (!claim.meta.changes)
    throw new ForumError(409, "This upload is already being processed.");
  try {
    const object = await bucket().get(row.object_key);
    if (!object || object.size !== row.bytes)
      throw new ForumError(400, "The uploaded file is incomplete.");
    const request = new Request("https://upload.internal/", {
      method: "POST",
      body: object.body,
      duplex: "half",
    } as RequestInit);
    const completed = await uploadMedia(request, u, true);
    // Keep the staging object until maintenance expires its signed upload URL, preventing replay from recreating an orphan.
    await run(
      "UPDATE media SET status='uploading',thumbnail_id=? WHERE id=?",
      completed.media.id,
      id,
    );
    return completed;
  } catch (error) {
    await run(
      "UPDATE media SET status='uploading' WHERE id=? AND status='finalizing'",
      id,
    );
    throw error;
  }
}
