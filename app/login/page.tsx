"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import WalletControl from "@/components/wallet-control";
export default function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="auth-page">
      <a className="auth-brand" href="/">
        free<span>speech</span>
      </a>
      <section className="auth-card">
        <WalletControl onConnected={() => location.assign("/")} />
        <small>Or continue with email</small>
        <h1>{mode === "signup" ? "Join the conversation" : "Welcome back"}</h1>
        <p>
          Your email stays private. Choose your public username after signing
          in.
        </p>
        <form
          className="forum-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              const response =
                mode === "signup"
                  ? await authClient.signUp.email({
                      email,
                      password,
                      name: "New member",
                    })
                  : await authClient.signIn.email({ email, password });
              if (response.error)
                throw new Error(response.error.message || "Could not sign in.");
              location.assign("/");
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {mode === "signup" && (
            <>
              <small>
                Use at least 12 characters. Keep your password saved: email
                recovery is not connected yet.
              </small>
              <label className="auth-consent">
                <input type="checkbox" required /> I am 18 or older and agree to
                the{" "}
                <a href="/?page=terms" target="_blank">
                  terms
                </a>
                ,{" "}
                <a href="/?page=privacy" target="_blank">
                  privacy policy
                </a>{" "}
                and{" "}
                <a href="/?page=rules" target="_blank">
                  community guidelines
                </a>
                .
              </label>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <Button disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </Button>
        </form>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "New here? Create an account"
            : "Already a member? Sign in"}
        </Button>
        <a href="/">Browse discussions</a>
      </section>
    </main>
  );
}
