import { auth } from "@/server/auth";
import { ensureSeed } from "@/server/db";
export async function GET(request: Request) {
  return auth().handler(request);
}
export async function POST(request: Request) {
  await ensureSeed();
  return auth().handler(request);
}
