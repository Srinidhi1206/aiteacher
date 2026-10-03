// Core logic for shaping ONE class's subject list, kept apart from the server actions in
// lib/actions/curriculum-admin.ts so it takes the database handle as a parameter (tests pass a transaction they
// roll back). The actions decide who may call; `actor.mayWrite` carries that decision in, per board.
//
// The six generic subjects are shared by roughly 330 classes across every board, so they are never deleted or
// repurposed for one board (Telangana's Class 10 has separate Physical and Biological Science books and no
// Computer Science textbook, for example). A class's own list is shaped instead:
//   - createClassSubjectCore adds a brand-new board+grade-specific subject to one class;
//   - setClassSubjectEnabledCore hides (or shows again) one subject for one class only - the link row, nothing else.
//     Hidden subjects disappear from that class's students; the subject, its chapters and its materials are
//     untouched and every other class is unaffected.
import { z } from "zod";
import type { prisma } from "@/lib/prisma";

export type CurriculumDb = Pick<typeof prisma, "schoolClass" | "subject" | "schoolClassSubject" | "auditLog">;
export type CoreResult<T = void> = { ok: boolean; error?: string; data?: T };
export interface CurriculumActor {
  userId: string;
  mayWrite: (boardId: string) => boolean;
  deniedMessage: string;
}

const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(100)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only.");

export const addClassSubjectSchema = z.object({
  schoolClassId: z.string().min(1, "Class is required"),
  name: z.string().trim().min(2, "Subject name is required").max(100),
  slug: slugSchema,
});

export async function createClassSubjectCore(db: CurriculumDb, actor: CurriculumActor, input: unknown): Promise<CoreResult<{ subjectId: string }>> {
  const parsed = addClassSubjectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { schoolClassId, name, slug } = parsed.data;

  const schoolClass = await db.schoolClass.findUnique({ where: { id: schoolClassId } });
  if (!schoolClass) return { ok: false, error: "Class not found." };
  if (!actor.mayWrite(schoolClass.boardId)) return { ok: false, error: actor.deniedMessage };

  // A generic subject with this slug already exists: the right move is to make that one board-specific
  // (keeps the shared catalog free of near-duplicates), not to add a second subject of the same name.
  const generic = await db.subject.findFirst({ where: { slug, boardId: null } });
  if (generic) return { ok: false, error: `"${generic.name}" already exists as a shared subject - use "Make board-specific" on it instead.` };

  const grade = String(schoolClass.grade);
  const existing = await db.subject.findUnique({ where: { slug_boardId_grade: { slug, boardId: schoolClass.boardId, grade } } });
  const subject = existing ?? (await db.subject.create({ data: { name, slug, boardId: schoolClass.boardId, grade } }));
  await db.schoolClassSubject.upsert({
    where: { schoolClassId_subjectId: { schoolClassId, subjectId: subject.id } },
    update: { isEnabled: true },
    create: { schoolClassId, subjectId: subject.id },
  });
  await db.auditLog.create({
    data: {
      userId: actor.userId,
      action: "BOARD_CHANGE",
      resource: `Subject:${subject.id}`,
      message: `${existing ? "Linked existing" : "Created"} subject "${subject.name}" for class ${schoolClass.grade} (${schoolClass.id})`,
    },
  });
  return { ok: true, data: { subjectId: subject.id } };
}

export async function setClassSubjectEnabledCore(db: CurriculumDb, actor: CurriculumActor, schoolClassId: string, subjectId: string, enabled: boolean): Promise<CoreResult> {
  const link = await db.schoolClassSubject.findUnique({
    where: { schoolClassId_subjectId: { schoolClassId, subjectId } },
    include: { schoolClass: true, subject: true },
  });
  if (!link) return { ok: false, error: "This subject is not assigned to this class." };
  if (!actor.mayWrite(link.schoolClass.boardId)) return { ok: false, error: actor.deniedMessage };
  if (link.isEnabled === enabled) return { ok: true };

  await db.schoolClassSubject.update({ where: { id: link.id }, data: { isEnabled: enabled } });
  await db.auditLog.create({
    data: {
      userId: actor.userId,
      action: "BOARD_CHANGE",
      resource: `Subject:${subjectId}`,
      message: `${enabled ? "Showed" : "Hid"} "${link.subject.name}" for class ${link.schoolClass.grade} (${schoolClassId})`,
    },
  });
  return { ok: true };
}
