// Offline tests for the student's curriculum data (lib/actions/student-curriculum.ts) now that chapters carry topics and a verified place in the textbook: a subject's chapters in order with their topics (English's
// existing lessons included), the topic detail with its real chapter and subject, where a chapter starts in a complete textbook ONLY when that is known, and the student, school, class and subject boundaries - against an
// in-memory database that applies the REAL material scope rule. No real database, network or AI.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { matches } from "./fake-where";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
class UnauthorizedError extends Error {}
class ForbiddenError extends Error {}
let session: { id: string; role: string } | null = null;

const classLinks = (...ids: string[]) => ids.map((schoolClassId) => ({ schoolClassId, isEnabled: true }));
const students: Record<string, Row> = {
  anu: { id: "sAnu", userId: "uAnu", schoolId: "demo", schoolClassId: "c10", boardId: "bse", schoolClass: { label: "Class 10", board: { shortName: "BSE Telangana" } } },
  other: { id: "sOther", userId: "uOther", schoolId: "other-school", schoolClassId: "c10", boardId: "bse", schoolClass: { label: "Class 10", board: { shortName: "BSE Telangana" } } },
  class9: { id: "s9", userId: "u9", schoolId: "demo", schoolClassId: "c9", boardId: "bse", schoolClass: { label: "Class 9", board: { shortName: "BSE Telangana" } } },
  noSchool: { id: "sNo", userId: "uNo", schoolId: null, schoolClassId: "c10", boardId: "bse", schoolClass: { label: "Class 10", board: { shortName: "BSE Telangana" } } },
};
const links = [
  { schoolClassId: "c10", subjectId: "maths", isEnabled: true },
  { schoolClassId: "c10", subjectId: "english", isEnabled: true },
  { schoolClassId: "c9", subjectId: "geo", isEnabled: true },
];
const topicRow = (id: string, chapterId: string, name: string, order: number) => ({ id, chapterId, name, slug: id, bloomLevel: "UNDERSTAND", order });
const subjectsDb: Row[] = [
  {
    id: "maths",
    name: "Mathematics",
    chapters: [
      { id: "m1", subjectId: "maths", name: "Real Numbers", order: 0, topics: [topicRow("m1t1", "m1", "The Fundamental Theorem of Arithmetic", 0), topicRow("m1t2", "m1", "Irrational Numbers", 1)] },
      { id: "m2", subjectId: "maths", name: "Sets", order: 1, topics: [] }, // a chapter with no topics yet
      { id: "m3", subjectId: "maths", name: "Polynomials", order: 2, topics: [topicRow("m3t1", "m3", "Cubic Polynomials", 0)] },
    ],
  },
  {
    id: "english",
    name: "English",
    chapters: [
      { id: "e1", subjectId: "english", name: "Unit 1: Personality Development", order: 0, topics: [topicRow("e1t1", "e1", "Attitude Is Altitude", 0), topicRow("e1t2", "e1", "I Will Do It", 1)] },
      { id: "e2", subjectId: "english", name: "SCERT Textbook (test)", order: 1, topics: [] },
    ],
  },
  { id: "geo", name: "Geography", chapters: [{ id: "g1", subjectId: "geo", name: "Maps", order: 0, topics: [topicRow("g1t1", "g1", "Scale", 0)] }] },
];
const subjectLinks = (subjectId: string) => links.filter((l) => l.subjectId === subjectId).map((l) => ({ schoolClassId: l.schoolClassId, isEnabled: l.isEnabled }));
const mat = (o: Row): Row => ({ isPublished: true, boardId: "bse", schoolClassId: "c10", schoolId: null, subjectId: "maths", chapterId: null, topicId: null, materialType: "TEXTBOOK", uploadedAt: new Date("2026-10-01"), indexError: "Complete: 300 / 300 passages.", ...o });
let materials: Row[] = [];
let chunks: Row[] = [];
let progress: Row[] = [];
const subjectArgs: Row[] = [];
const linkArgs: Row[] = [];

