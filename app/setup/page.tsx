"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export default function Setup() {
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Owner setup</h1>
        <p>
          Sign in and choose your forum username first. Enter the private setup
          code from your Vercel project to claim administrator access.
        </p>
        <form
          className="forum-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/forum/owner-setup", {
                method: "POST",
                headers: {
                  "x-forum-request": "1",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ code }),
              });
              const data = (await r.json()) as { error?: string };
              if (!r.ok) throw new Error(data.error || "Setup failed.");
              location.assign("/");
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          <label>
            Private owner code
            <input
              type="password"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <Button disabled={busy}>Claim administrator access</Button>
        </form>
        <a href="/">Back to the forum</a>
      </section>
    </main>
  );
}
