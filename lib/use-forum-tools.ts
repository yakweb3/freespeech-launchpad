"use client";
import { useEffect, useRef } from "react";
type Handlers = {
  search: (q: string, category: string) => Promise<unknown>;
  open: (id: string) => Promise<unknown>;
  draft: (title: string, body: string, category: string) => Promise<unknown>;
};
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};
type Context = {
  registerTool: (tool: Tool, options: { signal: AbortSignal }) => Promise<void>;
};
export function useForumTools(handlers: Handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context) return;
    const controller = new AbortController();
    const text = (v: unknown, max: number) =>
      typeof v === "string" ? v.slice(0, max) : "";
    const tools: Tool[] = [
      {
        name: "search_forum",
        description:
          "Search this forum and display matching discussions. Returns public discussion titles, IDs and category names.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", maxLength: 200 },
            category: { type: "string", maxLength: 40 },
          },
          required: ["query"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: (a) =>
          latest.current.search(text(a.query, 200), text(a.category, 40)),
      },
      {
        name: "open_discussion",
        description:
          "Open a discussion from this forum using its post ID. Does not create or edit content; signed-in members mark the discussion as read.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", maxLength: 80 } },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: (a) => latest.current.open(text(a.id, 80)),
      },
      {
        name: "prepare_post_draft",
        description:
          "Fill the visible post composer for member review. Requires sign-in and completed profile. Does not publish. Refuses to replace an existing draft.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", maxLength: 220 },
            body: { type: "string", maxLength: 20000 },
            category: { type: "string", maxLength: 40 },
          },
          required: ["title", "body", "category"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: (a) =>
          latest.current.draft(
            text(a.title, 220),
            text(a.body, 20000),
            text(a.category, 40),
          ),
      },
    ];
    for (const tool of tools)
      void context
        .registerTool(tool, { signal: controller.signal })
        .catch(() => {});
    return () => controller.abort();
  }, []);
}
