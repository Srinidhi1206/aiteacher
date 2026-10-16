// Offline tests for the OCR reader's failure handling. The Gemini client is replaced by a mock, so nothing here calls Gemini or the network.
// Needs Node's module mocking (the --experimental-test-module-mocks flag in `npm run test:storage`).
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const here = (path: string) => new URL(`../${path}`, import.meta.url).href;
const MODELS = ["m-primary", "m-two", "m-three", "m-four"];
const FAKE_KEY = "fake-test-key-never-real-0123456789";
const PAGE_TEXT = "SECRET TEXTBOOK SENTENCE";

const attempts: string[] = [];
let behaviour: (model: string) => Promise<Record<string, unknown>> = async () => ({});

mock.module("server-only", { namedExports: {} });
let providerChain = MODELS;
mock.module(here("lib/ai/provider.ts"), { namedExports: { geminiModelChain: () => providerChain } });
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

// ---------- diagnostics for unusable replies (counts and enum names only) ----------

const twoPages = [
  { page: 5, png: new Uint8Array([1, 2, 3]) },
  { page: 6, png: new Uint8Array([4, 5, 6]) },
];
const PAGE_ONE_TEXT = "यह पृष्ठ पांच का गुप्त पाठ है";

test("an EMPTY reply is logged as such, with its finish / block reason and no text; the chain still tries every model once", async () => {
  attempts.length = 0;
  const { readPages, ocrModelChain } = await loadReader();
  behaviour = async () => ({ text: undefined, candidates: [{ finishReason: "SAFETY" }], promptFeedback: { blockReason: "PROHIBITED_CONTENT" } });
  const out = await captureErrors(() => readPages(twoPages, Date.now() + 120_000, 0));
  assert.ok("error" in out);
  assert.equal(attempts.length, ocrModelChain().length);
  const log = out.lines.join("\n");
  assert.ok(log.includes("unparseable") && log.includes("empty reply (1 candidates, finish=SAFETY, block=PROHIBITED_CONTENT)"), log);
  assert.ok(!log.includes(FAKE_KEY) && !log.includes("inlineData"));
});

test("an empty reply with no candidates at all is described as such", async () => {
  attempts.length = 0;
  const { readPages } = await loadReader();
  behaviour = async () => ({});
  const out = await captureErrors(() => readPages(twoPages, Date.now() + 120_000, 0));
  assert.ok(out.lines.join("\n").includes("empty reply (0 candidates)"));
});

test("a reply with the WRONG MARKERS is logged with counts only - never the reply's text", async () => {
  attempts.length = 0;
  const { readPages } = await loadReader();
  behaviour = async () => ({ text: `=====PAGE 5=====\n${PAGE_ONE_TEXT}` }); // page 6's marker is missing
  const missing = await captureErrors(() => readPages(twoPages, Date.now() + 120_000, 0));
  const log = missing.lines.join("\n");
  assert.ok(log.includes("page markers 1 of 2 (missing)"), log);
  assert.ok(!log.includes(PAGE_ONE_TEXT), "the OCR text is never logged");

  behaviour = async () => ({ text: `=====PAGE 6=====\nx\n=====PAGE 5=====\n${PAGE_ONE_TEXT}` });
  const order = await captureErrors(() => readPages(twoPages, Date.now() + 120_000, 0));
  assert.ok(order.lines.join("\n").includes("page markers 2 of 2 (order)"));
});

test("an answer with an EMPTY page is accepted: the marker is there, the page's text is empty", async () => {
  attempts.length = 0;
  const { readPages } = await loadReader();
  behaviour = async () => ({ text: `=====PAGE 5=====\n=====PAGE 6=====\n${PAGE_ONE_TEXT}` });
  const out = await captureErrors(() => readPages(twoPages, Date.now() + 120_000, 0));
  assert.ok("value" in out);
  assert.deepEqual(out.value.pages, ["", PAGE_ONE_TEXT]);
  assert.equal(attempts.length, 1, "no fallback was needed");
  assert.equal(out.lines.length, 0);
});

test("harmlessly formatted markers are accepted end to end", async () => {
  attempts.length = 0;
  const { readPages } = await loadReader();
  behaviour = async () => ({ text: `**=====PAGE 5=====**\r\n${PAGE_ONE_TEXT}\r\n===== Page 6 =====\r\nदूसरा` });
  const out = await captureErrors(() => readPages(twoPages, Date.now() + 120_000, 0));
  assert.ok("value" in out && out.value.pages.length === 2 && out.value.pages[0] === PAGE_ONE_TEXT && out.value.pages[1] === "दूसरा");
});

// ---------- the time budget: one hung model must not starve the rest of the chain ----------

