import { ForumError } from "./forum-validation";
export type InspectedMedia = {
  bytes: Uint8Array;
  mime: string;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  duration: number | null;
};
function bad(
  message = "This file is damaged or uses an unsupported format.",
): never {
  throw new ForumError(400, message);
}
function ascii(a: Uint8Array, start: number, n: number) {
  return String.fromCharCode(...a.subarray(start, start + n));
}
function dimensions(w: number, h: number) {
  if (!w || !h || w > 12000 || h > 12000 || w * h > 40000000)
    bad(
      "Images must be smaller than 40 megapixels and 12,000 pixels per side.",
    );
}
function join(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
// Retain only rendering-critical PNG chunks. Text, location, EXIF and other ancillary metadata are discarded.
function png(a: Uint8Array): InspectedMedia {
  const view = new DataView(a.buffer, a.byteOffset, a.byteLength),
    parts = [a.subarray(0, 8)];
  let at = 8,
    w = 0,
    h = 0,
    ended = false,
    hasData = false;
  while (at + 12 <= a.length) {
    const len = view.getUint32(at),
      type = ascii(a, at + 4, 4),
      end = at + 12 + len;
    if (end > a.length) bad();
    if (at === 8 && (type !== "IHDR" || len !== 13)) bad();
    if (type === "IHDR") {
      if (w) bad();
      w = view.getUint32(at + 8);
      h = view.getUint32(at + 12);
      dimensions(w, h);
    }
    if (type === "IDAT") hasData = true;
    if (["IHDR", "PLTE", "IDAT", "IEND", "tRNS"].includes(type))
      parts.push(a.subarray(at, end));
    else if (type[0] === type[0].toUpperCase()) bad();
    at = end;
    if (type === "IEND") {
      if (len !== 0) bad();
      ended = true;
      break;
    }
  }
  if (!ended || !hasData || !w) bad();
  return {
    bytes: join(parts),
    mime: "image/png",
    kind: "image",
    width: w,
    height: h,
    duration: null,
  };
}
// Remove JPEG APPn and COM segments (EXIF/GPS, IPTC, XMP and comments).
function jpeg(a: Uint8Array): InspectedMedia {
  const v = new DataView(a.buffer, a.byteOffset, a.byteLength),
    parts = [a.subarray(0, 2)];
  let at = 2,
    w = 0,
    h = 0,
    scan = false;
  while (at + 4 <= a.length) {
    const start = at;
    if (a[at++] !== 255) bad();
    while (a[at] === 255) at++;
    const marker = a[at++];
    if (marker === 0xda) {
      if (!w || a[a.length - 2] !== 255 || a[a.length - 1] !== 217) bad();
      parts.push(a.subarray(start));
      scan = true;
      break;
    }
    if (marker === 0xd9) break;
    const len = v.getUint16(at);
    if (len < 2 || at + len > a.length) bad();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (len < 8) bad();
      h = v.getUint16(at + 3);
      w = v.getUint16(at + 5);
      dimensions(w, h);
    }
    if (!((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe))
      parts.push(a.subarray(start, at + len));
    at += len;
  }
  if (!scan) bad();
  return {
    bytes: join(parts),
    mime: "image/jpeg",
    kind: "image",
    width: w,
    height: h,
    duration: null,
  };
}
function mp4(a: Uint8Array, maxSeconds: number): InspectedMedia {
  const v = new DataView(a.buffer, a.byteOffset, a.byteLength);
  let duration = 0,
    ftyp = false,
    mdat = false,
    moov = false,
    video = false,
    width: number | null = null,
    height: number | null = null;
  function boxes(start: number, end: number, depth = 0) {
    if (depth > 8) bad();
    let at = start,
      count = 0;
    while (at < end) {
      if (++count > 10000 || at + 8 > end) bad();
      let size = v.getUint32(at),
        header = 8;
      const type = ascii(a, at + 4, 4);
      if (size === 1) {
        if (at + 16 > end) bad();
        const big = v.getBigUint64(at + 8);
        if (big > BigInt(a.length)) bad();
        size = Number(big);
        header = 16;
      } else if (size === 0) size = end - at;
      if (size < header || at + size > end) bad();
      const payload = at + header,
        stop = at + size;
      if (depth === 0 && type === "ftyp") {
        ftyp = true;
        if (size < 16) bad();
      }
      if (depth === 0 && type === "mdat") mdat = true;
      if (type === "mvhd") {
        const version = a[payload],
          scaleOffset = payload + (version === 1 ? 20 : 12),
          durationOffset = scaleOffset + 4;
        if (
          ![0, 1].includes(version) ||
          durationOffset + (version === 1 ? 8 : 4) > stop
        )
          bad();
        const scale = v.getUint32(scaleOffset),
          ticks =
            version === 1
              ? Number(v.getBigUint64(durationOffset))
              : v.getUint32(durationOffset);
        if (!scale) bad();
        duration = ticks / scale;
      }
      if (type === "stsd") {
        if (payload + 8 > stop) bad();
        let entry = payload + 8;
        const n = v.getUint32(payload + 4);
        if (n > 32) bad();
        for (let i = 0; i < n; i++) {
          if (entry + 8 > stop) bad();
          const length = v.getUint32(entry),
            codec = ascii(a, entry + 4, 4);
          if (length < 8 || entry + length > stop) bad();
          if (codec === "avc1" || codec === "avc3") {
            if (length < 86) bad();
            video = true;
            width = v.getUint16(entry + 32);
            height = v.getUint16(entry + 34);
            if (!width || !height || width > 3840 || height > 3840)
              bad("Videos must be 4K or smaller.");
          }
          entry += length;
        }
      }
      if (["moov", "trak", "mdia", "minf", "stbl"].includes(type)) {
        if (type === "moov") moov = true;
        boxes(payload, stop, depth + 1);
      }
      at = stop;
    }
  }
  boxes(0, a.length);
  if (!ftyp || !moov || !mdat || !video)
    bad(
      "Upload an MP4 with H.264 video. You can also share an external video link.",
    );
  if (!Number.isFinite(duration) || duration <= 0 || duration > maxSeconds)
    bad("Videos must be " + maxSeconds + " seconds or shorter.");
  return {
    bytes: a,
    mime: "video/mp4",
    kind: "video",
    width,
    height,
    duration: Math.ceil(duration),
  };
}
export function inspectMedia(a: Uint8Array, maxSeconds = 120): InspectedMedia {
  if (a.length < 16) bad();
  if (
    a[0] === 137 &&
    ascii(a, 1, 3) === "PNG" &&
    a[4] === 13 &&
    a[5] === 10 &&
    a[6] === 26 &&
    a[7] === 10
  )
    return png(a);
  if (a[0] === 255 && a[1] === 216) return jpeg(a);
  if (ascii(a, 4, 4) === "ftyp") return mp4(a, maxSeconds);
  return bad("Choose a JPEG, PNG, or H.264 MP4 file.");
}
export async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  max: number,
) {
  if (!body) bad("No file was received.");
  const reader = body.getReader(),
    parts: Uint8Array[] = [];
  let n = 0;
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      n += r.value.length;
      if (n > max) {
        await reader.cancel();
        throw new ForumError(413, "This file is too large.");
      }
      parts.push(r.value);
    }
  } finally {
    reader.releaseLock();
  }
  return join(parts);
}
