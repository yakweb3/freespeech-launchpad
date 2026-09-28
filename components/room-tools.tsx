"use client";
import { useState } from "react";
import { launchApi } from "@/lib/launchpad-client";
import { Button } from "./ui/button";
export default function RoomTools({
  room,
  posts,
}: {
  room: any;
  posts: any[];
}) {
  const [action, setAction] = useState("lock-room"),
    [id, setId] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <details className="room-tools">
      <summary>Creator tools</summary>
      <form
        className="forum-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            await launchApi("manage", { mint: room.mint, action, id, reason });
            location.reload();
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          These actions apply only to your room. Every action is logged; members
          can appeal to platform staff.
        </p>
        <label>
          Action
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="lock-room">Make room read-only</option>
            <option value="unlock-room">Reopen posting and replies</option>
            <option value="remove-post">Remove a discussion</option>
            <option value="lock-post">Lock replies on a discussion</option>
            <option value="unlock-post">Unlock replies on a discussion</option>
            <option value="remove-comment">Remove a comment</option>
          </select>
        </label>
        {action.endsWith("post") && (
          <label>
            Discussion
            <select required value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Choose a discussion</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <small>The current room feed is shown.</small>
          </label>
        )}
        {action === "remove-comment" && (
          <label>
            Comment ID
            <input
              required
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="ID from the comment link"
            />
          </label>
        )}
        <label>
          Reason
          <input
            required
            minLength={5}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain the moderation decision"
          />
        </label>
        <Button disabled={busy}>
          {busy ? "Saving…" : "Apply room action"}
        </Button>
        {message && (
          <p role="alert" className="launch-error">
            {message}
          </p>
        )}
      </form>
    </details>
  );
}
