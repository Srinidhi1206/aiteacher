// Regression tests for the PDF.js buffer-detachment bug: pdf.js takes OWNERSHIP of the byte array it is given (the array is detached - length 0 -
// and its SHA-256 becomes the hash of nothing). The downloader shares one array between callers, so handing it to pdf.js directly emptied the
// cache for everyone and made every later hash wrong. These tests use a REAL (tiny, generated) PDF and the REAL pdf.js hand-off - no fake bytes.
// Run:  npm run test:storage
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { extractPdfPages } from "@/lib/rag/pdf-text";
import { assessTextLayer } from "@/lib/rag/text-quality";
import { resolveIndexSource } from "@/lib/rag/index-source";
import { resolveSourceSha } from "@/lib/rag/source-identity";
import { resetStorageBreaker } from "@/lib/storage/blocked";
import { resetStorageStats } from "@/lib/storage/telemetry";
import { EMPTY_SHA, MB, SECRET_URL, bytesResponse, downloader, tinyPdf } from "./helpers";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

beforeEach(() => {
  resetStorageBreaker();
  resetStorageStats();
});

test("the test PDF is a real PDF that pdf.js opens and reads", async () => {
  const pages = await extractPdfPages(tinyPdf("Hello textbook chapter one"));
  assert.equal(pages.length, 1);
  assert.match(pages[0], /Hello textbook chapter one/);
});

test("the hazard is real: handing bytes straight to pdf.js detaches them (this is why the fix exists)", async (t) => {
  const { getDocumentProxy } = await import("unpdf");
  const probe = tinyPdf();
  const before = probe.length;
  await getDocumentProxy(probe);
  if (probe.length === 0) {
    assert.equal(sha(probe), EMPTY_SHA, "a detached array hashes as the empty input");
  } else {
    t.diagnostic(`pdf.js no longer detaches its input (length ${probe.length} of ${before}); the copy in extractPdfPages is now belt-and-braces`);
  }
});

test("extractPdfPages leaves the caller's bytes - and their hash - untouched", async () => {
  const original = tinyPdf("Hello textbook chapter one");
  const before = { length: original.length, byteLength: original.byteLength, hash: sha(original) };
  await extractPdfPages(original);
  await extractPdfPages(original); // and it can be used again
  assert.deepEqual({ length: original.length, byteLength: original.byteLength, hash: sha(original) }, before);
});

test("sequential users: download, read the text, then a cache hit - the bytes and hash are intact every time, with ONE network request", async () => {
  const pdf = tinyPdf("Hello textbook chapter one");
  const expected = sha(pdf);
  const d = downloader(() => bytesResponse(pdf));

  const first = await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001", expectedBytes: pdf.length });
  assert.ok(first.ok && !first.fromCache);
  assert.equal(first.sha256, expected);
  const text1 = await extractPdfPages(first.bytes);

  const second = await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001", expectedBytes: pdf.length });
  assert.ok(second.ok && second.fromCache);
  assert.equal(second.bytes.length, pdf.length, "the cached copy was not emptied by the first reader");
  assert.equal(sha(second.bytes), expected);
  assert.equal(second.sha256, expected);
  assert.deepEqual(await extractPdfPages(second.bytes), text1, "and it reads to the same text");

  const third = await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001", expectedBytes: pdf.length });
  assert.ok(third.ok && third.bytes.length === pdf.length);
  assert.equal(d.net.calls.length, 1);
});

test("concurrent users: six callers fetch and read at once - nobody gets an empty or corrupted PDF, one request, one correct hash", async () => {
  const pdf = tinyPdf("Hello textbook chapter one");
  const expected = sha(pdf);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const d = downloader(async () => {
    await gate;
    return bytesResponse(pdf);
  });
  const users = Array.from({ length: 6 }, async () => {
    const got = await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001", expectedBytes: pdf.length });
    assert.ok(got.ok);
    const pages = await extractPdfPages(got.bytes);
    return { length: got.bytes.length, hashNow: sha(got.bytes), reported: got.sha256, pages };
  });
  release();
  const results = await Promise.all(users);
  assert.equal(d.net.calls.length, 1);
  for (const r of results) {
    assert.equal(r.length, pdf.length);
    assert.equal(r.hashNow, expected);
    assert.equal(r.reported, expected);
    assert.match(r.pages[0], /Hello textbook/);
  }
});

