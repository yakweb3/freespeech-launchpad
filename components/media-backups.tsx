"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
type Page = {
  media: { id: string; mime: string; bytes: number; status: string }[];
  nextOffset: number | null;
};
export default function MediaBackups({
  api,
}: {
  api: (path: string) => Promise<Page>;
}) {
  const [page, setPage] = useState<Page | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  async function load(next: number) {
    setBusy(true);
    try {
      setPage(await api("backup-media?offset=" + next));
      setOffset(next);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Media backups">
      <Button variant="outline" disabled={busy} onClick={() => void load(0)}>
        Browse media backups
      </Button>
      {page && (
        <>
          <p className="storage-meter">
            Save each file alongside a database backup. To recover a missing
            file, pause posting and uploads, then choose its original backup
            below. Existing files cannot be overwritten.
          </p>
          {!page.media.length && <p>No uploaded media to back up.</p>}
          {page.media.map((item) => (
            <div className="staff-item" key={item.id}>
              <p>
                <strong>{item.mime}</strong> ·{" "}
                {(item.bytes / 1048576).toFixed(2)} MB · {item.status}
              </p>
              <p className="storage-meter">{item.id}</p>
              <a href={"/api/forum/backup-media/" + item.id} download>
                Download file backup
              </a>
              <label className="forum-form">
                Restore this file if missing
                <input
                  type="file"
                  accept="image/png,image/jpeg,video/mp4"
                  disabled={busy}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (file.size !== item.bytes) {
                      toast.error(
                        "Choose the original backup with the matching file size.",
                      );
                      return;
                    }
                    setBusy(true);
                    try {
                      const begin = await fetch("/api/forum/restore-begin", {
                        method: "POST",
                        headers: {
                          "x-forum-request": "1",
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ id: item.id }),
                      });
                      const reservation = (await begin.json()) as {
                        id: string;
                        uploadUrl: string;
                        error?: string;
                      };
                      if (!begin.ok)
                        throw new Error(
                          reservation.error || "Recovery could not start.",
                        );
                      const upload = await fetch(reservation.uploadUrl, {
                        method: "PUT",
                        headers: { "Content-Type": "application/octet-stream" },
                        body: file,
                      });
                      if (!upload.ok)
                        throw new Error("Recovery upload failed.");
                      const response = await fetch(
                        "/api/forum/restore-media/" + item.id,
                        {
                          method: "POST",
                          headers: {
                            "x-forum-request": "1",
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({ staging_id: reservation.id }),
                        },
                      );
                      const result = (await response.json()) as {
                        error?: string;
                      };
                      if (!response.ok)
                        throw new Error(result.error || "Recovery failed.");
                      toast.success("Missing media restored.");
                    } catch (error) {
                      toast.error((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
            </div>
          ))}
          <div className="operations-buttons">
            <Button
              variant="outline"
              disabled={busy || offset === 0}
              onClick={() => void load(Math.max(0, offset - 50))}
            >
              Previous files
            </Button>
            <Button
              variant="outline"
              disabled={busy || page.nextOffset === null}
              onClick={() =>
                page.nextOffset !== null && void load(page.nextOffset)
              }
            >
              Next files
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
