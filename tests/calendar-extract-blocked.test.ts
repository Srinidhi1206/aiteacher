// Offline regression test for the calendar-import upload route when file storage is blocked. The route's collaborators (sign-in, database,
// storage, the AI reader) are replaced by mocks, so nothing here touches Vercel Blob, Gemini, a database or the network.
// Needs Node's module mocking: it is switched on by the --experimental-test-module-mocks flag in `npm run test:storage`.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { StorageBlockedError } from "@/lib/storage/blocked";
import { STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";

const here = (path: string) => new URL(`../${path}`, import.meta.url).href;

const calls = { upload: 0, read: 0, deleted: 0 };
let uploadImpl: () => Promise<{ url: string; storageKey: string }> = async () => ({ url: "https://store.example/a.png", storageKey: "k1" });

mock.module("server-only", { namedExports: {} });
mock.module(here("lib/auth/current-session.ts"), { namedExports: { getCurrentSession: async () => ({ id: "u1", role: "admin" }) } });
mock.module(here("lib/prisma.ts"), { namedExports: { prisma: { admin: { findUnique: async () => ({ isSuperAdmin: false, schoolId: "s1" }) } } } });
mock.module(here("lib/storage/index.ts"), {
  namedExports: {
    storage: {
      isConfigured: true,
      upload: async () => (calls.upload++, uploadImpl()),
      delete: async () => void calls.deleted++,
    },
    safeFilename: (n: string) => n,
  },
});
mock.module(here("lib/calendar-import/ai-reader.ts"), { namedExports: { getGeminiReader: () => ({}) } });
mock.module(here("lib/calendar-import/extract.ts"), {
  namedExports: {
    ACCEPTED_TYPES: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
    MAX_BYTES: 10 * 1024 * 1024,
    extractCalendarPreview: async () => (calls.read++, { ok: true, events: [] }),
  },
});

async function post() {
  const { POST } = await import("@/app/api/calendar-import/extract/route");
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const form = new FormData();
  form.set("file", new File([png], "calendar.png", { type: "image/png" }));
  return POST(new Request("http://localhost/api/calendar-import/extract", { method: "POST", body: form }) as never);
}

const reset = () => Object.assign(calls, { upload: 0, read: 0, deleted: 0 });

test("blocked storage: HTTP 503 with the shared message; nothing is read or kept", async () => {
  reset();
  uploadImpl = async () => Promise.reject(new StorageBlockedError());
  const res = await post();
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { ok: false, error: STORAGE_BLOCKED_MESSAGE });
  assert.deepEqual(calls, { upload: 1, read: 0, deleted: 0 });
});

test("the Blob SDK's own 'store suspended' error is recognised the same way", async () => {
  reset();
  uploadImpl = async () => Promise.reject(Object.assign(new Error("Vercel Blob: This store has been suspended."), { name: "BlobStoreSuspendedError" }));
  const res = await post();
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, STORAGE_BLOCKED_MESSAGE);
  assert.equal(calls.read, 0);
});

test("any OTHER storage error behaves exactly as before: it is not turned into a 'blocked' answer", async () => {
  reset();
  uploadImpl = async () => Promise.reject(new Error("disk full"));
  await assert.rejects(() => post(), /disk full/);
  assert.equal(calls.read, 0);
});

test("working storage: unchanged - the document is kept, read, and the preview returned with its source link", async () => {
  reset();
  uploadImpl = async () => ({ url: "https://store.example/a.png", storageKey: "k1" });
  const res = await post();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual([body.ok, body.sourceName, body.sourceUrl], [true, "calendar.png", "https://store.example/a.png"]);
  assert.deepEqual(calls, { upload: 1, read: 1, deleted: 0 });
});
