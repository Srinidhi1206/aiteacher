// Offline tests for lib/exams/answer-saver.ts: exam answers are never lost silently, never saved out of order, and a failed save is sent again before submitting.
import { test } from "node:test";
import assert from "node:assert/strict";

import { createAnswerSaver, type SaveResult } from "@/lib/exams/answer-saver";

/** A fake server: records every save in the order it ARRIVED, and can be told to fail or to answer slowly. */
function server() {
  const s = {
    arrived: [] as [string, string][],
    stored: {} as Record<string, string>,
    fail: new Set<string>(),
    throwFor: new Set<string>(),
    delay: (_q: string, _v: string) => 0,
    inFlight: 0,
    maxInFlightPerQuestion: {} as Record<string, number>,
    perQuestion: {} as Record<string, number>,
    save: async (q: string, v: string): Promise<SaveResult> => {
      s.perQuestion[q] = (s.perQuestion[q] ?? 0) + 1;
      s.maxInFlightPerQuestion[q] = Math.max(s.maxInFlightPerQuestion[q] ?? 0, s.perQuestion[q]);
      await new Promise((r) => setTimeout(r, s.delay(q, v)));
      s.perQuestion[q]--;
      s.arrived.push([q, v]);
      if (s.throwFor.has(q)) throw new Error("network down");
      if (s.fail.has(q)) return { ok: false, error: "no" };
      s.stored[q] = v;
      return { ok: true };
    },
  };
  return s;
}

test("an answer is saved, and nothing is reported as failed", async () => {
  const s = server();
  const saver = createAnswerSaver(s.save);
  await saver.set("q1", "B");
  assert.deepEqual(s.stored, { q1: "B" });
  assert.deepEqual(saver.failed(), []);
});

test("a failed save is remembered (and announced), not swallowed", async () => {
  const s = server();
  const seen: string[][] = [];
  const saver = createAnswerSaver(s.save, (f) => seen.push(f));
  s.fail.add("q1");
  await saver.set("q1", "B");
  assert.deepEqual(saver.failed(), ["q1"]);
  assert.deepEqual(seen.at(-1), ["q1"]);
});

test("a save that THROWS (network down) is treated like a failed save", async () => {
  const s = server();
  s.throwFor.add("q1");
  const saver = createAnswerSaver(s.save);
  await saver.set("q1", "B");
  assert.deepEqual(saver.failed(), ["q1"]);
});

test("flush sends the unsaved answers again; once the fault is gone they are stored and the failure clears", async () => {
  const s = server();
  const seen: string[][] = [];
  const saver = createAnswerSaver(s.save, (f) => seen.push(f));
  s.fail.add("q1");
  await saver.set("q1", "B");
  await saver.set("q2", "True");
  s.fail.delete("q1");
  assert.deepEqual(await saver.flush(), []);
  assert.deepEqual(s.stored, { q1: "B", q2: "True" });
  assert.deepEqual(seen.at(-1), []);
});

test("flush reports what is STILL unsaved when the fault persists", async () => {
  const s = server();
  const saver = createAnswerSaver(s.save);
  s.fail.add("q1");
  await saver.set("q1", "B");
  assert.deepEqual(await saver.flush(), ["q1"]);
});

test("two quick changes to one question: the OLDER answer can never land last", async () => {
  const s = server();
  s.delay = (_q, v) => (v === "A" ? 40 : 5); // the first request is slower than the second
  const saver = createAnswerSaver(s.save);
  const first = saver.set("q1", "A");
  const second = saver.set("q1", "B");
  await Promise.all([first, second]);
  assert.equal(s.stored.q1, "B");
  assert.ok(s.arrived.at(-1)![1] === "B", JSON.stringify(s.arrived));
});

test("saves of one question never overlap, and while one is in flight a burst of typing is reduced to the newest value", async () => {
  const s = server();
  s.delay = () => 15;
  const saver = createAnswerSaver(s.save);
  const all = ["H", "He", "Hel", "Hell", "Hello"].map((v) => saver.set("essay", v));
  await Promise.all(all);
  assert.equal(s.stored.essay, "Hello");
  assert.equal(s.maxInFlightPerQuestion.essay, 1, "never two at once for the same question");
  assert.ok(s.arrived.length <= 2, `5 keystrokes became ${s.arrived.length} requests: ${JSON.stringify(s.arrived)}`);
});

test("different questions are independent: one failing does not stop the others", async () => {
  const s = server();
  s.fail.add("q1");
  const saver = createAnswerSaver(s.save);
  await Promise.all([saver.set("q1", "A"), saver.set("q2", "B"), saver.set("q3", "C")]);
  assert.deepEqual(s.stored, { q2: "B", q3: "C" });
  assert.deepEqual(saver.failed(), ["q1"]);
});

test("a failed older answer does not mark the question failed once a newer answer for it is saved", async () => {
  const s = server();
  const saver = createAnswerSaver(s.save);
  s.fail.add("q1");
  await saver.set("q1", "A");
  s.fail.delete("q1");
  await saver.set("q1", "B");
  assert.deepEqual(saver.failed(), []);
  assert.equal(s.stored.q1, "B");
});

test("flush waits for saves still in flight before it decides what is unsaved", async () => {
  const s = server();
  s.delay = () => 30;
  const saver = createAnswerSaver(s.save);
  saver.set("q1", "A"); // not awaited
  const left = await saver.flush();
  assert.deepEqual(left, []);
  assert.equal(s.stored.q1, "A");
});
