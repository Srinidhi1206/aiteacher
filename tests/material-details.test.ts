// Offline tests for lib/materials/details.ts (updateMaterialDetailsCore): moving a study material - for example a whole textbook filed under a placeholder chapter - to
// "Whole subject (no chapter)" without touching its indexed passages' text or embeddings. In-memory database; no network. The scenario mirrors the real English textbook:
// 648 passages, one placeholder chapter, eight genuine units.
import { test } from "node:test";
import assert from "node:assert/strict";

import { updateMaterialDetailsCore, type DetailsDb } from "@/lib/materials/details";

type Chunk = { id: string; materialId: string; schoolId: string | null; schoolClassId: string; subjectId: string; chapterId: string | null; topicId: string | null; chunkIndex: number; page: number | null; text: string; embedding: number[]; createdAt: string };
type Material = { id: string; title: string; description: string | null; subjectId: string; chapterId: string | null; topicId: string | null; fileUrl: string; sizeKb: number; indexedAt: string; updatedAt: number };

const PASSAGES = 648;

function world() {
  const chapters = [
    { id: "ch-test", subjectId: "english", name: "SCERT Textbook (test)" },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `ch-unit${i + 1}`, subjectId: "english", name: `Unit ${i + 1}` })),
    { id: "ch-maths-1", subjectId: "maths", name: "Real Numbers" },
  ];
  const topics = [{ id: "t-unit1-a", chapterId: "ch-unit1" }, { id: "t-test-a", chapterId: "ch-test" }];
  const material: Material = { id: "m1", title: "Class 10 English - SCERT Telangana Textbook Test", description: null, subjectId: "english", chapterId: "ch-test", topicId: null, fileUrl: "https://blob.example/english.pdf", sizeKb: 69000, indexedAt: "2026-10-03T10:00:00.000Z", updatedAt: 1 };
  const chunks: Chunk[] = Array.from({ length: PASSAGES }, (_, i) => ({
    id: `c${i}`,
    materialId: "m1",
    schoolId: "demo",
    schoolClassId: "c10",
    subjectId: "english",
    chapterId: "ch-test",
    topicId: null,
    chunkIndex: i,
    page: i + 1,
    text: `Passage ${i}: ¡unicode ✓ ${"lorem ".repeat(i % 7)}`,
    embedding: Array.from({ length: 8 }, (_, k) => Math.sin(i * 31 + k) / 3),
    createdAt: "2026-10-03T10:05:00.000Z",
  }));
  // A second material in the same subject, which must never be affected by moving the first.
  const other: Chunk[] = Array.from({ length: 3 }, (_, i) => ({ ...chunks[i], id: `o${i}`, materialId: "m2", chapterId: "ch-unit1", topicId: "t-unit1-a" }));
  const state = { material, chunks: [...chunks, ...other], failChunkUpdate: false, materialWrites: 0, chunkWrites: 0, transactions: 0 };

  // A write made through `tx` (the handle a transaction callback receives) lands on a private copy that is kept only if the callback finishes; a write made through the
  // plain `db` handle - OUTSIDE a transaction - lands on the real data at once and cannot be undone. That is how a real database behaves, and it is what lets the
  // partial-failure test notice code that forgets to write through `tx`.
  type Data = { material: Material; chunks: Chunk[] };
  const api = (d: Data) => ({
    studyMaterial: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id !== d.material.id) return null;
        const m = d.material;
        return { id: m.id, title: m.title, description: m.description, subjectId: m.subjectId, chapterId: m.chapterId, topicId: m.topicId, chapter: m.chapterId ? { name: chapters.find((c) => c.id === m.chapterId)?.name ?? "?" } : null };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Material> }) => {
        assert.equal(where.id, d.material.id);
        state.materialWrites++;
        Object.assign(d.material, data, { updatedAt: d.material.updatedAt + 1 });
      },
    },
    materialChunk: {
      updateMany: async ({ where, data }: { where: { materialId: string }; data: { chapterId?: string | null; topicId?: string | null } }) => {
        if (state.failChunkUpdate) throw new Error("simulated failure while moving the passages");
        const hit = d.chunks.filter((c) => c.materialId === where.materialId);
        for (const c of hit) Object.assign(c, data);
        state.chunkWrites++;
        return { count: hit.length };
      },
    },
    chapter: { findUnique: async ({ where }: { where: { id: string } }) => chapters.find((c) => c.id === where.id) ?? null },
    topic: { findUnique: async ({ where }: { where: { id: string } }) => topics.find((t) => t.id === where.id) ?? null },
  });
  const db = {
    ...api(state),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      state.transactions++;
      const staging: Data = structuredClone({ material: state.material, chunks: state.chunks });
      const result = await fn(api(staging)); // a throw leaves `staging` unused: nothing it wrote is kept
      state.material = staging.material;
      state.chunks = staging.chunks;
      return result;
    },
  };
  return { state, db: db as unknown as DetailsDb };
}

const mine = (s: ReturnType<typeof world>["state"]) => s.chunks.filter((c) => c.materialId === "m1");
/** Everything about a passage except where it is filed. */
const content = (c: Chunk) => JSON.stringify({ ...c, chapterId: undefined, topicId: undefined });

test("the scenario is what the real data looks like: 648 passages, all under the placeholder chapter", () => {
  const { state } = world();
  assert.equal(mine(state).length, PASSAGES);
  assert.ok(mine(state).every((c) => c.chapterId === "ch-test" && c.topicId === null));
});

