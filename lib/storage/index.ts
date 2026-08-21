import "server-only";
import { VercelBlobProvider, UnavailableStorageProvider } from "./provider";
import type { StorageProvider } from "./types";

// The rest of the app imports `storage` from here, never a concrete
// provider class directly - swapping providers later (S3, R2, etc.) means
// changing this one selection, not every call site.
export const storage: StorageProvider = process.env.BLOB_READ_WRITE_TOKEN
  ? new VercelBlobProvider()
  : new UnavailableStorageProvider();

export * from "./types";
export { StorageNotConfiguredError } from "./types";
