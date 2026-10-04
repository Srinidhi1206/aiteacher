"use server";

// Real Subject/Chapter/Topic CRUD for the Admin "Subjects & Curriculum"
// screen (Stage - curriculum architecture). Read-only curriculum lookups
// stay in lib/actions/curriculum.ts and are reused here, not duplicated.
//
// Design (see docs/STEP_3_5.md for the full audit this implements):
// Subject rows are either generic (boardId/grade = null - the 6
// CORE_SUBJECTS from prisma/seed.ts, shared by every class) or
// board+grade-specific (a fork of a generic subject, scoped to exactly one
// real SchoolClass's board+grade). Chapter/Topic always attach to a
// Subject - never directly to a SchoolClass - so a board-specific fork is
// what gives a single class its own chapters without affecting every
// other class still using the generic subject.
import { z } from "zod";
import { Prisma, BloomLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import { createClassSubjectCore, setClassSubjectEnabledCore } from "@/lib/curriculum/class-subjects";
import { requireAdminActor } from "./user-management";
import type { ActionResult } from "./materials";

// ---------------------------------------------------------------------------
// Who may write curriculum
//
// Curriculum (Subject / Chapter / Topic / class-subject links) is GLOBAL
// shared academic content: every school on a board teaches from the very same
// rows, and a SchoolClass is one row per board+grade shared by all schools.
// There is no per-school copy, so letting a school admin edit it means editing
// every other school's curriculum. Writes are therefore Super-Admin-only;
// school admins get read-only access (the lists they need for materials, exam
// schedules and students live in lib/actions/curriculum.ts and are unaffected).
// The decision is enforced here on the server, never by the UI.
// ---------------------------------------------------------------------------
type CurriculumActor = Awaited<ReturnType<typeof requireAdminActor>>;

const NOT_YOUR_BOARD = "Curriculum is shared by every school, so only the super administrator can change it.";

function mayWriteBoard(actor: CurriculumActor, _boardId: string | null): boolean {
  return actor.isSuperAdmin;
}

const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(100)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only.");

// ---------------------------------------------------------------------------
// Subject: fork a generic subject into a board+grade-specific variant.
// ---------------------------------------------------------------------------

const forkSubjectInputSchema = z.object({
  schoolClassId: z.string().min(1, "Class is required"),
  genericSubjectId: z.string().min(1, "Subject is required"),
});

/**
 * Creates (or reuses, if one already exists) a board+grade-specific copy of
 * a generic Subject, then atomically repoints the given class's
 * SchoolClassSubject link from the generic subject to the specific one.
 * `boardId`/`grade` are never taken from the client - both are derived from
 * the real SchoolClass row, so a forked subject can never end up scoped to
 * a board/grade that doesn't actually exist.
 */
export async function createBoardSpecificSubject(input: unknown): Promise<ActionResult<{ subjectId: string }>> {
  try {
    const actor = await requireAdminActor();
    const parsed = forkSubjectInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const { schoolClassId, genericSubjectId } = parsed.data;

    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: schoolClassId } });
    if (!schoolClass) return { ok: false, error: "Class not found." };
    if (!mayWriteBoard(actor, schoolClass.boardId)) return { ok: false, error: NOT_YOUR_BOARD };

    const generic = await prisma.subject.findUnique({ where: { id: genericSubjectId } });
    if (!generic) return { ok: false, error: "Subject not found." };
    if (generic.boardId !== null) {
      return { ok: false, error: "This subject is already board-specific - edit it directly instead of forking it again." };
    }

    const link = await prisma.schoolClassSubject.findUnique({
      where: { schoolClassId_subjectId: { schoolClassId, subjectId: genericSubjectId } },
    });
    if (!link) return { ok: false, error: "This subject is not currently assigned to this class." };

    const grade = String(schoolClass.grade);

    const result = await prisma.$transaction(async (tx) => {
      const existingVariant = await tx.subject.findUnique({
        where: { slug_boardId_grade: { slug: generic.slug, boardId: schoolClass.boardId, grade } },
      });
      const specific =
        existingVariant ??
        (await tx.subject.create({
          data: {
            name: generic.name,
            slug: generic.slug,
            boardId: schoolClass.boardId,
            grade,
            icon: generic.icon,
            colorToken: generic.colorToken,
          },
        }));

      await tx.schoolClassSubject.delete({
        where: { schoolClassId_subjectId: { schoolClassId, subjectId: genericSubjectId } },
      });
      await tx.schoolClassSubject.upsert({
        where: { schoolClassId_subjectId: { schoolClassId, subjectId: specific.id } },
        update: { isEnabled: true },
        create: { schoolClassId, subjectId: specific.id },
      });

      return specific;
    });

    await prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: "BOARD_CHANGE",
        resource: `Subject:${result.id}`,
        message: `Created board-specific "${result.name}" for class ${schoolClass.grade} (${schoolClass.id}), forked from generic subject ${genericSubjectId}`,
      },
    });

    return { ok: true, data: { subjectId: result.id } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Class subject set: add a subject that has no generic counterpart, and show/hide a subject for ONE class.
// The rules live in lib/curriculum/class-subjects.ts (testable against the real database); this file decides who
// may call - super administrator only, like every curriculum write.
// ---------------------------------------------------------------------------

export async function createClassSubject(input: unknown): Promise<ActionResult<{ subjectId: string }>> {
  try {
    const actor = await requireAdminActor();
    const who = { userId: actor.userId, mayWrite: (boardId: string) => mayWriteBoard(actor, boardId), deniedMessage: NOT_YOUR_BOARD };
    return await prisma.$transaction((tx) => createClassSubjectCore(tx, who, input));
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function setClassSubjectEnabled(schoolClassId: string, subjectId: string, enabled: boolean): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const who = { userId: actor.userId, mayWrite: (boardId: string) => mayWriteBoard(actor, boardId), deniedMessage: NOT_YOUR_BOARD };
    return await setClassSubjectEnabledCore(prisma, who, schoolClassId, subjectId, enabled);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

const subjectVariantUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  icon: z.string().trim().max(50).optional(),
  colorToken: z.string().trim().max(50).optional(),
});

/** Editing is restricted to board-specific variants - the shared generic subjects are never renamed from here. */
export async function updateSubjectVariant(subjectId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) return { ok: false, error: "Subject not found." };
    if (subject.boardId === null) return { ok: false, error: "The shared generic subject can't be edited here." };
    if (!mayWriteBoard(actor, subject.boardId)) return { ok: false, error: NOT_YOUR_BOARD };
    const parsed = subjectVariantUpdateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await prisma.subject.update({ where: { id: subjectId }, data: parsed.data });
    await prisma.auditLog.create({
      data: { userId: actor.userId, action: "BOARD_CHANGE", resource: `Subject:${subjectId}`, message: `Updated subject "${parsed.data.name}"` },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Chapter CRUD - always scoped to a Subject.
// ---------------------------------------------------------------------------

const chapterInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
});

export async function createChapter(subjectId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireAdminActor();
    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) return { ok: false, error: "Subject not found." };
    if (!mayWriteBoard(actor, subject.boardId)) return { ok: false, error: NOT_YOUR_BOARD };
    const parsed = chapterInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

    const existing = await prisma.chapter.findUnique({ where: { subjectId_slug: { subjectId, slug: parsed.data.slug } } });
    if (existing) return { ok: false, error: "A chapter with this slug already exists in this subject." };

    const count = await prisma.chapter.count({ where: { subjectId } });
    const chapter = await prisma.chapter.create({
      data: { subjectId, name: parsed.data.name, slug: parsed.data.slug, order: count },
    });
    await prisma.auditLog.create({
      data: { userId: actor.userId, action: "BOARD_CHANGE", resource: `Chapter:${chapter.id}`, message: `Created chapter "${chapter.name}"` },
    });
    return { ok: true, data: { id: chapter.id } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function updateChapter(chapterId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, include: { subject: { select: { boardId: true } } } });
    if (!chapter) return { ok: false, error: "Chapter not found." };
    if (!mayWriteBoard(actor, chapter.subject.boardId)) return { ok: false, error: NOT_YOUR_BOARD };
    const parsed = chapterInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

    if (parsed.data.slug !== chapter.slug) {
      const clash = await prisma.chapter.findUnique({
        where: { subjectId_slug: { subjectId: chapter.subjectId, slug: parsed.data.slug } },
      });
      if (clash) return { ok: false, error: "A chapter with this slug already exists in this subject." };
    }

    await prisma.chapter.update({ where: { id: chapterId }, data: { name: parsed.data.name, slug: parsed.data.slug } });
    await prisma.auditLog.create({
      data: { userId: actor.userId, action: "BOARD_CHANGE", resource: `Chapter:${chapterId}`, message: `Updated chapter "${parsed.data.name}"` },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function deleteChapter(chapterId: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, include: { subject: { select: { boardId: true } } } });
    if (!chapter) return { ok: false, error: "Chapter not found." };
    if (!mayWriteBoard(actor, chapter.subject.boardId)) return { ok: false, error: NOT_YOUR_BOARD };
    try {
      await prisma.chapter.delete({ where: { id: chapterId } });
    } catch (e) {
      // StudyMaterial.chapter is onDelete: Restrict - Postgres refuses the
      // delete while any material still references this chapter.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        return { ok: false, error: "This chapter has study materials attached and can't be deleted. Remove or reassign them first." };
      }
      throw e;
    }
    await prisma.auditLog.create({
      data: { userId: actor.userId, action: "BOARD_CHANGE", resource: `Chapter:${chapterId}`, message: `Deleted chapter "${chapter.name}"` },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Same ownership-then-reorder pattern as lib/actions/exams.ts's reorderExamQuestions. */
export async function reorderChapters(subjectId: string, orderedChapterIds: string[]): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { boardId: true } });
    if (!subject) return { ok: false, error: "Subject not found." };
    if (!mayWriteBoard(actor, subject.boardId)) return { ok: false, error: NOT_YOUR_BOARD };
    const owned = await prisma.chapter.findMany({ where: { subjectId }, select: { id: true } });
    const ownedIds = new Set(owned.map((c) => c.id));
    if (orderedChapterIds.length !== ownedIds.size || orderedChapterIds.some((id) => !ownedIds.has(id))) {
      return { ok: false, error: "Chapter list does not match this subject's chapters." };
    }
    await prisma.$transaction(
      orderedChapterIds.map((id, index) => prisma.chapter.update({ where: { id, subjectId }, data: { order: index } }))
    );
    await prisma.auditLog.create({
      data: { userId: actor.userId, action: "BOARD_CHANGE", resource: `Subject:${subjectId}`, message: "Reordered chapters" },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Topic CRUD - always scoped to a Chapter.
// ---------------------------------------------------------------------------

const topicInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  bloomLevel: z.nativeEnum(BloomLevel),
});

export async function createTopic(chapterId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireAdminActor();
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, include: { subject: { select: { boardId: true } } } });
    if (!chapter) return { ok: false, error: "Chapter not found." };
    if (!mayWriteBoard(actor, chapter.subject.boardId)) return { ok: false, error: NOT_YOUR_BOARD };
    const parsed = topicInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

    const existing = await prisma.topic.findUnique({ where: { chapterId_slug: { chapterId, slug: parsed.data.slug } } });
    if (existing) return { ok: false, error: "A topic with this slug already exists in this chapter." };

    const count = await prisma.topic.count({ where: { chapterId } });
    const topic = await prisma.topic.create({
      data: { chapterId, name: parsed.data.name, slug: parsed.data.slug, bloomLevel: parsed.data.bloomLevel, order: count },
    });
    await prisma.auditLog.create({
      data: { userId: actor.userId, action: "BOARD_CHANGE", resource: `Topic:${topic.id}`, message: `Created topic "${topic.name}"` },
    });
    return { ok: true, data: { id: topic.id } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function updateTopic(topicId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const topic = await prisma.topic.findUnique({ where: { id: topicId }, include: { chapter: { select: { subject: { select: { boardId: true } } } } } });
    if (!topic) return { ok: false, error: "Topic not found." };
    if (!mayWriteBoard(actor, topic.chapter.subject.boardId)) return { ok: false, error: NOT_YOUR_BOARD };
    const parsed = topicInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

    if (parsed.data.slug !== topic.slug) {
      const clash = await prisma.topic.findUnique({ where: { chapterId_slug: { chapterId: topic.chapterId, slug: parsed.data.slug } } });
      if (clash) return { ok: false, error: "A topic with this slug already exists in this chapter." };
    }

    await prisma.topic.update({
      where: { id: topicId },
      data: { name: parsed.data.name, slug: parsed.data.slug, bloomLevel: parsed.data.bloomLevel },
    });
    await prisma.auditLog.create({
      data: { userId: actor.userId, action: "BOARD_CHANGE", resource: `Topic:${topicId}`, message: `Updated topic "${parsed.data.name}"` },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Guarded delete: StudentTopicProgress/WeaknessProfile/StrengthProfile all
 * cascade-delete on Topic at the database level (unlike Chapter, which
 * Postgres itself Restricts via StudyMaterial). Nothing here stops a
 * careless raw SQL delete, but every path through this app goes through
 * this action, and it never issues the delete at all once real student
 * learning history exists for the topic.
 */
export async function deleteTopic(topicId: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const topic = await prisma.topic.findUnique({ where: { id: topicId }, include: { chapter: { select: { subject: { select: { boardId: true } } } } } });
    if (!topic) return { ok: false, error: "Topic not found." };
    if (!mayWriteBoard(actor, topic.chapter.subject.boardId)) return { ok: false, error: NOT_YOUR_BOARD };

    const [progressCount, weaknessCount, strengthCount] = await Promise.all([
      prisma.studentTopicProgress.count({ where: { topicId } }),
      prisma.weaknessProfile.count({ where: { topicId } }),
      prisma.strengthProfile.count({ where: { topicId } }),
    ]);
    if (progressCount > 0 || weaknessCount > 0 || strengthCount > 0) {
      return {
        ok: false,
        error: "This topic has real student learning history (progress, weak-area, or strength data) and can't be deleted.",
      };
    }

    await prisma.topic.delete({ where: { id: topicId } });
    await prisma.auditLog.create({
      data: { userId: actor.userId, action: "BOARD_CHANGE", resource: `Topic:${topicId}`, message: `Deleted topic "${topic.name}"` },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function reorderTopics(chapterId: string, orderedTopicIds: string[]): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, include: { subject: { select: { boardId: true } } } });
    if (!chapter) return { ok: false, error: "Chapter not found." };
    if (!mayWriteBoard(actor, chapter.subject.boardId)) return { ok: false, error: NOT_YOUR_BOARD };
    const owned = await prisma.topic.findMany({ where: { chapterId }, select: { id: true } });
    const ownedIds = new Set(owned.map((t) => t.id));
    if (orderedTopicIds.length !== ownedIds.size || orderedTopicIds.some((id) => !ownedIds.has(id))) {
      return { ok: false, error: "Topic list does not match this chapter's topics." };
    }
    await prisma.$transaction(
      orderedTopicIds.map((id, index) => prisma.topic.update({ where: { id, chapterId }, data: { order: index } }))
    );
    await prisma.auditLog.create({
      data: { userId: actor.userId, action: "BOARD_CHANGE", resource: `Chapter:${chapterId}`, message: "Reordered topics" },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Bulk curriculum import - for populating a single board-specific subject's
// full chapter/topic tree from an already-approved, source-grounded
// extraction (e.g. an official textbook's table of contents) in one
// authenticated call, instead of one browser round trip per chapter/topic.
// Every chapter/topic still goes through the exact same compound-unique-key
// lookup (subjectId+slug, chapterId+slug) that createChapter/createTopic
// use, just batched: existing rows are matched and reused (name/order/
// bloomLevel re-affirmed, never duplicated), missing rows are created. Order
// is always taken from the row's position in the input array, not from
// creation-time sequence, so a partially-imported subject (e.g. one chapter
// already added by hand) still ends up in the exact right order once the
// rest is imported.
// ---------------------------------------------------------------------------

const bulkTopicSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  bloomLevel: z.nativeEnum(BloomLevel),
});

const bulkChapterSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  // May be empty: a textbook whose contents page lists chapters but no topics is imported as chapters only, never padded.
  topics: z.array(bulkTopicSchema),
});

const bulkImportInputSchema = z.object({
  subjectId: z.string().min(1),
  chapters: z.array(bulkChapterSchema).min(1),
});

export async function bulkImportCurriculum(input: unknown): Promise<
  ActionResult<{ chaptersCreated: number; chaptersReused: number; topicsCreated: number; topicsReused: number }>
> {
  try {
    const actor = await requireAdminActor();
    const parsed = bulkImportInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const { subjectId, chapters } = parsed.data;

    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) return { ok: false, error: "Subject not found." };
    if (subject.boardId === null) {
      return { ok: false, error: "Bulk import can only target a board-specific subject, never the shared generic subject." };
    }
    if (!mayWriteBoard(actor, subject.boardId)) return { ok: false, error: NOT_YOUR_BOARD };

    let chaptersCreated = 0;
    let chaptersReused = 0;
    let topicsCreated = 0;
    let topicsReused = 0;

    for (let ci = 0; ci < chapters.length; ci++) {
      const ch = chapters[ci];
      // One transaction per chapter (chapter + all its topics) - safer than
      // one giant transaction across all 15 chapters: a problem partway
      // through still leaves every already-imported chapter safely
      // committed, and re-running only has to redo the one that failed.
      await prisma.$transaction(
        async (tx) => {
          const existingChapter = await tx.chapter.findUnique({ where: { subjectId_slug: { subjectId, slug: ch.slug } } });
          const chapter = existingChapter
            ? await tx.chapter.update({ where: { id: existingChapter.id }, data: { name: ch.name, order: ci } })
            : await tx.chapter.create({ data: { subjectId, name: ch.name, slug: ch.slug, order: ci } });
          if (existingChapter) chaptersReused++;
          else chaptersCreated++;

          for (let ti = 0; ti < ch.topics.length; ti++) {
            const t = ch.topics[ti];
            const existingTopic = await tx.topic.findUnique({ where: { chapterId_slug: { chapterId: chapter.id, slug: t.slug } } });
            if (existingTopic) {
              await tx.topic.update({ where: { id: existingTopic.id }, data: { name: t.name, bloomLevel: t.bloomLevel, order: ti } });
              topicsReused++;
            } else {
              await tx.topic.create({ data: { chapterId: chapter.id, name: t.name, slug: t.slug, bloomLevel: t.bloomLevel, order: ti } });
              topicsCreated++;
            }
          }
        },
        { timeout: 30000 },
      );
    }

    await prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: "BOARD_CHANGE",
        resource: `Subject:${subjectId}`,
        message: `Bulk curriculum import: ${chaptersCreated} chapters created, ${chaptersReused} reused, ${topicsCreated} topics created, ${topicsReused} reused`,
      },
    });

    return { ok: true, data: { chaptersCreated, chaptersReused, topicsCreated, topicsReused } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
