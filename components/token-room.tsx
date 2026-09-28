"use client";
import { useEffect, useState } from "react";
import { LockKeyhole, ArrowUpRight } from "lucide-react";
import WalletControl from "./wallet-control";
import RoomTools from "./room-tools";
import Forum from "./forum";
import { launchApi, tokenAmount } from "@/lib/launchpad-client";
import { Button } from "./ui/button";
export default function TokenRoom({ room }: { room: any }) {
  const [unlocked, setUnlocked] = useState(false),
    [boot, setBoot] = useState<any>(null),
    [posts, setPosts] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function check(initial = false) {
    if (initial) setBusy(true);
    try {
      await launchApi("access/" + room.mint);
      if (initial) {
        const [b, p] = await Promise.all([
          fetch("/api/forum/bootstrap").then((r) => r.json()),
          fetch("/api/forum/posts?category=" + room.category).then(
            async (r) => {
              const j: any = await r.json();
              if (!r.ok) throw new Error(j.error);
              return j;
            },
          ),
        ]);
        setBoot(b);
        setPosts(p.posts);
      }
      setUnlocked(true);
      setError("");
    } catch (e) {
      setUnlocked(false);
      setBoot(null);
      setPosts([]);
      if (initial || unlocked) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void check(true);
  }, []);
  useEffect(() => {
    if (!unlocked) return;
    const timer = setInterval(() => void check(), 30000);
    const focus = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [unlocked]);
  return (
    <>
      <header className="room-ribbon">
        <a href="/">← All communities</a>
        <span>
          ${room.symbol} · Hold {tokenAmount(room.minimum)} to enter
        </span>
        <a
          href={"https://pump.fun/coin/" + room.mint}
          target="_blank"
          rel="noreferrer"
        >
          Buy on pump.fun <ArrowUpRight size={15} />
        </a>
      </header>
      {unlocked && boot ? (
        <>
          {boot.user?.id === room.creator_id && (
            <RoomTools room={room} posts={posts} />
          )}
          <Forum
            initial={boot}
            initialPosts={posts}
            initialCategory={room.category}
          />
        </>
      ) : (
        <main className="room-lobby">
          <img
            className="room-logo"
            src={"/api/forum/media/" + room.image_id}
            alt=""
          />
          <span className="launch-eyebrow">${room.symbol} COMMUNITY</span>
          <h1>{room.name}</h1>
          <p>{room.description}</p>
          <section className="room-lock">
            <LockKeyhole size={28} />
            <h2>A room for the holders.</h2>
            <p>
              Hold at least{" "}
              <strong>
                {tokenAmount(room.minimum)} ${room.symbol}
              </strong>{" "}
              in your verified wallet to read, post, and reply. Pictures and
              videos are protected too.
            </p>
            <WalletControl onConnected={() => void check(true)} />
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void check(true)}
            >
              {busy ? "Checking balance…" : "Check my access"}
            </Button>
            {error && (
              <p role="alert" className="launch-error">
                {error}
              </p>
            )}
            <small>
              Balances are checked on Solana. Selling below the minimum removes
              access. A holding does not guarantee the token has value.
            </small>
          </section>
          <p className="mint-address">Token mint: {room.mint}</p>
          <a
            href={"https://pump.fun/coin/" + room.mint}
            target="_blank"
            rel="noreferrer"
          >
            View token on pump.fun ↗
          </a>
        </main>
      )}
    </>
  );
}
