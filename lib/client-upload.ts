import type { Media } from "./forum-types";
export async function preparePicture(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP picture.");
  if (file.size > 20 * 1048576)
    throw new Error("Choose a picture smaller than 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40000000)
      throw new Error("Choose a picture smaller than 40 megapixels.");
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is unavailable.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Could not prepare this picture.")),
        "image/jpeg",
        0.86,
      ),
    );
  } finally {
    bitmap.close();
  }
}
export async function uploadFile(
  file: Blob,
  onProgress: (n: number) => void,
): Promise<Media> {
  if (file.size > 3 * 1048576) {
    const api = async (path: string, data: unknown) => {
      const response = await fetch("/api/forum/" + path, {
        method: "POST",
        headers: { "x-forum-request": "1", "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = (await response.json()) as {
        id: string;
        uploadUrl: string;
        media: Media;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      return result;
    };
    const reservation = await api("upload-begin", {
      mime: file.type,
      bytes: file.size,
    });
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", reservation.uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.timeout = 180000;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          onProgress(Math.round((e.loaded / e.total) * 90));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error("Storage upload failed. Please try again."));
      xhr.onerror = () => reject(new Error("Connection lost during upload."));
      xhr.ontimeout = () => reject(new Error("Upload timed out."));
      xhr.send(file);
    });
    const result = await api("upload-finish", { id: reservation.id });
    onProgress(100);
    return result.media;
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/forum/upload");
    xhr.setRequestHeader("x-forum-request", "1");
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const r = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(r.media);
        else reject(new Error(r.error || "Upload failed."));
      } catch {
        reject(new Error("Upload failed. Try again."));
      }
    };
    xhr.onerror = () =>
      reject(new Error("Connection lost. Try uploading again."));
    xhr.ontimeout = () =>
      reject(new Error("Upload timed out. Try a smaller file."));
    xhr.send(file);
  });
}
export async function videoThumbnail(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file),
    video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Could not read this video.")),
        15000,
      );
      const fail = (message: string) => {
        clearTimeout(timer);
        reject(new Error(message));
      };
      video.onerror = () =>
        fail("This browser cannot play that video. Upload an H.264 MP4.");
      video.onloadedmetadata = () => {
        if (
          !Number.isFinite(video.duration) ||
          video.duration > 120 ||
          video.duration <= 0
        ) {
          fail("Choose a video of 120 seconds or less.");
          return;
        }
        video.currentTime = Math.min(0.2, video.duration / 2);
      };
      video.onseeked = () => {
        const canvas = document.createElement("canvas"),
          scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          fail("Could not create a video preview.");
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            clearTimeout(timer);
            if (blob) resolve(blob);
            else reject(new Error("Could not create a preview."));
          },
          "image/jpeg",
          0.8,
        );
      };
      video.src = url;
    });
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