test("attemptTimeoutMs: never past the deadline, never above 28 s, at least 15 s when there is time, and at most half of what is left", async () => {
  const { attemptTimeoutMs } = await loadReader();
  assert.equal(attemptTimeoutMs(100_000), 28_000);
  assert.equal(attemptTimeoutMs(45_000), 22_500);
  assert.equal(attemptTimeoutMs(30_000), 15_000);
  assert.equal(attemptTimeoutMs(20_000), 15_000);
  assert.equal(attemptTimeoutMs(7_000), 6_000, "never more than remaining - 1 s");
  assert.ok(attemptTimeoutMs(6_000) >= 1000 && attemptTimeoutMs(6_000) <= 5_000);
  for (const r of [6_000, 9_000, 15_000, 30_000, 49_000, 120_000]) {
    const t = attemptTimeoutMs(r);
    assert.ok(t <= 28_000 && t <= r - 1000 && t >= 1000, `remaining ${r} -> ${t}`);
  }
});

test("when every model HANGS to its time limit, three models are still tried in a 45 s call (a single hang leaves 22 s for the rest, up from 17 s)", async () => {
  const { attemptTimeoutMs } = await loadReader();
  const simulate = (timeoutOf: (remaining: number) => number) => {
    let remaining = 45_000;
    let tried = 0;
    while (remaining >= 6_000) {
      remaining -= timeoutOf(remaining);
      tried++;
    }
    return { tried, leftAfterFirst: 45_000 - timeoutOf(45_000) };
  };
  const old = simulate((r) => Math.min(28_000, r - 1000));
  const now = simulate(attemptTimeoutMs);
  assert.equal(old.tried, 2);
  assert.ok(now.tried >= 3, `tried ${now.tried}`);
  assert.ok(now.leftAfterFirst > old.leftAfterFirst);
});

// ---------- model rotation between passes: deterministic ----------

// The two chain lengths that occur: the default setup (flash-latest + 4 extras + 3.6 + 2.5) and the local one (GEMINI_MODEL=gemini-3.6-flash).
const DEFAULT_SETUP = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-2.5-flash"];
const LOCAL_SETUP = ["gemini-3.6-flash", "gemini-2.5-flash"];

test("the real chain is 7 models in the default setup and 6 when GEMINI_MODEL is gemini-3.6-flash (the lengths the rotation is built for)", async () => {
  const { ocrModelChain } = await loadReader();
  providerChain = DEFAULT_SETUP;
  assert.equal(ocrModelChain().length, 7);
  providerChain = LOCAL_SETUP;
  assert.equal(ocrModelChain().length, 6);
  providerChain = MODELS;
});

test("rotationSalt is the same for one call and orderModels is stable for it: every window of a call keeps its order", async () => {
  const { rotationSalt, orderModels } = await loadReader();
  const t = 1_790_000_123_456;
  assert.equal(rotationSalt(t), rotationSalt(t));
  const chain = ["a", "b", "c", "d", "e", "f", "g"];
  const first = orderModels(chain, 45 + rotationSalt(t));
  for (let i = 0; i < 20; i++) assert.deepEqual(orderModels(chain, 45 + rotationSalt(t)), first);
  assert.deepEqual([...first].sort(), [...chain].sort(), "a rotation, never a drop or a repeat");
  // Windows of one call (different first pages) still start on different models.
  const starts = new Set([45, 47, 49].map((w) => orderModels(chain, w + rotationSalt(t))[0]));
  assert.equal(starts.size, 3);
});

test("a retry 18 s to 89 s after a pass ALWAYS starts on a different model, for chains of 6 and 7 (the real retry gap is 20 s + the pass's run time, up to 60 s)", async () => {
  const { rotationSalt, orderModels, ROTATION_BUCKET_MS } = await loadReader();
  assert.equal(ROTATION_BUCKET_MS, 18_000);
  for (const n of [6, 7]) {
    const chain = Array.from({ length: n }, (_, i) => `m${i}`);
    for (const window of [1, 45, 46, 89]) {
      // every phase of the clock within a bucket, every whole-second gap from 18 s to 89 s
      for (let phase = 0; phase < ROTATION_BUCKET_MS; phase += 250) {
        const t0 = 1_790_000_000_000 - (1_790_000_000_000 % ROTATION_BUCKET_MS) + phase;
        const before = orderModels(chain, window + rotationSalt(t0))[0];
        for (let gap = 18_000; gap <= 89_000; gap += 1000) {
          const after = orderModels(chain, window + rotationSalt(t0 + gap))[0];
          assert.notEqual(after, before, `chain ${n}, window ${window}, phase ${phase} ms, gap ${gap / 1000} s`);
        }
      }
    }
  }
});

test("the gap range the admin screen can really produce is covered: 20 s pause + a pass of 0 to 60 s", async () => {
  const { rotationSalt } = await loadReader();
  const worstLow = 20_000; // pause only (a pass that ended instantly)
  const worstHigh = 20_000 + 60_000; // pause + a pass killed at the 60 s function limit
  for (const n of [6, 7]) {
    for (let phase = 0; phase < 18_000; phase += 100) {
      const t0 = 1_790_000_000_000 - (1_790_000_000_000 % 18_000) + phase;
      for (const gap of [worstLow, worstLow + 1, 45_000, worstHigh - 1, worstHigh]) {
        const shift = rotationSalt(t0 + gap) - rotationSalt(t0);
        assert.ok(shift % n !== 0, `chain ${n}: gap ${gap} ms shifts the start by ${shift}`);
      }
    }
  }
});

