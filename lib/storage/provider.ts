// Concrete StorageProvider implementations. index.ts picks one of these at
// import time based on whether BLOB_READ_WRITE_TOKEN is set - nothing here
// requires that token to exist for the module to load/compile, only to
// actually perform an upload/delete/getUrl call.
import "server-only";
import { put, del, head } from "@vercel/blob";
import { StorageProvider, StorageNotConfiguredError, UploadResult } from "./types";

export class VercelBlobProvider implements StorageProvider {
  readonly name = "Vercel Blob";

  get isConfigured(): boolean {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  }

  async upload({ file, pathname, contentType }: { file: Blob; pathname: string; contentType: string }): Promise<UploadResult> {
    if (!this.isConfigured) throw new StorageNotConfiguredError(this.name);
    const blob = await put(pathname, file, {
      access: "public",
      contentType,
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { url: blob.url, storageKey: blob.pathname, sizeBytes: file.size };
  }

  async delete(storageKey: string): Promise<void> {
    if (!this.isConfigured) throw new StorageNotConfiguredError(this.name);
    await del(storageKey, { token: process.env.BLOB_READ_WRITE_TOKEN });
  }

  async getUrl(storageKey: string): Promise<string> {
    if (!this.isConfigured) throw new StorageNotConfiguredError(this.name);
    const meta = await head(storageKey, { token: process.env.BLOB_READ_WRITE_TOKEN });
    return meta.url;
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
}
