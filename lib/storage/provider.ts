// Concrete StorageProvider implementations. index.ts picks one of these at
// import time based on whether BLOB_READ_WRITE_TOKEN is set - nothing here
// requires that token to exist for the module to load/compile, only to
// actually perform an upload/delete/getUrl call.
import "server-only";
import { put, del, head, list } from "@vercel/blob";
import { StorageProvider, StorageNotConfiguredError, UploadResult, BlobMetadata } from "./types";
import { guardStorage } from "./blocked";

export class VercelBlobProvider implements StorageProvider {
  readonly name = "Vercel Blob";

  get isConfigured(): boolean {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  }

  async upload({ file, pathname, contentType }: { file: Blob; pathname: string; contentType: string }): Promise<UploadResult> {
    if (!this.isConfigured) throw new StorageNotConfiguredError(this.name);
    const blob = await guardStorage(() =>
      put(pathname, file, {
        access: "public",
        contentType,
        addRandomSuffix: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      }),
    );
    return { url: blob.url, storageKey: blob.pathname, sizeBytes: file.size };
  }

  async delete(storageKey: string): Promise<void> {
    if (!this.isConfigured) throw new StorageNotConfiguredError(this.name);
    await guardStorage(() => del(storageKey, { token: process.env.BLOB_READ_WRITE_TOKEN }));
  }

  async getUrl(storageKey: string): Promise<string> {
    if (!this.isConfigured) throw new StorageNotConfiguredError(this.name);
    const meta = await guardStorage(() => head(storageKey, { token: process.env.BLOB_READ_WRITE_TOKEN }));
    return meta.url;
  }

  async getMetadata(storageKey: string): Promise<BlobMetadata> {
    if (!this.isConfigured) throw new StorageNotConfiguredError(this.name);
    const meta = await guardStorage(() => head(storageKey, { token: process.env.BLOB_READ_WRITE_TOKEN }));
    return { url: meta.url, size: meta.size, contentType: meta.contentType };
  }

  async list(prefix: string): Promise<{ pathname: string; url: string }[]> {
    if (!this.isConfigured) throw new StorageNotConfiguredError(this.name);
    const out: { pathname: string; url: string }[] = [];
    let cursor: string | undefined;
    do {
      const page = await guardStorage(() => list({ prefix, cursor, limit: 1000, token: process.env.BLOB_READ_WRITE_TOKEN }));
      out.push(...page.blobs.map((b) => ({ pathname: b.pathname, url: b.url })));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }
}

// Used automatically whenever BLOB_READ_WRITE_TOKEN isn't set (the current
// state of both local dev and the live deployment). Every method throws a
// clear, typed error instead of silently pretending an upload succeeded -
// callers are expected to catch StorageNotConfiguredError and show the
// user/admin an explicit "storage isn't set up yet" state.
export class UnavailableStorageProvider implements StorageProvider {
  readonly name = "No storage provider configured";
  readonly isConfigured = false;

  async upload(): Promise<UploadResult> {
    throw new StorageNotConfiguredError(this.name);
  }
  async delete(): Promise<void> {
    throw new StorageNotConfiguredError(this.name);
  }
  async getUrl(): Promise<string> {
    throw new StorageNotConfiguredError(this.name);
  }
  async getMetadata(): Promise<BlobMetadata> {
    throw new StorageNotConfiguredError(this.name);
  }
  async list(): Promise<{ pathname: string; url: string }[]> {
    throw new StorageNotConfiguredError(this.name);
  }
}
