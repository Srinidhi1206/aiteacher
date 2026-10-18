// Offline tests for WHO MAY SEE A STUDY MATERIAL and its indexed passages (lib/materials/scope.ts). The same rule feeds the Materials page, the subject pages and the AI Tutor's
// retrieval, so it is checked once here against realistic in-memory rows - for the material filter and the passage filter alike, which must always agree. No database or network.
import { test } from "node:test";
import assert from "node:assert/strict";

import { studentMaterialWhere, studentChunkWhere, type StudentScope } from "@/lib/materials/scope";
import { matches } from "./fake-where";

const ME: StudentScope = { schoolId: "demo", boardId: "bse", schoolClassId: "c10" };
const links = (classId: string, enabled = true) => [{ schoolClassId: classId, isEnabled: enabled }];

interface M { id: string; isPublished: boolean; schoolId: string | null; boardId: string; schoolClassId: string; subject: { schoolClassLinks: { schoolClassId: string; isEnabled: boolean }[] } }
const material = (id: string, over: Partial<M> = {}): M => ({ id, isPublished: true, schoolId: "demo", boardId: "bse", schoolClassId: "c10", subject: { schoolClassLinks: links("c10") }, ...over });
// A passage copies school and class from its material; board and publication come from the material it belongs to.
const passage = (m: M) => ({ id: `chunk-of-${m.id}`, schoolId: m.schoolId, schoolClassId: m.schoolClassId, material: m });

const FIXTURES: Record<string, M> = {
  mine: material("mine"),
  common: material("common", { schoolId: null }),
  draft: material("draft", { isPublished: false }),
  otherSchool: material("otherSchool", { schoolId: "other" }),
  otherBoard: material("otherBoard", { boardId: "cbse" }),
  otherClass: material("otherClass", { schoolClassId: "c9", subject: { schoolClassLinks: links("c9") } }),
  hiddenSubject: material("hiddenSubject", { subject: { schoolClassLinks: links("c10", false) } }),
  commonDraft: material("commonDraft", { schoolId: null, isPublished: false }),
  commonOtherBoard: material("commonOtherBoard", { schoolId: null, boardId: "cbse" }),
};
const visible = (where: unknown, rows: unknown[]) => rows.filter((r) => matches(r as never, where)).map((r) => (r as { id: string }).id).sort();

test("a student sees published material of their own board and class: their school's own, and common (all-schools) material - nothing else", () => {
  const where = studentMaterialWhere(ME)!;
  assert.deepEqual(visible(where, Object.values(FIXTURES)), ["common", "mine"]);
});

test("a draft, another school's private material, another board's, another class's, and a subject the class has hidden are all invisible - common content never crosses boards or classes", () => {
  const where = studentMaterialWhere(ME)!;
  for (const id of ["draft", "otherSchool", "otherBoard", "otherClass", "hiddenSubject", "commonDraft", "commonOtherBoard"]) {
    assert.deepEqual(visible(where, [FIXTURES[id]]), [], id);
  }
});

test("the passage filter agrees with the material filter on every case (the tutor can never quote something the student could not open)", () => {
  const materialWhere = studentMaterialWhere(ME)!;
  const chunkWhere = studentChunkWhere(ME)!;
  for (const m of Object.values(FIXTURES)) {
    const canOpen = visible(materialWhere, [m]).length === 1;
    const canQuote = visible(chunkWhere, [passage(m)]).length === 1;
    assert.equal(canQuote, canOpen, `${m.id}: open=${canOpen} quote=${canQuote}`);
  }
});

test("a student who has not been placed (no school, no board or no class) sees NOTHING - common material is never 'everyone's'", () => {
  for (const missing of ["schoolId", "boardId", "schoolClassId"] as const) {
    const unplaced = { ...ME, [missing]: null };
    assert.equal(studentMaterialWhere(unplaced), null, missing);
    assert.equal(studentChunkWhere(unplaced), null, missing);
  }
});

test("a caller's own extra condition narrows the result without loosening the rule (an OR inside it cannot bring in an invisible material)", () => {
  const where = studentMaterialWhere(ME, { OR: [{ id: "draft" } as never, { id: "mine" } as never] })!;
  assert.deepEqual(visible(where, Object.values(FIXTURES)), ["mine"], "the draft matches the extra OR but not the rule");
});

test("two schools on the same board and class never see each other's private material", () => {
  const other: StudentScope = { schoolId: "other", boardId: "bse", schoolClassId: "c10" };
  assert.deepEqual(visible(studentMaterialWhere(other)!, Object.values(FIXTURES)), ["common", "otherSchool"]);
});