// ---------- regression: a fractional timeout made AbortSignal.timeout throw, so about half of all model attempts failed instantly ----------

test("attemptTimeoutMs always returns a whole, positive number of ms that AbortSignal.timeout accepts - for fractional and odd remaining times too", async () => {
  const { attemptTimeoutMs } = await loadReader();
  // The old formula (half of the remaining time, unrounded) really did throw for an odd remaining time - this is the bug.
  const oldFormula = (r: number) => Math.max(1000, Math.min(Math.min(28_000, Math.max(15_000, r / 2)), r - 1000));
  assert.throws(() => AbortSignal.timeout(oldFormula(45_001)), RangeError);
  // Fractional input, odd input, even input: the new value is an integer and the signal can be built.
  for (const r of [45_001, 45_000.5, 44_999.75, 30_001, 49_321.3, 6_001, 6_000.5, 119_999]) {
    const t = attemptTimeoutMs(r);
    assert.ok(Number.isInteger(t) && t > 0, `remaining ${r} -> ${t}`);
    assert.doesNotThrow(() => AbortSignal.timeout(t), `remaining ${r}`);
  }
  assert.equal(attemptTimeoutMs(45_001), 22_500, "rounded DOWN, so never past the deadline");
  // Sweep every half millisecond of a realistic range: always valid, never past the deadline.
  for (let r = 0; r <= 120_000; r += 0.5) {
    const t = attemptTimeoutMs(r);
    if (!(Number.isInteger(t) && t >= 1 && t <= 28_000)) assert.fail(`remaining ${r} -> ${t}`);
    if (r >= 2_000 && t > r - 1_000) assert.fail(`remaining ${r} -> ${t} is past the 1 s safety margin`);
    if (t > Math.max(1, Math.floor(r))) assert.fail(`remaining ${r} -> ${t} is past the deadline`);
  }
});

test("attemptTimeoutMs at the boundaries: almost no time left, none left, past the deadline, and bad input", async () => {
  const { attemptTimeoutMs } = await loadReader();
  assert.equal(attemptTimeoutMs(6_000), 5_000, "the smallest call the reader starts (6 s left) keeps its 1 s margin");
  assert.equal(attemptTimeoutMs(2_000), 1_000);
  assert.equal(attemptTimeoutMs(1_500), 1_000, "under 2 s the 1 s floor applies...");
  assert.equal(attemptTimeoutMs(500.7), 500, "...but never beyond the time that is left");
  assert.equal(attemptTimeoutMs(1), 1);
  for (const bad of [0, -1, -50_000, 0.4, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const t = attemptTimeoutMs(bad);
    assert.ok(Number.isInteger(t) && t >= 1, `input ${bad} -> ${t}`);
    assert.doesNotThrow(() => AbortSignal.timeout(t));
  }
  assert.equal(attemptTimeoutMs(1_000_000), 28_000, "never more than 28 s however much time there is");
});

test("end to end: with an ODD remaining time (the old failure) the first model is really asked and its answer used - no instant 'error'", async () => {
  attempts.length = 0;
  const { readPages } = await loadReader();
  behaviour = async () => ({ text: "=====PAGE 5=====\n" + PAGE_ONE_TEXT });
  const FIXED_NOW = 1_790_000_000_000;
  const realNow = Date.now;
  Date.now = () => FIXED_NOW; // remaining = deadline - now is exactly 45,001 ms
  try {
    const out = await captureErrors(() => readPages(images, FIXED_NOW + 45_001, 0));
    assert.ok("value" in out, "the reader answered instead of failing");
    assert.equal(out.value.pages[0], PAGE_ONE_TEXT);
    assert.equal(attempts.length, 1, "the first model was used");
    assert.equal(out.lines.length, 0, "no failure line logged");
  } finally {
    Date.now = realNow;
  }
});

test("a fractional remaining time never produces an instant 'error' for any model: every model in the chain is really called", async () => {
  attempts.length = 0;
  const { readPages, ocrModelChain } = await loadReader();
  behaviour = async () => Promise.reject(httpError(503)); // every model overloaded: the point is that each one is asked
  const FIXED_NOW = 1_790_000_000_000;
  const realNow = Date.now;
  Date.now = () => FIXED_NOW;
  try {
    const out = await captureErrors(() => readPages(images, FIXED_NOW + 48_001, 0));
    assert.ok("error" in out);
    assert.equal(attempts.length, ocrModelChain().length, "all models were called (the old code skipped about half with a RangeError)");
    const log = out.lines.join("\n");
    assert.ok(!/status: 'error'|"status":"error"/.test(log), log);
    assert.ok(log.includes("503"));
  } finally {
    Date.now = realNow;
  }
});