const prisma = {
  student: { findUnique: async ({ where }: Row) => Object.values(students).find((s) => s.userId === where.userId) ?? null },
  schoolClassSubject: {
    findMany: async (args: Row) => { linkArgs.push(args); return []; },
    findUnique: async ({ where }: Row) => links.find((l) => l.schoolClassId === where.schoolClassId_subjectId.schoolClassId && l.subjectId === where.schoolClassId_subjectId.subjectId) ?? null,
  },
  subject: { findUnique: async (args: Row) => { subjectArgs.push(args); return subjectsDb.find((s) => s.id === args.where.id) ?? null; } },
  topic: {
    findUnique: async ({ where }: Row) => {
      for (const s of subjectsDb) for (const c of s.chapters) for (const t of c.topics) if (t.id === where.id) return { ...t, chapter: { ...c, subject: { id: s.id, name: s.name } } };
      return null;
    },
  },
  studentTopicProgress: {
    findMany: async ({ where }: Row) => progress.filter((p) => p.studentId === where.studentId && where.topicId.in.includes(p.topicId)),
    findUnique: async ({ where }: Row) => progress.find((p) => p.studentId === where.studentId_topicId.studentId && p.topicId === where.studentId_topicId.topicId) ?? null,
  },
  studyMaterial: {
    findMany: async ({ where, select }: Row) => {
      const rows = materials.filter((m) => matches({ ...m, subject: { schoolClassLinks: subjectLinks(m.subjectId) } }, where));
      return rows.sort((a, b) => b.uploadedAt - a.uploadedAt).map((m) => Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, m[k]])));
    },
    groupBy: async () => [],
  },
  materialChunk: {
    groupBy: async ({ where }: Row) => {
      const rows = chunks.filter((c) => matches(c, where));
      const groups = new Map<string, Row>();
      for (const c of rows) {
        const k = `${c.materialId}|${c.chapterId}`;
        const g = groups.get(k);
        if (!g) groups.set(k, { materialId: c.materialId, chapterId: c.chapterId, _min: { page: c.page } });
        else g._min.page = Math.min(g._min.page, c.page);
      }
      return [...groups.values()];
    },
  },
};
mock.module("server-only", { namedExports: {} });
mock.module(here("lib/prisma.ts"), { namedExports: { prisma } });
mock.module(here("lib/auth/current-session.ts"), {
  namedExports: {
    UnauthorizedError,
    ForbiddenError,
    getCurrentSession: async () => session,
    requireRole: async (role: string) => {
      if (!session) throw new UnauthorizedError("You must be signed in.");
      if (session.role !== role) throw new ForbiddenError("Not allowed.");
      return session;
    },
  },
});

const as = (who: keyof typeof students) => {
  session = { id: students[who].userId, role: "student" };
};
const reset = () => {
  // A complete whole-subject Mathematics textbook whose passages were linked to chapters (m1 from page 11, m2 from page 40, m3 none); the English textbook is filed UNDER a chapter.
  materials = [
    mat({ id: "book", title: "Mathematics Class 10", fileUrl: "https://blob.test/maths.pdf" }),
    mat({ id: "eng-book", title: "English Class 10", fileUrl: "https://blob.test/eng.pdf", subjectId: "english", chapterId: "e2" }),
  ];
  chunks = [
    { materialId: "book", chapterId: "m1", page: 12 },
    { materialId: "book", chapterId: "m1", page: 11 },
    { materialId: "book", chapterId: "m1", page: 20 },
    { materialId: "book", chapterId: "m2", page: 40 },
    { materialId: "book", chapterId: null, page: 3 },
    // an English textbook filed under chapter e2: every passage carries e2 whatever page it is on - that is NOT a verified page range
    { materialId: "eng-book", chapterId: "e2", page: 8 },
    { materialId: "eng-book", chapterId: "e2", page: 150 },
  ];
  progress = [{ studentId: "sAnu", topicId: "m1t1", status: "STRONG", mastery: 90 }, { studentId: "sAnu", topicId: "e1t1", status: "WEAK", mastery: 30 }];
  as("anu");
};

