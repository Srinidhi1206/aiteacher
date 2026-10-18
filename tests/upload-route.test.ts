// Offline tests for the study-material upload-token route (app/api/materials/upload/route.ts): only administrators and teachers are given an upload token, a request that is not
// valid JSON is a 400 (not a server error), and when storage is blocked the browser is told before it starts a large upload. The storage library is a stand-in; nothing is uploaded.
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;
let session: { id: string; role: string } | null = null;
let breakerOpen = false;
const issued: unknown[] = [];
mock.module("server-only", { namedExports: {} });
mock.module(here("lib/auth/current-session.ts"), { namedExports: { getCurrentSession: async () => session } });
mock.module(here("lib/storage/index.ts"), { namedExports: { ALLOWED_MIME_TYPES: ["application/pdf"], MAX_UPLOAD_BYTES: 100 * 1024 * 1024 } });
mock.module(here("lib/storage/blocked.ts"), { namedExports: { isStorageBreakerOpen: () => breakerOpen } });
mock.module(here("lib/storage/stop-messages.ts"), { namedExports: { STORAGE_BLOCKED_MESSAGE: "Storage is blocked." } });
// The real handleUpload would talk to Vercel Blob; this stand-in only runs the route's own permission callback, as the real one does before it issues a token.
mock.module(pathToFileURL(createRequire(import.meta.url).resolve("@vercel/blob/client")).href, {
  namedExports: {
    handleUpload: async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: (p: string) => Promise<unknown> }) => {
      const config = await onBeforeGenerateToken("x.pdf");
      issued.push(config);
      return { type: "blob.generate-client-token", clientToken: "token" };
    },
  },
});

let POST: (r: import("next/server").NextRequest) => Promise<Response>;
before(async () => {
  POST = (await import("@/app/api/materials/upload/route")).POST;
});
const call = async (body: string) => {
  const { NextRequest } = await import("next/server");
  const res = await POST(new NextRequest("https://app.test/api/materials/upload", { method: "POST", headers: { "content-type": "application/json" }, body }));
  return { status: res.status, body: (await res.json()) as { error?: string } };
};

test("an administrator and a teacher are issued an upload token limited to the allowed types and size", async () => {
  for (const role of ["admin", "teacher"]) {
    session = { id: "u", role };
    issued.length = 0;
    const r = await call(JSON.stringify({ type: "blob.generate-client-token", payload: {} }));
    assert.equal(r.status, 200, role);
    assert.deepEqual(issued[0], { allowedContentTypes: ["application/pdf"], maximumSizeInBytes: 100 * 1024 * 1024, addRandomSuffix: true });
  }
});

test("a student and a signed-out visitor get no token", async () => {
  for (const s of [{ id: "s", role: "student" }, null]) {
    session = s;
    issued.length = 0;
    const r = await call(JSON.stringify({ type: "blob.generate-client-token", payload: {} }));
    assert.equal(r.status, 400);
    assert.match(r.body.error ?? "", /Only admins and teachers/);
    assert.equal(issued.length, 0);
  }
});

test("a body that is not JSON is a 400 with a plain message, not a server error", async () => {
  session = { id: "u", role: "admin" };
  for (const bad of ["not json", "", "null", "42"]) {
    const r = await call(bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.match(r.body.error ?? "", /could not be read/);
  }
});

test("when storage is already known to be blocked, the answer is 503 straight away (before any token)", async () => {
  session = { id: "u", role: "admin" };
  breakerOpen = true;
  issued.length = 0;
  try {
    const r = await call(JSON.stringify({}));
    assert.deepEqual([r.status, r.body.error], [503, "Storage is blocked."]);
    assert.equal(issued.length, 0);
  } finally {
    breakerOpen = false;
  }
});
