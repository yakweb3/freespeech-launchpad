import { timingSafeEqual } from "node:crypto";
import { all, run } from "@/server/db";
import { finalizeLaunch } from "@/server/launchpad";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || ""),
    expected = Buffer.from("Bearer " + secret);
  if (
    !secret ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const pending = await all(
    "SELECT * FROM launches WHERE status='submitted' ORDER BY created_at LIMIT 5",
  );
  const results = await Promise.allSettled(pending.map(finalizeLaunch));
  await run("DELETE FROM wallet_challenges WHERE expires_at<?", Date.now());
  await run("DELETE FROM wallet_sessions WHERE expires_at<?", Date.now());
  return Response.json(
    {
      checked: pending.length,
      confirmed: results.filter(
        (r) => r.status === "fulfilled" && r.value.ready,
      ).length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
