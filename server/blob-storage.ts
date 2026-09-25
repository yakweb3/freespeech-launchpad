import {
  get,
  head,
  put,
  del,
  BlobNotFoundError,
  BlobError,
} from "@vercel/blob";
export const blobBucket = {
  async head(key: string) {
    try {
      return await head(key, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  },
  async get(key: string, options?: { range: Headers }) {
    const value = await get(key, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      useCache: false,
      headers: options?.range.get("range")
        ? { Range: options.range.get("range")! }
        : undefined,
    });
    if (!value || value.statusCode !== 200) return null;
    const contentRange = value.headers
      .get("content-range")
      ?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    const size =
      !contentRange &&
      (!value.headers.has("content-length") ||
        value.headers.has("content-encoding"))
        ? (await head(key, { token: process.env.BLOB_READ_WRITE_TOKEN })).size
        : value.blob.size;
    return {
      body: value.stream,
      size: contentRange ? Number(contentRange[3]) : size,
      range: contentRange
        ? {
            offset: Number(contentRange[1]),
            length: Number(contentRange[2]) - Number(contentRange[1]) + 1,
          }
        : undefined,
    };
  },
  async put(
    key: string,
    bytes: Uint8Array,
    options?: {
      httpMetadata?: { contentType: string };
      customMetadata?: Record<string, string>;
      onlyIf?: { etagDoesNotMatch: string };
    },
  ) {
    try {
      return await put(key, Buffer.from(bytes), {
        token: process.env.BLOB_READ_WRITE_TOKEN,
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: options?.httpMetadata?.contentType,
        cacheControlMaxAge: 60,
      });
    } catch (error) {
      if (
        options?.onlyIf &&
        error instanceof BlobError &&
        /already exists/i.test(error.message)
      )
        return null;
      throw error;
    }
  },
  async delete(key: string) {
    await del(key, { token: process.env.BLOB_READ_WRITE_TOKEN });
  },
};
