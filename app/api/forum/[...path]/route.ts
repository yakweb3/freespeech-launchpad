import { health, backup, maintenance } from "@/server/operations";
import { exportAccount } from "@/server/account";
import {
  staffVerified,
  setupStaff,
  verifyStaff,
  lockStaff,
} from "@/server/staff-auth";
import { staffDashboard, moderate } from "@/server/moderation";
import {
  uploadMedia,
  serveMedia,
  deleteUpload,
  linkThumbnail,
} from "@/server/media";
import {
  ensureSeed,
  currentMember,
  all,
  run,
  requireMember,
  one,
  PUBLIC_FIELDS,
} from "@/server/db";
import { bootstrap, listPosts, getPost, getComments } from "@/server/queries";
import {
  response,
  errorResponse,
  guardMutation,
  jsonBody,
} from "@/server/http";
import { ForumError, positiveInt, validId } from "@/lib/forum-validation";
import * as mutations from "@/server/mutations";
export async function GET(request: Request) {
  try {
    await ensureSeed();
    const user = await currentMember(),
      url = new URL(request.url),
      path = url.pathname.replace("/api/forum/", "").split("/");
    if (path[0] === "media" && path[1])
      return await serveMedia(request, path[1], user);
    if (path[0] === "bootstrap")
      return response({
        ...(await bootstrap(user)),
        staffVerified: await staffVerified(request, user),
      });
    if (path[0] === "health") return response(await health());
    if (path[0] === "backup") return response(await backup(request, user));
    if (path[0] === "export-account")
      return response(await exportAccount(user));
    if (path[0] === "staff")
      return response(await staffDashboard(request, user));
    if (path[0] === "posts")
      return response(
        path[1]
          ? {
              post: await getPost(validId(path[1]), user),
              ...(await getComments(
                path[1],
                user,
                positiveInt(url.searchParams.get("offset"), 0, 100000),
              )),
            }
          : await listPosts(url.searchParams, user),
      );
    if (path[0] === "notifications") {
      const u = requireMember(user, { allowRestricted: true });
      return response({
        notifications: await all(
          "SELECT id,kind,title,href,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
          u.id,
        ),
      });
    }
    if (path[0] === "profile") {
      const profile = await one(
        "SELECT " +
          PUBLIC_FIELDS +
          " FROM users WHERE username=? AND status!=?",
        path[1],
        "deleted",
      );
      if (!profile) throw new ForumError(404, "Member not found.");
      return response({ profile });
    }
    if (path[0] === "tickets") {
      const u = requireMember(user, {
        allowRestricted: true,
        onboarded: false,
      });
      return response({
        tickets: await all(
          "SELECT * FROM tickets WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
          u.id,
        ),
      });
    }
    throw new ForumError(404, "This page is unavailable.");
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    guardMutation(request);
    await ensureSeed();
    const user = await currentMember(),
      action = new URL(request.url).pathname.replace("/api/forum/", "");
    if (action === "upload") return response(await uploadMedia(request, user));
    const data = await jsonBody(request);
    if (action === "staff-verify") {
      const result = await verifyStaff(request, user, data);
      return response(result.data, 200, { "Set-Cookie": result.cookie });
    }
    if (action === "staff-lock")
      return response({ ok: true }, 200, {
        "Set-Cookie": await lockStaff(request, user),
      });
    const handlers: Record<string, () => Promise<unknown>> = {
      maintenance: () => maintenance(request, user),
      "staff-setup": () => setupStaff(user),
      moderate: () => moderate(request, user, data),
      "delete-upload": () => deleteUpload(user, data.id),
      thumbnail: () => linkThumbnail(user, data.video_id, data.thumbnail_id),
      profile: () => mutations.updateProfile(user, data),
      posts: () => mutations.createPost(user, data),
      comments: () => mutations.createComment(user, data),
      vote: () => mutations.setVote(user, data),
      bookmark: () => mutations.setBookmark(user, data),
      preference: () => mutations.setPreference(user, data),
      read: () => mutations.markRead(user, data),
      report: () => mutations.reportContent(user, data),
      ticket: () => mutations.submitTicket(user, data),
      "notification-settings": () => mutations.updateNotifications(user, data),
      "delete-account": () => mutations.deleteAccount(user, data),
      "edit-post": () => mutations.editPost(user, validId(data.id), data),
      "delete-post": () => mutations.deletePost(user, validId(data.id)),
      "edit-comment": () => mutations.editComment(user, validId(data.id), data),
      "delete-comment": () => mutations.deleteComment(user, validId(data.id)),
      "read-notifications": async () => {
        const u = requireMember(user, { allowRestricted: true });
        await run(
          "UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",
          Date.now(),
          u.id,
        );
        return { ok: true };
      },
    };
    if (!handlers[action]) throw new ForumError(404, "Unknown action.");
    return response(await handlers[action]());
  } catch (error) {
    return errorResponse(error);
  }
}
