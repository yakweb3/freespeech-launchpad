import assert from "node:assert/strict";
import ts from "typescript";
import { readFile, writeFile } from "node:fs/promises";
const compile = (s) =>
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(s, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText,
  ).toString("base64");
const validation = compile(await readFile("lib/forum-validation.ts", "utf8"));
const inspection = compile(
  (await readFile("lib/media-inspection.ts", "utf8")).replace(
    /(["'])\.\/forum-validation\1/,
    JSON.stringify(validation),
  ),
);
const { inspectMedia } = await import(inspection);
const original = new Uint8Array(
  await readFile("public/media/neighborhood.png"),
);
const inspected = inspectMedia(original);
assert.equal(inspected.width, 1536);
assert.equal(inspected.height, 1024);
assert.equal(inspected.mime, "image/png");
const injected = Buffer.from("private GPS metadata"),
  chunk = Buffer.alloc(injected.length + 12);
chunk.writeUInt32BE(injected.length, 0);
chunk.write("tEXt", 4);
injected.copy(chunk, 8);
const withMetadata = Buffer.concat([
  original.subarray(0, 33),
  chunk,
  original.subarray(33),
]);
assert(
  !Buffer.from(inspectMedia(withMetadata).bytes).includes(injected),
  "Metadata must be removed",
);
assert.throws(() =>
  inspectMedia(new TextEncoder().encode('<svg onload="alert(1)">test</svg>')),
);
assert.throws(() => inspectMedia(original.subarray(0, 50)));
const oversized = original.slice();
new DataView(oversized.buffer).setUint32(16, 15000);
assert.throws(() => inspectMedia(oversized));
console.log(
  "PASS: PNG dimensions, metadata stripping, SVG rejection, truncation rejection, decompression-size limits.",
);
