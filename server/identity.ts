import { headers } from "next/headers";
import { auth } from "./auth";
export async function getForumIdentity() {
  const session = await auth().api.getSession({ headers: await headers() });
  return session
    ? {
        userId: session.user.id,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
      }
    : null;
}
