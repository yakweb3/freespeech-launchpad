"use client";
import type { ReactNode } from "react";
// Render a deliberately small text-formatting subset as React nodes. Raw HTML is never interpreted.
function inline(text: string): ReactNode[] {
  return text
    .split(
      /(\*\*[^*\n]+\*\*|`[^`\n]+`|https?:\/\/[^\s<>]+|@[a-z][a-z0-9_]{2,23})/gi,
    )
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={i}>{part.slice(1, -1)}</code>;
      if (/^https?:\/\//i.test(part)) {
        let url: URL;
        try {
          url = new URL(part);
        } catch {
          return part;
        }
        if (url.username || url.password) return part;
        return (
          <a key={i} href={url.href} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        );
      }
      if (/^@[a-z]/i.test(part))
        return (
          <span key={i} className="mention">
            {part}
          </span>
        );
      return part;
    });
}
export default function RichText({ text }: { text: string }) {
  return (
    <div className="rich-text">
      {text
        .split("\n")
        .map((line, i) =>
          line.startsWith("> ") ? (
            <blockquote key={i}>{inline(line.slice(2))}</blockquote>
          ) : (
            <div key={i}>{line ? inline(line) : <br />}</div>
          ),
        )}
    </div>
  );
}
