// Offline tests for the OCR reader's failure handling. The Gemini client is replaced by a mock, so nothing here calls Gemini or the network.
// Needs Node's module mocking (the --experimental-test-module-mocks flag in `npm run test:storage`).
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const here = (path: string) => new URL(`../${path}`, import.meta.url).href;
const MODELS = ["m-primary", "m-two", "m-three", "m-four"];
const FAKE_KEY = "fake-test-key-never-real-0123456789";
const PAGE_TEXT = "SECRET TEXTBOOK SENTENCE";

const attempts: string[] = [];
let behaviour: (model: string) => Promise<{ text?: string }> = async () => ({});

mock.module("server-only", { namedExports: {} });
mock.module(here("lib/ai/provider.ts"), { namedExports: { geminiModelChain: () => MODELS } });
mock.module("@google/genai", {
  namedExports: {
    GoogleGenAI: class {
      models = {
        generateContent: async (args: { model: string }) => {
          attempts.push(args.model);
          return behaviour(args.model);
        },
      };
    },
  },
});

process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = FAKE_KEY;

// Imported lazily, after the mocks above are in place (the test runner compiles files as CommonJS, so no top-level await).
const loadReader = () => import("@/lib/rag/ocr-reader");
const images = [{ page: 5, png: new Uint8Array([1, 2, 3]) }];
const httpError = (status: number) => Object.assign(new Error(`${PAGE_TEXT} ${FAKE_KEY} http ${status}`), { status });

function captureErrors<T>(run: () => Promise<T>) {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  return run().then(
    (value) => ((console.error = original), { value, lines }),
    (error) => ((console.error = original), { error, lines }),
  );
}

test("every model fails: ONE attempt each, no waiting, and the log names each model with its status - nothing else", async () => {
  attempts.length = 0;
  const statusOf: Record<string, number> = { "m-primary": 429, "m-two": 503, "m-three": 429, "m-four": 503 };
  behaviour = async (model) => Promise.reject(httpError(statusOf[model] ?? 503));
  const { readPages, OcrReaderUnavailableError, ocrModelChain } = await loadReader();
  const started = Date.now();
  const out = await captureErrors(() => readPages(images, Date.now() + 120_000, 0));
  const elapsed = Date.now() - started;

  assert.ok("error" in out && out.error instanceof OcrReaderUnavailableError);
  const chain = ocrModelChain();
  assert.deepEqual([...attempts].sort(), [...chain].sort(), "each model in the chain was tried exactly once");
  assert.ok(elapsed < 3000, `no same-model retry wait (took ${elapsed} ms)`);

  const log = out.lines.join("\n");
  assert.ok(log.includes("[ocr] reader failed"));
  for (const m of MODELS) assert.ok(log.includes(m), `log names ${m}`);
  assert.ok(log.includes("429") && log.includes("503"));
  for (const forbidden of [FAKE_KEY, PAGE_TEXT, "inlineData", "OCR engine", "GEMINI_API_KEY"]) assert.ok(!log.includes(forbidden), `must not log: ${forbidden}`);
});

test("all models 429 -> the error is flagged as quota; a mixture of 429 and 503 is NOT", async () => {
  attempts.length = 0;
  const { readPages, OcrReaderUnavailableError } = await loadReader();
  behaviour = async () => Promise.reject(httpError(429));
  const allQuota = await captureErrors(() => readPages(images, Date.now() + 120_000, 0));
  assert.ok("error" in allQuota && allQuota.error instanceof OcrReaderUnavailableError && allQuota.error.quota === true);

  behaviour = async (model) => Promise.reject(httpError(model === "m-primary" ? 429 : 503));
  const mixed = await captureErrors(() => readPages(images, Date.now() + 120_000, 0));
  assert.ok("error" in mixed && mixed.error instanceof OcrReaderUnavailableError && mixed.error.quota === false);
});

test("a model that answers in the wrong shape is logged as 'unparseable' and the next model is tried", async () => {
  attempts.length = 0;
  const { readPages, ocrModelChain } = await loadReader();
  const [first, second] = ocrModelChain();
  behaviour = async (model) => (model === first ? { text: "no page markers here" } : { text: "=====PAGE 5=====\nयह एक पाठ है" });
  const out = await captureErrors(() => readPages(images, Date.now() + 120_000, 0));
  assert.ok("value" in out && out.value.model === second && out.value.pages.length === 1);
  assert.deepEqual(attempts, [first, second]);
  assert.equal(out.lines.length, 0, "a success logs no failure line");
});
