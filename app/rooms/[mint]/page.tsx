import { notFound } from "next/navigation";
import { one } from "@/server/db";
import TokenRoom from "@/components/token-room";
export const dynamic = "force-dynamic";
export default async function RoomPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) notFound();
  const room = await one("SELECT * FROM token_rooms WHERE mint=?", mint);
  if (!room) notFound();
  return <TokenRoom room={room} />;
}
