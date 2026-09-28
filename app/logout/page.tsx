"use client";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
export default function Logout() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Sign out</h1>
        <p>Sign out of this device?</p>
        <Button
          onClick={async () => {
            await fetch("/api/launchpad/logout", { method: "POST", headers: { "Content-Type": "application/json", "x-forum-request": "1" }, body: "{}" });
            await authClient.signOut();
            location.assign("/");
          }}
        >
          Sign out
        </Button>
        <a href="/">Back to the forum</a>
      </section>
    </main>
  );
}