test("moving the textbook to the whole subject clears its chapter and topic - on the material and on every passage", async () => {
  const { state, db } = world();
  const res = await updateMaterialDetailsCore(db, "m1", { chapterId: null });
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.passages, PASSAGES, "all 648 passages were moved with it");
  assert.equal(state.material.chapterId, null);
  assert.equal(state.material.topicId, null);
  assert.ok(mine(state).every((c) => c.chapterId === null && c.topicId === null));
  assert.match(res.ok ? res.changes.join(" ") : "", /placed in the whole subject \(was chapter "SCERT Textbook \(test\)"\)/);
});

test("all 648 passages are still there, and their text, embeddings, pages, order and every other field are unchanged", async () => {
  const { state, db } = world();
  const before = mine(state).map(content);
  const ids = mine(state).map((c) => c.id);
  await updateMaterialDetailsCore(db, "m1", { chapterId: null });
  const after = mine(state);
  assert.equal(after.length, PASSAGES);
  assert.deepEqual(after.map((c) => c.id), ids, "no passage was added, removed or reordered");
  assert.deepEqual(after.map(content), before, "text, embedding, page, chunkIndex, school/class/subject, createdAt: identical");
  assert.equal(new Set(after.map((c) => c.chunkIndex)).size, PASSAGES);
});

test("the file itself is untouched: same file, size, indexing mark and description; only the placement (and the edit time) changed", async () => {
  const { state, db } = world();
  const before = { ...state.material };
  await updateMaterialDetailsCore(db, "m1", { chapterId: null });
  assert.deepEqual({ ...state.material, chapterId: 0, updatedAt: 0 }, { ...before, chapterId: 0, updatedAt: 0 });
});

test("another material in the same subject is not touched", async () => {
  const { state, db } = world();
  const others = state.chunks.filter((c) => c.materialId === "m2").map((c) => JSON.stringify(c));
  await updateMaterialDetailsCore(db, "m1", { chapterId: null });
  assert.deepEqual(state.chunks.filter((c) => c.materialId === "m2").map((c) => JSON.stringify(c)), others);
});

test("repeating the update says 'Nothing to change' and writes nothing", async () => {
  const { state, db } = world();
  await updateMaterialDetailsCore(db, "m1", { chapterId: null });
  const [mw, cw, tx, snap] = [state.materialWrites, state.chunkWrites, state.transactions, JSON.stringify(state.chunks)];
  const again = await updateMaterialDetailsCore(db, "m1", { chapterId: null });
  assert.deepEqual(again, { ok: false, error: "Nothing to change." });
  assert.deepEqual([state.materialWrites, state.chunkWrites, state.transactions], [mw, cw, tx], "no write and no transaction on the repeat");
  assert.equal(JSON.stringify(state.chunks), snap);
});

test("a chapter of another subject is refused, and nothing is written", async () => {
  const { state, db } = world();
  const before = JSON.stringify([state.material, state.chunks]);
  const res = await updateMaterialDetailsCore(db, "m1", { chapterId: "ch-maths-1" });
  assert.deepEqual(res, { ok: false, error: "That chapter does not belong to this material's subject." });
  assert.equal(JSON.stringify([state.material, state.chunks]), before);
  assert.deepEqual([state.materialWrites, state.chunkWrites, state.transactions], [0, 0, 0]);
});

test("a chapter that does not exist, a material that does not exist, and a topic from another chapter are all refused", async () => {
  const { state, db } = world();
  assert.equal((await updateMaterialDetailsCore(db, "m1", { chapterId: "no-such-chapter" })).ok, false);
  assert.deepEqual(await updateMaterialDetailsCore(db, "no-such-material", { chapterId: null }), { ok: false, error: "Material not found." });
  assert.match((await updateMaterialDetailsCore(db, "m1", { chapterId: "ch-unit2", topicId: "t-unit1-a" }) as { error: string }).error, /topic does not belong/);
  assert.deepEqual([state.materialWrites, state.chunkWrites], [0, 0]);
});

test("if moving the passages fails partway, the transaction leaves NO partial change (the material keeps its old chapter too)", async () => {
  const { state, db } = world();
  const before = JSON.stringify([state.material, state.chunks]);
  state.failChunkUpdate = true;
  await assert.rejects(() => updateMaterialDetailsCore(db, "m1", { chapterId: null }), /simulated failure/);
  assert.equal(state.materialWrites, 1, "the material WAS written inside the transaction ...");
  assert.equal(JSON.stringify([state.material, state.chunks]), before, "... and was rolled back with the passages");
  assert.equal(state.material.chapterId, "ch-test");
  assert.ok(mine(state).every((c) => c.chapterId === "ch-test"));
  // and a retry once the fault is gone completes normally
  state.failChunkUpdate = false;
  const res = await updateMaterialDetailsCore(db, "m1", { chapterId: null });
  assert.equal(res.ok, true);
  assert.ok(mine(state).every((c) => c.chapterId === null));
});

test("moving to a real chapter and back keeps every passage and drops the topic when the chapter changes", async () => {
  const { state, db } = world();
  state.material.topicId = "t-test-a";
  state.chunks.filter((c) => c.materialId === "m1").forEach((c) => (c.topicId = "t-test-a"));
  const before = mine(state).map(content);
  const res = await updateMaterialDetailsCore(db, "m1", { chapterId: "ch-unit3" });
  assert.equal(res.ok, true);
  assert.ok(mine(state).every((c) => c.chapterId === "ch-unit3" && c.topicId === null), "the old topic does not follow into the new chapter");
  await updateMaterialDetailsCore(db, "m1", { chapterId: "ch-test" });
  assert.deepEqual(mine(state).map(content), before);
});

test("a title-only edit does not touch the passages at all", async () => {
  const { state, db } = world();
  const res = await updateMaterialDetailsCore(db, "m1", { title: "Class 10 English Textbook" });
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.passages, 0);
  assert.equal(state.chunkWrites, 0);
  assert.equal(state.material.title, "Class 10 English Textbook");
});
