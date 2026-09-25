"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main
      className="empty-state"
      style={{ maxWidth: 560, margin: "15vh auto" }}
    >
      <h1>We couldn’t load the forum.</h1>
      <p>
        Your saved drafts are still on this device. Please try again in a
        moment.
      </p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
