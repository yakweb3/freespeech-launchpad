import { PublicKey } from "@solana/web3.js";
import { ForumError } from "@/lib/forum-validation";
export function publicKey(value: unknown): string {
  try {
    const p = new PublicKey(String(value));
    if (!PublicKey.isOnCurve(p.toBytes())) throw 0;
    return p.toBase58();
  } catch {
    throw new ForumError(400, "Use a valid Solana wallet or token address.");
  }
}
export async function rpc(
  method: string,
  params: unknown[] = [],
): Promise<any> {
  try {
    const r = await fetch(
      process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      },
    );
    if (!r.ok) throw 0;
    const data: any = await r.json();
    if (data.error || !("result" in data)) throw 0;
    return data.result;
  } catch {
    throw new ForumError(
      503,
      "Solana is temporarily unavailable. Please try again; access stays locked until verified.",
    );
  }
}
export function minimumUnits(value: unknown): string {
  const s = String(value ?? "1");
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(s))
    throw new ForumError(
      400,
      "Choose a minimum balance with up to six decimal places.",
    );
  const [whole, fraction = ""] = s.split(".");
  const n = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  if (n < 1n || n > 1000000000000000n)
    throw new ForumError(
      400,
      "Minimum balance must be greater than zero and at most one billion tokens.",
    );
  return n.toString();
}
export async function tokenBalance(
  address: string,
  mint: string,
): Promise<bigint> {
  const result = await rpc("getTokenAccountsByOwner", [
    address,
    { mint },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  if (!Array.isArray(result?.value))
    throw new ForumError(503, "Could not verify your token balance.");
  return result.value.reduce((sum: bigint, row: any) => {
    const info = row.account?.data?.parsed?.info;
    if (
      info?.owner !== address ||
      info?.mint !== mint ||
      !/^\d+$/.test(info?.tokenAmount?.amount ?? "") ||
      info?.tokenAmount?.decimals !== 6
    )
      throw new ForumError(503, "Could not verify your token balance.");
    return sum + BigInt(info.tokenAmount.amount);
  }, 0n);
}
