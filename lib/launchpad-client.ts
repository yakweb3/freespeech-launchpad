export async function launchApi(path: string, data?: unknown) {
  const r = await fetch(
    "/api/launchpad/" + path,
    data === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forum-request": "1",
          },
          body: JSON.stringify(data),
        },
  );
  const value: any = await r.json();
  if (!r.ok) throw new Error(value.error || "Please try again.");
  return value;
}
export function toBase64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (c) => String.fromCharCode(c)).join(""));
}
export function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export function tokenAmount(value: string) {
  const n = BigInt(value),
    fraction = (n % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
  return (
    (n / 1000000n).toLocaleString("en-US") + (fraction ? "." + fraction : "")
  );
}
