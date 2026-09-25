import Forum from "@/components/forum";
import { ensureSeed, currentMember } from "@/server/db";
import { bootstrap, listPosts } from "@/server/queries";
export default async function Home() {
  await ensureSeed();
  const user = await currentMember();
  const [initial, feed] = await Promise.all([
    bootstrap(user),
    listPosts(new URLSearchParams(), user),
  ]);
  return (
    <Forum
      initial={{ ...initial, staffVerified: false }}
      initialPosts={feed.posts}
    />
  );
}
