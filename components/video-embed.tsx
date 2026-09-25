"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export default function VideoEmbed({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  let source = "",
    provider = "";
  try {
    const u = new URL(url),
      host = u.hostname.replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "m.youtube.com")
      id =
        u.searchParams.get("v") ||
        u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1] ||
        "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
      source = "https://www.youtube-nocookie.com/embed/" + id;
      provider = "YouTube";
    } else if (host === "vimeo.com" && /^\/\d+$/.test(u.pathname)) {
      source = "https://player.vimeo.com/video" + u.pathname;
      provider = "Vimeo";
    }
  } catch {}
  if (!source) return null;
  return (
    <div className="video-embed">
      {loaded ? (
        <iframe
          src={source}
          title={provider + " video"}
          allow="fullscreen; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <div>
          <p>Video from {provider}</p>
          <Button variant="outline" onClick={() => setLoaded(true)}>
            Load video
          </Button>
          <small>Loading connects your browser to {provider}.</small>
        </div>
      )}
    </div>
  );
}
