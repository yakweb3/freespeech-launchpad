"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  LockKeyhole,
  Rocket,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import WalletControl, { signLaunch } from "./wallet-control";
import { launchApi, tokenAmount } from "@/lib/launchpad-client";
import { Button } from "./ui/button";
import { preparePicture, uploadFile } from "@/lib/client-upload";
export default function Launchpad({
  initialRooms = [],
}: {
  initialRooms?: any[];
}) {
  const [rooms, setRooms] = useState(initialRooms),
    [session, setSession] = useState<any>(null),
    [launches, setLaunches] = useState<any[]>([]);
  const [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [name, setName] = useState(""),
    [symbol, setSymbol] = useState(""),
    [description, setDescription] = useState(""),
    [minimum, setMinimum] = useState("1"),
    [file, setFile] = useState<File | null>(null),
    [prepared, setPrepared] = useState<any>(null);
  const [username, setUsername] = useState(""),
    [accepted, setAccepted] = useState(false),
    [offset, setOffset] = useState(initialRooms.length),
    [more, setMore] = useState(initialRooms.length === 25);
  async function refresh() {
    const [s, l] = await Promise.all([
      launchApi("session"),
      launchApi("launches"),
    ]);
    setSession(s);
    setLaunches(l.launches);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function onboarding(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/forum/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forum-request": "1" },
        body: JSON.stringify({
          username,
          display_name: username,
          accept_rules: accepted,
        }),
      });
      const j: any = await r.json();
      if (!r.ok) throw new Error(j.error);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function prepare(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("Uploading the token image…");
    try {
      if (!file) throw new Error("Choose a token image.");
      const image = await uploadFile(await preparePicture(file), (p) =>
        setStatus("Uploading image: " + p + "%"),
      );
      setStatus("Preparing your pump.fun launch…");
      const p = await launchApi("prepare", {
        name,
        symbol,
        description,
        minimum,
        image_id: image.id,
      });
      setPrepared(p);
      setStatus("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  async function confirm(id: string) {
    for (let i = 0; i < 18; i++) {
      const result = await launchApi("confirm", { id });
      if (result.ready) {
        location.assign("/rooms/" + result.mint);
        return;
      }
      setStatus(
        "Waiting for Solana to finalize your launch. You can safely return to My launches.",
      );
      await new Promise((r) => setTimeout(r, 5000));
    }
    setStatus("Still confirming. Use Check launch below to resume.");
  }
  async function launch() {
    setBusy(true);
    setError("");
    try {
      setStatus("Review and approve the transaction in your wallet…");
      const signed = await signLaunch(prepared.transaction, prepared.wallet);
      const r = await launchApi("submit", {
        id: prepared.id,
        transaction: signed,
      });
      await refresh();
      await confirm(r.id);
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="launch-shell">
      <header className="launch-nav">
        <a href="/" className="auth-brand">
          free<span>speech</span>
          <small> / launchpad</small>
        </a>
        <div>
          <a href="/forum">Public forum</a>
          <WalletControl key={session?.address || "disconnected"} onConnected={() => void refresh()} />
        </div>
      </header>
      <main className="launch-main">
        <section className="launch-hero">
          <div>
            <span className="launch-eyebrow">
              <span /> SOLANA COMMUNITIES
            </span>
            <h1>
              Launch a token.
              <br />
              <em>Start a conversation.</em>
            </h1>
            <p>
              Create on pump.fun. Bring your holders together in a room of their
              own—with posts, pictures, videos, and real discussions.
            </p>
            <div className="launch-hero-actions">
              <Button
                size="lg"
                onClick={() => {
                  setShow(true);
                  setTimeout(
                    () =>
                      document
                        .getElementById("launch-form")
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        }),
                    0,
                  );
                }}
              >
                <Rocket size={18} /> Launch your community
              </Button>
              <a href="#communities">
                Explore rooms <ArrowUpRight size={17} />
              </a>
            </div>
            <small>
              Wallet-owned tokens · Holder-only discussions · Powered by
              pump.fun
            </small>
          </div>
          <div className="launch-illustration" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="coin-visual">
              <MessageSquare size={65} strokeWidth={1.5} />
            </div>
            <span className="visual-label">
              <LockKeyhole size={16} /> Your holders. Your room.
            </span>
            <span className="visual-chip">CONNECTED BY CONVERSATION</span>
          </div>
        </section>
        <div className="launch-steps">
          <span>
            <Rocket /> 01 · Launch on pump.fun
          </span>
          <span>
            <ShieldCheck /> 02 · Confirm on Solana
          </span>
          <span>
            <MessageSquare /> 03 · Unlock your room
          </span>
        </div>
        {session?.user && !session.user.onboarded && (
          <section className="launch-panel">
            <h2>Choose your community identity</h2>
            <form className="forum-form" onSubmit={onboarding}>
              <label>
                Public username
                <input
                  required
                  minLength={3}
                  maxLength={24}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="launch-consent">
                <input
                  type="checkbox"
                  required
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />{" "}
                I’m 18 or older and accept the <a href="/?page=terms">terms</a>,{" "}
                <a href="/?page=privacy">privacy policy</a> and{" "}
                <a href="/?page=rules">community rules</a>.
              </label>
              <Button disabled={busy}>Save username</Button>
            </form>
          </section>
        )}
        {show && (
          <section id="launch-form" className="launch-panel">
            <div className="section-title">
              <h2>Launch your community</h2>
              <button disabled={busy} onClick={() => setShow(false)}>
                Close
              </button>
            </div>
            {!session?.address ? (
              <>
                <p>Connect your wallet to create a token and its room.</p>
                <WalletControl onConnected={() => void refresh()} />
              </>
            ) : !session.user?.onboarded ? (
              <p>Choose your username above first.</p>
            ) : prepared ? (
              <div className="launch-review">
                <h3>
                  Review {prepared.name} · ${prepared.symbol}
                </h3>
                <p>
                  Solana mainnet · pump.fun token creation · No initial purchase
                </p>
                <p>
                  Room access: hold at least {tokenAmount(prepared.minimum)}{" "}
                  tokens. The creator also needs this balance to join
                  discussions.
                </p>
                <p className="mint-address">Mint: {prepared.mint}</p>
                <p>
                  Estimated network fee:{" "}
                  {prepared.networkFeeLamports == null
                    ? "shown in your wallet"
                    : prepared.networkFeeLamports / 1e9 + " SOL"}
                  . Account rent and any pump.fun creation charges are
                  additional. Review the wallet’s simulation before approval.
                </p>
                <p>
                  Your token name, ticker, description and image become public.
                  This is a real, irreversible mainnet transaction. Token value
                  is not guaranteed.
                </p>
                <Button disabled={busy} onClick={() => void launch()}>
                  Approve launch in wallet
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setPrepared(null);
                    setStatus("");
                  }}
                >
                  Start a new draft
                </Button>
              </div>
            ) : (
              <form className="forum-form launch-form-grid" onSubmit={prepare}>
                <label>
                  Token name
                  <input
                    required
                    minLength={2}
                    maxLength={32}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your community"
                  />
                </label>
                <label>
                  Ticker
                  <input
                    required
                    maxLength={10}
                    pattern="[A-Za-z0-9]+"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="COMM"
                  />
                </label>
                <label className="full">
                  Public description
                  <textarea
                    required
                    minLength={10}
                    maxLength={1000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What brings your community together?"
                  />
                </label>
                <label>
                  Token image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    required
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <small>This image will be public.</small>
                </label>
                <label>
                  Minimum tokens to enter
                  <input
                    required
                    inputMode="decimal"
                    value={minimum}
                    onChange={(e) => setMinimum(e.target.value)}
                  />
                  <small>Fixed at launch. Up to six decimal places.</small>
                </label>
                <p className="full">
                  Launching creates the token without buying it. Holders can buy
                  through pump.fun. We never request your seed phrase or private
                  key.
                </p>
                <Button disabled={busy} className="full">
                  {busy ? "Preparing…" : "Prepare launch & review"}
                </Button>
              </form>
            )}
          </section>
        )}
        {error && (
          <p role="alert" className="launch-error">
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="launch-status">
            {status}
          </p>
        )}
        {launches.length > 0 && (
          <section className="launch-panel">
            <h2>My launches</h2>
            <p>Return here if confirmation was interrupted.</p>
            {launches.map((l) => (
              <div className="launch-history" key={l.id}>
                <div>
                  <strong>
                    {l.name} · ${l.symbol}
                  </strong>
                  <small>{l.status}</small>
                </div>
                {l.status === "confirmed" ? (
                  <a href={"/rooms/" + l.mint}>Open room →</a>
                ) : l.signature ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await confirm(l.id);
                      } catch (e) {
                        setError((e as Error).message);
                        setStatus("");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Check launch
                  </Button>
                ) : (
                  <small>Unsigned draft</small>
                )}
                {l.signature && (
                  <a
                    href={"https://solscan.io/tx/" + l.signature}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Transaction ↗
                  </a>
                )}
              </div>
            ))}
          </section>
        )}
        <section id="communities">
          <div className="section-title">
            <div>
              <span className="launch-eyebrow">FIND YOUR PEOPLE</span>
              <h2>Community rooms</h2>
            </div>
            <span className="room-count">
              {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
            </span>
          </div>
          {rooms.length ? (
            <div className="room-grid">
              {rooms.map((r) => (
                <a className="room-card" key={r.mint} href={"/rooms/" + r.mint}>
                  <div className="room-card-top">
                    <img src={"/api/forum/media/" + r.image_id} alt="" />
                    <span>
                      <LockKeyhole size={13} /> HOLDERS ONLY
                    </span>
                  </div>
                  <h3>
                    {r.name} <small>${r.symbol}</small>
                  </h3>
                  <p>{r.description}</p>
                  <footer>
                    <span>
                      Hold {tokenAmount(r.minimum)} ${r.symbol}
                    </span>
                    <ArrowUpRight size={20} />
                  </footer>
                </a>
              ))}
            </div>
          ) : (
            <div className="rooms-empty">
              <MessageSquare size={34} />
              <h3>The first room starts with you.</h3>
              <p>
                Confirmed launches appear here automatically. Every room has its
                own token and conversation.
              </p>
              <Button variant="outline" onClick={() => setShow(true)}>
                Create the first community
              </Button>
            </div>
          )}
          {more && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const r = await launchApi("rooms?offset=" + offset);
                  setRooms([...rooms, ...r.rooms]);
                  setOffset(offset + r.rooms.length);
                  setMore(r.rooms.length === 25);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Load more rooms
            </Button>
          )}
        </section>
        <footer className="launch-footer">
          <span>FreeSpeech · Communities on Solana</span>
          <div>
            <a href="/?page=rules">Community rules</a>
            <a href="/?page=privacy">Privacy</a>
            <a href="/?page=contact">Contact & appeals</a>
          </div>
          <p>
            Room previews are public. Discussions and attachments require a
            verified holder wallet. Platform moderation still applies.
            FreeSpeech is an independent app using pump.fun’s protocol.
          </p>
        </footer>
      </main>
    </div>
  );
}
