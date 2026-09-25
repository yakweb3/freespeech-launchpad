"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Bootstrap } from "@/lib/forum-types";
import MediaBackups from "./media-backups";
type Request = (path: string, data?: unknown) => Promise<any>;
export default function StaffPanel({
  boot,
  api,
  onRefresh,
}: {
  boot: Bootstrap;
  api: Request;
  onRefresh: () => Promise<Bootstrap>;
}) {
  const [verified, setVerified] = useState(boot.staffVerified),
    [enabled, setEnabled] = useState(!!boot.user?.totp_enabled),
    [secret, setSecret] = useState(""),
    [code, setCode] = useState(""),
    [recovery, setRecovery] = useState<string[]>([]),
    [dashboard, setDashboard] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [target, setTarget] = useState({
      target_type: "post",
      target_id: "",
      action: "remove",
    }),
    [reason, setReason] = useState(""),
    [title, setTitle] = useState(""),
    [category, setCategory] = useState("general"),
    [days, setDays] = useState("7"),
    [role, setRole] = useState("member");
  const [catSlug, setCatSlug] = useState(""),
    [catName, setCatName] = useState(""),
    [catDescription, setCatDescription] = useState(""),
    [catColor, setCatColor] = useState("#e63d0e"),
    [catLocked, setCatLocked] = useState(false),
    [settings, setSettings] = useState<Record<string, string>>({});
  async function load() {
    setError("");
    try {
      const d = await api("staff");
      setDashboard(d);
      setSettings(d.settings);
      setVerified(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (verified) void load();
  }, [verified]);
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api("staff-verify", { code });
      setRecovery(r.recoveryCodes);
      setSecret("");
      setCode("");
      setEnabled(true);
      setVerified(true);
      await onRefresh();
      toast.success("Staff access unlocked for 30 minutes.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function change(data: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await api("moderate", data);
      setReason("");
      toast.success("Staff action recorded.");
      await load();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!verified)
    return (
      <div className="forum-form">
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <h3>Protect your staff account</h3>
        <p>
          Use an authenticator app to unlock reports and moderation tools.
          Access expires after 30 minutes.
        </p>
        {!enabled && !secret && (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api("staff-setup", {});
                setSecret(r.secret);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Set up authenticator
          </Button>
        )}
        {secret && (
          <div className="security-secret">
            <p>
              Add a time-based account named FreeSpeech in your authenticator
              app. Enter this setup key:
            </p>
            <code>{secret}</code>
            <p>Keep this key private.</p>
          </div>
        )}
        {(enabled || secret) && (
          <form className="forum-form" onSubmit={verify}>
            <label>
              Authenticator code or recovery code
              <input
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
            <Button disabled={busy}>Verify and unlock</Button>
          </form>
        )}
      </div>
    );
  return (
    <div className="staff-panel">
      {recovery.length > 0 && (
        <div className="recovery-codes">
          <h3>Save your recovery codes</h3>
          <p>
            Each code can be used once if you lose access to your authenticator.
            These codes are shown only now.
          </p>
          <pre>{recovery.join("\n")}</pre>
          <Button variant="outline" onClick={() => setRecovery([])}>
            I saved my codes
          </Button>
        </div>
      )}
      <div className="staff-toolbar">
        <span>Staff access is unlocked.</span>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await api("staff-lock", {});
              setVerified(false);
              await onRefresh();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Lock staff access
        </Button>
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {!dashboard ? (
        <p>Loading staff tools…</p>
      ) : (
        <Tabs defaultValue="reports">
          <TabsList className="staff-tabs">
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="tickets">Appeals & support</TabsTrigger>
            <TabsTrigger value="actions">Moderate</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
            {boot.user?.role === "admin" && (
              <TabsTrigger value="admin">Admin</TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="reports">
            {!dashboard.reports.length && (
              <p className="empty-state">No reports to review.</p>
            )}
            {dashboard.reports.map((r: any) => (
              <div className="staff-record" key={r.id}>
                <strong>
                  {r.reason} · {r.status}
                </strong>
                <p>{r.details || "No additional details."}</p>
                <details>
                  <summary>Review reported content</summary>
                  <p>{r.target_content || "Content unavailable."}</p>
                </details>
                <small>
                  Reported by u/{r.reporter} · {r.target_type} {r.target_id}
                </small>
                {r.target_type === "post" && (
                  <a
                    href={"/?post=" + r.target_id}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open discussion ↗
                  </a>
                )}
                {r.resolution && <p>Resolution: {r.resolution}</p>}
                {r.status === "open" && (
                  <form
                    className="forum-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void change({
                        action: "resolve",
                        target_type: "report",
                        target_id: r.id,
                        reason: f.get("response"),
                      });
                    }}
                  >
                    <label>
                      Explain the decision
                      <textarea
                        name="response"
                        minLength={5}
                        maxLength={1500}
                        required
                      />
                    </label>
                    <Button disabled={busy}>Resolve report</Button>
                  </form>
                )}
              </div>
            ))}
          </TabsContent>
          <TabsContent value="tickets">
            {!dashboard.tickets.length && (
              <p className="empty-state">No requests to review.</p>
            )}
            {dashboard.tickets.map((t: any) => (
              <div className="staff-record" key={t.id}>
                <strong>
                  {t.kind}: {t.subject} · {t.status}
                </strong>
                <small>
                  From u/{t.username}
                  {t.action_id ? " · Action " + t.action_id : ""}
                </small>
                <p>{t.body}</p>
                {t.response && <p>Staff response: {t.response}</p>}
                {t.status === "open" && (
                  <form
                    className="forum-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void change({
                        action: "respond",
                        target_type: "ticket",
                        target_id: t.id,
                        reason: f.get("response"),
                      });
                    }}
                  >
                    <label>
                      Response
                      <textarea
                        name="response"
                        minLength={5}
                        maxLength={1500}
                        required
                      />
                    </label>
                    <Button disabled={busy}>Respond and close</Button>
                  </form>
                )}
              </div>
            ))}
          </TabsContent>
          <TabsContent value="actions">
            <form
              className="forum-form"
              onSubmit={(e) => {
                e.preventDefault();
                void change({
                  ...target,
                  reason,
                  title,
                  category,
                  days: Number(days),
                  role,
                });
              }}
            >
              <label>
                Content type
                <Select
                  value={target.target_type}
                  onValueChange={(v) =>
                    setTarget({
                      target_type: v,
                      target_id: "",
                      action: v === "user" ? "warn" : "remove",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["post", "comment", "user"].map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label>
                Item ID
                <input
                  value={target.target_id}
                  onChange={(e) =>
                    setTarget({ ...target, target_id: e.target.value })
                  }
                  required
                  placeholder="ID from a report, member list, or discussion link"
                />
              </label>
              <label>
                Action
                <Select
                  value={target.action}
                  onValueChange={(v) => setTarget({ ...target, action: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(target.target_type === "user"
                      ? [
                          "warn",
                          "suspend",
                          "ban",
                          "reinstate",
                          ...(boot.user?.role === "admin" ? ["role"] : []),
                        ]
                      : target.target_type === "post"
                        ? [
                            "remove",
                            "restore",
                            "lock",
                            "unlock",
                            "pin",
                            "unpin",
                            "move",
                            "rename",
                          ]
                        : ["remove", "restore"]
                    ).map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              {target.action === "move" && (
                <label>
                  Category
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {boot.categories.map((c) => (
                        <SelectItem key={c.slug} value={c.slug}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              )}
              {target.action === "rename" && (
                <label>
                  New title
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    minLength={8}
                    maxLength={220}
                    required
                  />
                </label>
              )}
              {target.action === "suspend" && (
                <label>
                  Days
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                  />
                </label>
              )}
              {target.action === "role" && (
                <label>
                  New role
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["member", "moderator", "admin"].map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              )}
              <label>
                Reason, shared with the affected member
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={5}
                  maxLength={1500}
                  required
                />
              </label>
              <Button disabled={busy}>Apply and record action</Button>
            </form>
            <h3>Removed discussions</h3>
            {dashboard.removed.map((p: any) => (
              <div className="staff-record" key={p.id}>
                <strong>{p.title}</strong>
                <small>{p.id}</small>
                <p>{p.removal_reason}</p>
                <a
                  href={"/?post=" + p.id}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Review discussion ↗
                </a>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="members">
            {dashboard.members.map((m: any) => (
              <div className="staff-record" key={m.id}>
                <strong>
                  u/{m.username} · {m.role}
                </strong>
                <small>ID: {m.id}</small>
                <p>
                  {m.status}
                  {m.suspended_until
                    ? " until " +
                      new Date(m.suspended_until).toLocaleDateString()
                    : ""}
                </p>
                {m.restriction_reason && <p>{m.restriction_reason}</p>}
              </div>
            ))}
          </TabsContent>
          <TabsContent value="audit">
            {!dashboard.audit.length && <p>No staff actions yet.</p>}
            {dashboard.audit.map((a: any) => (
              <div className="staff-record" key={a.id}>
                <strong>
                  {a.action} · {a.target_type}
                </strong>
                <small>
                  {new Date(a.created_at).toLocaleString()} · u/
                  {a.actor || "former_staff"}
                </small>
                <p>{a.reason}</p>
                <small>
                  Target: {a.target_id} · Reference: {a.id}
                </small>
              </div>
            ))}
          </TabsContent>
          {boot.user?.role === "admin" && (
            <TabsContent value="admin">
              <h3>Operations</h3>
              <div className="operations-buttons">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await api("maintenance", {});
                      toast.success(
                        "Maintenance finished. " +
                          result.deletedMedia +
                          " media files cleaned; " +
                          result.emailSent +
                          " emails sent.",
                      );
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Run maintenance
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const data = await api("backup");
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(data)], {
                          type: "application/json",
                        }),
                      );
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "freespeech-database-backup.json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Download database backup
                </Button>
              </div>
              <p className="storage-meter">
                Backups contain private account data. Store securely. Media
                files and the staff encryption key require separate backups.
              </p>
              <MediaBackups api={api} />
              <h3>Community controls</h3>
              <p className="storage-meter">
                Stored media: {(dashboard.storage.bytes / 1048576).toFixed(1)}{" "}
                MB / {settings.max_storage_mb} MB
              </p>
              <form
                className="forum-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void change({
                    action: "settings",
                    target_type: "settings",
                    target_id: "community",
                    values: Object.fromEntries(
                      Object.entries(settings).filter(
                        ([k]) => k !== "initialized",
                      ),
                    ),
                    reason: "Administrator updated community controls.",
                  });
                }}
              >
                {Object.entries(settings)
                  .filter(([k]) => k !== "initialized")
                  .map(([k, v]) => (
                    <label key={k}>
                      {k.replaceAll("_", " ")}
                      {[
                        "registrations_open",
                        "posting_open",
                        "uploads_open",
                        "policy_reviewed",
                      ].includes(k) ? (
                        <Select
                          value={v}
                          onValueChange={(value) =>
                            setSettings({ ...settings, [k]: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Yes</SelectItem>
                            <SelectItem value="0">No</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <input
                          value={v}
                          onChange={(e) =>
                            setSettings({ ...settings, [k]: e.target.value })
                          }
                          type={k === "support_email" ? "email" : "number"}
                        />
                      )}
                    </label>
                  ))}
                <Button disabled={busy}>Save community controls</Button>
              </form>
              <h3>Create or update a category</h3>
              <form
                className="forum-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void change({
                    action: "category",
                    target_type: "category",
                    target_id: catSlug,
                    name: catName,
                    description: catDescription,
                    color: catColor,
                    locked: catLocked,
                    reason: "Administrator updated category details.",
                  });
                }}
              >
                <label>
                  Slug
                  <input
                    required
                    value={catSlug}
                    onChange={(e) => {
                      setCatSlug(e.target.value);
                      const c = boot.categories.find(
                        (c) => c.slug === e.target.value,
                      );
                      if (c) {
                        setCatName(c.name);
                        setCatDescription(c.description);
                        setCatColor(c.color);
                        setCatLocked(!!c.locked);
                      }
                    }}
                  />
                </label>
                <label>
                  Name
                  <input
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    required
                    value={catDescription}
                    onChange={(e) => setCatDescription(e.target.value)}
                  />
                </label>
                <label>
                  Color
                  <input
                    type="color"
                    value={catColor}
                    onChange={(e) => setCatColor(e.target.value)}
                  />
                </label>
                <label>
                  Posting
                  <Select
                    value={catLocked ? "locked" : "open"}
                    onValueChange={(v) => setCatLocked(v === "locked")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="locked">Read-only</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <Button disabled={busy}>Save category</Button>
              </form>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
