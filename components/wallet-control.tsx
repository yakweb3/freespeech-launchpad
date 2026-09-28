"use client";
import { useEffect, useState } from "react";
import { getWallets } from "@wallet-standard/app";
import bs58 from "bs58";
import { launchApi, fromBase64, toBase64 } from "@/lib/launchpad-client";
import { Button } from "./ui/button";
export async function signLaunch(transaction: string, address: string) {
  const wallets = getWallets().get();
  const preferred = localStorage.getItem("forum-wallet-name");
  const wallet = wallets.find(
    (w) => w.name === preferred && w.features["solana:signTransaction"],
  );
  if (!wallet)
    throw new Error(
      "Connect the wallet used to prepare this launch on this device.",
    );
  const { accounts } = await (
    wallet.features["standard:connect"] as any
  ).connect();
  const account = accounts.find((a: any) => a.address === address);
  if (!account)
    throw new Error(
      "The selected wallet account changed. Switch back before signing.",
    );
  const [result] = await (
    wallet.features["solana:signTransaction"] as any
  ).signTransaction({
    account,
    transaction: fromBase64(transaction),
    chain: "solana:mainnet",
  });
  return toBase64(result.signedTransaction);
}
export default function WalletControl({
  onConnected,
}: {
  onConnected?: () => void;
}) {
  const [wallets, setWallets] = useState<any[]>([]),
    [address, setAddress] = useState(""),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const registry = getWallets();
    const refresh = () =>
      setWallets(
        registry
          .get()
          .filter(
            (w) =>
              w.features["solana:signMessage"] &&
              w.features["standard:connect"],
          ),
      );
    refresh();
    const off = registry.on("register", refresh),
      off2 = registry.on("unregister", refresh);
    void launchApi("session")
      .then((s) => setAddress(s.address || ""))
      .catch(() => {});
    return () => {
      off();
      off2();
    };
  }, []);
  async function connect(wallet: any) {
    setBusy(true);
    setError("");
    try {
      const { accounts } = await wallet.features["standard:connect"].connect();
      const account = accounts.find(
        (a: any) =>
          a.chains.includes("solana:mainnet") &&
          a.features.includes("solana:signMessage"),
      );
      if (!account)
        throw new Error("Choose a Solana mainnet account in your wallet.");
      const challenge = await launchApi("challenge", {
        address: account.address,
      });
      const [signed] = await wallet.features["solana:signMessage"].signMessage({
        account,
        message: new TextEncoder().encode(challenge.message),
      });
      await launchApi("verify", {
        id: challenge.id,
        signature: bs58.encode(signed.signature),
      });
      localStorage.setItem("forum-wallet-name", wallet.name);
      setAddress(account.address);
      setOpen(false);
      if (onConnected) onConnected();
      else location.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wallet-control">
      <Button
        type="button"
        variant={address ? "outline" : "default"}
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        {busy
          ? "Check your wallet…"
          : address
            ? address.slice(0, 4) + "…" + address.slice(-4)
            : "Connect wallet"}
      </Button>
      {open && (
        <section className="wallet-picker" aria-label="Choose a wallet">
          <strong>
            {address ? "Verify or switch wallet" : "Sign in with your wallet"}
          </strong>
          <p>A message signature proves ownership. It does not spend funds.</p>
          {wallets.map((w) => (
            <Button
              key={w.name}
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void connect(w)}
            >
              {w.name}
            </Button>
          ))}
          {!wallets.length && (
            <p>
              No compatible wallet detected. On your phone, open this site
              inside your Solana wallet’s browser. On desktop, enable a wallet
              extension such as Phantom or Solflare.
            </p>
          )}
          {address && <a href="/logout">Sign out of this device</a>}
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </section>
      )}
      {error && (
        <p className="launch-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
