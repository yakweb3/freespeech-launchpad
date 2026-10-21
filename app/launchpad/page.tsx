import Launchpad from "@/components/launchpad";
import { ensureSeed } from "@/server/db";
import { roomDirectory } from "@/server/launchpad";
export const dynamic = "force-dynamic";
export default async function LaunchpadPage() {
  await ensureSeed();
  return <Launchpad initialRooms={await roomDirectory()} />;
}
