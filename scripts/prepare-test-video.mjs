import { mkdir, writeFile } from "node:fs/promises";
const response = await fetch("https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error("Could not download the MDN CC0 video fixture.");
const bytes = new Uint8Array(await response.arrayBuffer());
if (bytes.length > 10 * 1024 * 1024 || new TextDecoder().decode(bytes.slice(4, 8)) !== "ftyp") throw new Error("Unexpected video fixture.");
await mkdir(".sites-runtime", { recursive: true });
await writeFile(".sites-runtime/test-flower.mp4", bytes);
console.log("Saved the MDN CC0 video to .sites-runtime/test-flower.mp4.");
