// Storage abstraction contract. The rest of the app (server actions, API
// routes) depends only on this interface, never on a specific provider -
// see provider.ts for how the concrete implementation is selected.

export interface UploadResult {
  /** Public (or signed) URL the app can render/download from. */
  url: string;
  /** Provider-internal key, needed for delete() and re-derivation of a URL. */
  storageKey: string;
  sizeBytes: number;
}

export interface StorageProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  upload(params: { file: Blob; pathname: string; contentType: string }): Promise<UploadResult>;
  delete(storageKey: string): Promise<void>;
  /** Resolve a fresh (or the same, for public-URL providers) download URL for a stored object. */
  getUrl(storageKey: string): Promise<string>;
}

export class StorageNotConfiguredError extends Error {
  constructor(providerName: string) {
    super(
      `${providerName} storage is not configured. Set BLOB_READ_WRITE_TOKEN (see .env.example and docs/DATABASE.md) to enable file uploads.`
    );
    this.name = "StorageNotConfiguredError";
  }
}

// Server-side file validation shared by every upload entry point (admin
// materials, teacher worksheets, teacher exam papers). Keep in sync with
// the allowed MaterialType/file kinds in prisma/schema.prisma.
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
] as const;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB, matches the UI copy already shown elsewhere in the app

export function validateUploadFile(file: { type: string; size: number }): { ok: true } | { ok: false; error: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { ok: false, error: `Unsupported file type: ${file.type || "unknown"}.` };
  }
  if (file.size <= 0) {
    return { ok: false, error: "File is empty." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit.` };
  }
  return { ok: true };
}

/** Strips anything that isn't a safe filename character, to prevent path-traversal-style storage keys. */
export function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() || "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
}