test("a subject lists its chapters in order, each with its topics in order and the student's own progress on them - English's existing lessons exactly as before", async () => {
  reset();
  const { getMySubject } = await import("@/lib/actions/student-curriculum");
  const maths = (await getMySubject("maths"))!;
  assert.deepEqual(maths.chapters.map((c) => c.name), ["Real Numbers", "Sets", "Polynomials"]);
  assert.deepEqual(maths.chapters[0].topics.map((t) => [t.name, t.status, t.mastery]), [["The Fundamental Theorem of Arithmetic", "STRONG", 90], ["Irrational Numbers", null, null]]);
  assert.deepEqual(maths.chapters[1].topics, [], "a chapter with no topics yet is listed, with none - nothing is made up");
  const english = (await getMySubject("english"))!;
  assert.deepEqual(english.chapters.map((c) => c.name), ["Unit 1: Personality Development", "SCERT Textbook (test)"]);
  assert.deepEqual(english.chapters[0].topics.map((t) => [t.id, t.name, t.status]), [["e1t1", "Attitude Is Altitude", "WEAK"], ["e1t2", "I Will Do It", null]]);
  assert.deepEqual(english.chapters[1].materials.map((m) => m.id), ["eng-book"], "the English textbook filed under its chapter is still listed there");
});

test("where a chapter starts in the textbook is shown ONLY when known: a complete whole-subject textbook whose passages were linked to the chapter - the first page of those passages", async () => {
  reset();
  const { getMySubject } = await import("@/lib/actions/student-curriculum");
  const maths = (await getMySubject("maths"))!;
  assert.deepEqual(maths.chapters.map((c) => c.textbook && c.textbook.page), [11, 40, null], "chapter 1 starts at its first linked page, not at a later one; a chapter with no linked passages has no section");
  assert.deepEqual(maths.chapters[0].textbook, { materialId: "book", title: "Mathematics Class 10", fileUrl: "https://blob.test/maths.pdf", page: 11 });
  assert.deepEqual(maths.subjectMaterials.map((m) => m.id), ["book"]);
  assert.ok(maths.subjectMaterials.every((m) => !("indexError" in m)), "the internal indexing status is not sent to the student");
  const english = (await getMySubject("english"))!;
  assert.ok(english.chapters.every((c) => c.textbook === null), "a textbook filed under a chapter has no verified page ranges: its passages all carry that chapter, so no page is claimed");
});

test("no section is claimed unless every condition holds: still indexing, partly indexed, not a textbook, filed under a chapter, unpublished, or someone else's private copy", async () => {
  const { getMySubject } = await import("@/lib/actions/student-curriculum");
  const startOf = async () => ((await getMySubject("maths"))!.chapters[0].textbook?.page ?? null);
  reset();
  assert.equal(await startOf(), 11);
  for (const indexError of ["Indexing in progress: 100 / 300 passages.", "Partial: indexed the first 100 of 300 passages (the per-material limit was reached).", "Reading pages (OCR): 4 / 186 pages.", null, "Some failure message"]) {
    reset();
    materials[0].indexError = indexError;
    assert.equal(await startOf(), null, String(indexError));
  }
  reset();
  materials[0].materialType = "STUDY_MATERIAL";
  assert.equal(await startOf(), null, "only a textbook has a section");
  reset();
  materials[0].chapterId = "m2";
  assert.equal(await startOf(), null, "a material filed under one chapter is not a whole textbook");
  reset();
  materials[0].isPublished = false;
  assert.equal(await startOf(), null, "an unpublished textbook is not the student's");
  reset();
  materials[0].schoolId = "other-school";
  assert.equal(await startOf(), null, "another school's private textbook is not visible");
  reset();
  materials[0].schoolClassId = "c9";
  assert.equal(await startOf(), null, "another class's textbook is not visible");
  reset();
  materials[0].boardId = "cbse";
  assert.equal(await startOf(), null, "another board's textbook is not visible");
  reset();
  chunks = chunks.filter((c) => c.chapterId !== "m1");
  assert.equal(await startOf(), null, "no linked passages, no section");
});

