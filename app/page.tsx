import Forum from "@/components/forum";
import { ensureSeed, currentMember, one } from "@/server/db";
import { redirect } from "next/navigation";
import { bootstrap, listPosts } from "@/server/queries";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureSeed();
  const params = await searchParams;
  if (typeof params.room === "string") {
    const room = await one(
      "SELECT mint FROM token_rooms WHERE category=?",
      params.room,
    );
    if (room) redirect("/rooms/" + room.mint);
  }
  if (params.create === "1") redirect("/launchpad?create=1");
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
