import { headers } from "next/headers";
import { auth } from "./auth";
import { walletSession } from "./wallet-auth";
export async function getForumIdentity() {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) {
    const wallet = await walletSession();
    if (wallet) return { userId: wallet.user_id.replace(/^auth_/, ""), email: "", emailVerified: false };
  }
  return session
    ? {
        userId: session.user.id,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
      }
    : null;
}
