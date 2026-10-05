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

export interface BlobMetadata {
  url: string;
  size: number;
  contentType: string;
}

export interface StorageProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  upload(params: { file: Blob; pathname: string; contentType: string }): Promise<UploadResult>;
  delete(storageKey: string): Promise<void>;
  /** Resolve a fresh (or the same, for public-URL providers) download URL for a stored object. */
  getUrl(storageKey: string): Promise<string>;
  /**
   * Independently re-derives a stored object's real url/size/contentType
   * directly from the storage provider - used by createMaterial to verify a
   * client-direct-upload actually happened rather than trusting size/type
   * claimed by the browser (see lib/actions/materials.ts).
   */
  getMetadata(storageKey: string): Promise<BlobMetadata>;
  /** Every stored object whose key starts with `prefix` (used to find the per-page files of an OCR run). */
  list(prefix: string): Promise<{ pathname: string; url: string }[]>;
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

// 100MB - raised from the previous 25MB now that uploads go through Vercel
// Blob's client-direct-upload path (lib/actions/materials.ts + the
// /api/materials/upload token route), which bypasses both the Next.js
// Server Action body limit (~1MB default) and Vercel's serverless function
// request body limit (~4.5MB) - the actual blockers a real ~45MB textbook
// PDF hit before, not this constant. 100MB gives headroom above a typical
// scanned/image-heavy textbook while staying a deliberate, enforced ceiling
// (checked both when the upload token is issued and again when the
// StudyMaterial row is created) rather than no limit at all.
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

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