test("a school's private textbook reaches only that school's students; a common one reaches every school on the board and class", async () => {
  const { getMySubject } = await import("@/lib/actions/student-curriculum");
  reset();
  materials[0].schoolId = "demo";
  as("anu");
  assert.equal((await getMySubject("maths"))!.chapters[0].textbook?.page, 11);
  as("other");
  assert.equal((await getMySubject("maths"))!.chapters[0].textbook, null);
  reset();
  materials[0].schoolId = null;
  as("other");
  assert.equal((await getMySubject("maths"))!.chapters[0].textbook?.page, 11, "common material");
  as("noSchool");
  assert.equal((await getMySubject("maths"))!.chapters[0].textbook, null, "a student with no school sees no school content");
});

test("a subject that is not in the student's own class is not found - the same answer as one that does not exist - and only a student can ask", async () => {
  const { getMySubject, getMyTopic } = await import("@/lib/actions/student-curriculum");
  reset();
  assert.equal(await getMySubject("geo"), null, "Geography is Class 9's");
  assert.equal(await getMySubject("nope"), null);
  assert.equal(await getMyTopic("geo", "g1t1"), null);
  as("class9");
  assert.equal(await getMySubject("maths"), null, "a Class 9 student cannot read Class 10's Mathematics");
  assert.equal(await getMyTopic("maths", "m1t1"), null);
  session = { id: "t1", role: "teacher" };
  await assert.rejects(() => getMySubject("maths"), ForbiddenError);
  session = null;
  await assert.rejects(() => getMyTopic("maths", "m1t1"), UnauthorizedError);
});

test("the topic detail loads the real topic with its real chapter and subject, the student's mastery, and where its chapter starts in the textbook", async () => {
  reset();
  const { getMyTopic } = await import("@/lib/actions/student-curriculum");
  const t = (await getMyTopic("maths", "m1t1"))!;
  assert.equal(t.subjectName, "Mathematics");
  assert.equal(t.chapterName, "Real Numbers");
  assert.deepEqual(t.topic, { id: "m1t1", name: "The Fundamental Theorem of Arithmetic", bloomLevel: "UNDERSTAND" });
  assert.equal(t.status, "STRONG");
  assert.equal(t.mastery, 90);
  assert.equal(t.chapterTextbook?.page, 11);
  const e = (await getMyTopic("english", "e1t1"))!;
  assert.deepEqual([e.subjectName, e.chapterName, e.topic.name, e.status, e.chapterTextbook], ["English", "Unit 1: Personality Development", "Attitude Is Altitude", "WEAK", null]);
  assert.equal(await getMyTopic("maths", "e1t1"), null, "a topic of another subject under this subject's address is not found");
  assert.equal(await getMyTopic("maths", "does-not-exist"), null);
  const noTextbook = (await getMyTopic("maths", "m3t1"))!;
  assert.equal(noTextbook.chapterTextbook, null, "Polynomials has no linked passages: no section is claimed");
});

test("chapters and topics are always read in a deterministic order: by position, then by id, so two with the same position never swap between reads", async () => {
  reset();
  subjectArgs.length = 0;
  linkArgs.length = 0;
  const { getMySubject, getMyCurriculumLinks } = await import("@/lib/actions/student-curriculum");
  await getMySubject("maths");
  await getMyCurriculumLinks();
  const tie = [{ order: "asc" }, { id: "asc" }];
  const include = subjectArgs[0].include.chapters;
  assert.deepEqual(include.orderBy, tie, "chapters: position, then id");
  assert.deepEqual(include.include.topics.orderBy, tie, "topics: position, then id");
  const links = linkArgs[0].select.subject.select.chapters;
  assert.deepEqual(links.orderBy, tie);
  assert.deepEqual(links.select.topics.orderBy, tie);
});