test("a misbehaving consumer that detaches the cached array cannot poison the cache: the next call re-downloads intact bytes", async () => {
  const pdf = tinyPdf("Hello textbook chapter one");
  const d = downloader(() => bytesResponse(pdf));
  const first = await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001", expectedBytes: pdf.length });
  assert.ok(first.ok);
  const { getDocumentProxy } = await import("unpdf");
  await getDocumentProxy(first.bytes); // the exact mistake the old code made
  const again = await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001", expectedBytes: pdf.length });
  assert.ok(again.ok);
  assert.equal(again.bytes.length, pdf.length, "never an empty array");
  assert.equal(sha(again.bytes), sha(pdf));
  assert.equal(again.sha256, sha(pdf));
  if (first.bytes.length === 0) {
    assert.equal(d.net.calls.length, 2, "the damaged copy was evicted and fetched again");
    assert.ok(d.events.some((e) => e.includes("evicted")));
  }
});

test("indexing hand-off end to end (real downloader + the real extraction used by the action): the source hash is the file's true hash, first call AND cache hit", async () => {
  const pdf = tinyPdf("Hello textbook chapter one");
  const expected = sha(pdf);
  const d = downloader(() => bytesResponse(pdf));
  const run = () =>
    resolveIndexSource({
      material: { id: "mat00000001", sizeKb: 9, indexError: null },
      maxDirectBytes: 40 * MB,
      loadOcr: async () => ({ kind: "none" }),
      getPdf: () => d.fetchPdf(SECRET_URL, 40 * MB, { materialId: "mat00000001", expectedBytes: pdf.length }),
      extractPages: extractPdfPages,
      textIsReadable: (pages) => assessTextLayer(pages).readable,
    });
  for (const label of ["first call", "second call (cache hit)", "third call (cache hit)"]) {
    const r = await run();
    assert.ok(r.ok, label);
    assert.equal(r.origin, "pdf");
    assert.equal(r.sourceSha, expected, `${label}: the chapter-link hash`);
    assert.notEqual(r.sourceSha, EMPTY_SHA, `${label}: not the hash of an emptied array`);
    assert.match(r.pages[0], /Hello textbook/, label);
  }
  assert.equal(d.net.calls.length, 1);
});

test("chapter linking receives the correct non-empty hash even after indexing has read the same cached PDF", async () => {
  const pdf = tinyPdf("Hello textbook chapter one");
  const d = downloader(() => bytesResponse(pdf));
  const getPdf = () => d.fetchPdf(SECRET_URL, 100 * MB, { materialId: "mat00000001", expectedBytes: pdf.length });
  // indexing reads the text first ...
  const got = await getPdf();
  assert.ok(got.ok);
  await extractPdfPages(got.bytes);
  // ... then the admin presses "Link chapters"
  const identity = await resolveSourceSha({ material: { id: "mat00000001", sizeKb: 9 }, maxDirectBytes: 40 * MB, readOcrIdentity: async () => null, getPdf });
  assert.deepEqual(identity, { ok: true, sha: sha(pdf) });
  assert.notEqual(identity.ok && identity.sha, EMPTY_SHA);
  assert.equal(d.net.calls.length, 1, "one download served both");
});

test("a response with NO length header is cut off at the size limit instead of being read in full", async () => {
  let pulled = 0;
  let cancelled = false;
  const chunk = new Uint8Array(256 * 1024).fill(1);
  const d = downloader(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (pulled >= 40) return controller.close(); // 10 MB available
            pulled++;
            controller.enqueue(chunk);
          },
          cancel() {
            cancelled = true;
          },
        }),
        { status: 200 }, // no content-length
      ),
  );
  const r = await d.fetchPdf(SECRET_URL, 1 * MB, { materialId: "mat00000001" });
  assert.deepEqual(r, { ok: false, reason: "too_big" });
  assert.ok(cancelled);
  assert.ok(pulled < 10, `stopped early (${pulled} of 40 chunks pulled)`);
});
