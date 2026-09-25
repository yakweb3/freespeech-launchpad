"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { Bootstrap } from "@/lib/forum-types";
type Request = (path: string, data?: unknown) => Promise<any>;
export function AccountControls({
  boot,
  api,
  onRefresh,
}: {
  boot: Bootstrap;
  api: Request;
  onRefresh: () => Promise<Bootstrap>;
}) {
  const u = boot.user!,
    [prefs, setPrefs] = useState({
      notify_replies: !!u.notify_replies,
      notify_mentions: !!u.notify_mentions,
      notify_followed: !!u.notify_followed,
      email_notifications: !!u.email_notifications,
    }),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false);
  async function savePrefs() {
    setBusy(true);
    try {
      await api("notification-settings", prefs);
      await onRefresh();
      toast.success("Notification preferences saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-controls">
      <h3>Notifications</h3>
      {Object.entries(prefs).map(([k, v]) => (
        <label className="switch-row" key={k}>
          <span>
            {
              {
                notify_replies: "Replies to my posts and comments",
                notify_mentions: "Mentions of my username",
                notify_followed: "Discussions I follow",
                email_notifications: "Email notifications",
              }[k]
            }
            {k === "email_notifications" && !boot.emailConfigured && (
              <small>Email delivery is not available yet.</small>
            )}
          </span>
          <Switch
            checked={v}
            onCheckedChange={(checked) => setPrefs({ ...prefs, [k]: checked })}
            disabled={k === "email_notifications" && !boot.emailConfigured}
          />
        </label>
      ))}
      <Button variant="outline" onClick={savePrefs} disabled={busy}>
        Save notifications
      </Button>
      <h3>Muted people and discussions</h3>
      {boot.preferences.filter((p) => p.kind.startsWith("mute_")).length ===
      0 ? (
        <p>You haven’t muted anything.</p>
      ) : (
        boot.preferences
          .filter((p) => p.kind.startsWith("mute_"))
          .map((p) => (
            <div className="mute-row" key={p.kind + p.target}>
              <span>
                {p.kind.replace("mute_", "")}: {p.target}
              </span>
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    await api("preference", { ...p, enabled: false });
                    await onRefresh();
                    toast.success("Unmuted.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Unmute
              </Button>
            </div>
          ))
      )}
      <h3>Your data</h3>
      <p>Download your profile, posts, comments, and personal settings.</p>
      <Button
        variant="outline"
        onClick={async () => {
          setBusy(true);
          try {
            const data = await api("export-account");
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "freespeech-" + u.username + ".json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
      >
        Download my data
      </Button>
      <h3>Delete account</h3>
      <p>
        Your profile and personal settings will be removed. Discussion text
        stays under a deleted-member label. Delete individual posts first if you
        do not want them retained. Uploaded media will be deleted.
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">Delete my account</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Your discussion text may remain, but your
              profile, uploads, and personal settings will be removed. Type your
              username to confirm: {u.username}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            className="confirmation-input"
            aria-label="Confirm username"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my account</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirm !== u.username || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("delete-account", { confirm });
                  location.href = boot.signOutUrl;
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Permanently delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
export function ContactPanel({ api }: { api: Request }) {
  const [kind, setKind] = useState("support"),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [actionId, setActionId] = useState(""),
    [tickets, setTickets] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setTickets((await api("tickets")).tickets);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="forum-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("ticket", { kind, subject, body, action_id: actionId });
            setSubject("");
            setBody("");
            setActionId("");
            toast.success("Your request has been sent to staff.");
            await load();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Request type
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="appeal">Appeal a decision</SelectItem>
              <SelectItem value="privacy">Privacy request</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label>
          Subject
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            minLength={5}
            maxLength={150}
            required
          />
        </label>
        {kind === "appeal" && (
          <label>
            Action reference (optional)
            <input
              value={actionId}
              onChange={(e) => setActionId(e.target.value)}
              maxLength={100}
            />
          </label>
        )}
        <label>
          Message
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            minLength={10}
            maxLength={5000}
            required
          />
        </label>
        <Button disabled={busy}>Send to staff</Button>
      </form>
      <h3 className="section-heading">Your requests</h3>
      {tickets.map((t) => (
        <div key={t.id} className="staff-record">
          <strong>
            {t.subject} · {t.status}
          </strong>
          <p>{t.body}</p>
          {t.response && (
            <p>
              <b>Staff response:</b> {t.response}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
