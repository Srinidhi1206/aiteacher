// One in-memory "database" for the end-to-end personalised-learning tests: the same object serves the calendar import, publishing, the exam lookup and the study-plan
// generator, so the stages can be tested AGAINST EACH OTHER (an event saved by the importer is what the student lookup and the plan generator later read).
// It evaluates the real scope rules (via fake-where) instead of re-implementing them. Nothing here touches a real database, the network or any AI.
import { matches } from "./fake-where";

export interface EventRow {
  id: string;
  title: string;
  type: string;
  startDate: Date;
  endDate: Date | null;
  description: string | null;
  academicYear: string | null;
  isPublished: boolean;
  schoolId: string | null;
  boardId: string | null;
  schoolClassId: string | null;
  createdByUserId: string | null;
}
export interface PlanItemRow {
  id: string;
  studyPlanId: string;
  day: number;
  date: Date;
  kind: string;
  subject: string;
  title: string;
  durationMinutes: number;
  priority: string;
  completed: boolean;
}
export interface PlanRow {
  id: string;
  studentId: string;
  createdAt: Date;
  items: PlanItemRow[];
}
export interface StudentRow {
  id: string;
  schoolId: string | null;
  boardId: string | null;
  schoolClassId: string | null;
}
export interface SubjectRow {
  id: string;
  name: string;
  // _count / studyMaterials are what the real query also returns for each chapter (lesson count; a textbook filed here); optional so older tests need not state them.
  chapters: { id: string; name: string; _count?: { topics: number }; studyMaterials?: { id: string }[] }[];
}
export interface WeakRow {
  mastery: number;
  topic: { name: string; chapter: { name: string; subject: { id: string; name: string } } };
}

export const SCHOOLS: Record<string, { id: string; name: string; boardId: string | null }> = {
  demo: { id: "demo", name: "TeachAI Demo School", boardId: "bse" },
  other: { id: "other", name: "Other School", boardId: "bse" },
};
export const BOARDS: Record<string, { id: string; shortName: string }> = { bse: { id: "bse", shortName: "BSE Telangana" } };
export const CLASSES: Record<string, { id: string; boardId: string; label: string }> = {
  c10: { id: "c10", boardId: "bse", label: "Class 10" },
  c9: { id: "c9", boardId: "bse", label: "Class 9" },
};

export function makeWorld(opts: { clock: Date }) {
  const w = {
    clock: opts.clock,
    events: [] as EventRow[],
    audit: [] as { userId?: string; resource?: string; message: string }[],
    schedules: [] as Record<string, unknown>[],
    plans: [] as PlanRow[],
    students: {} as Record<string, StudentRow>,
    classSubjects: {} as Record<string, SubjectRow[]>,
    weak: {} as Record<string, WeakRow[]>,
    failAcademicReads: false,
    calls: { planCreates: 0, planItemDeletes: 0, planItemCreates: 0, eventUpdates: 0, eventCreates: 0 },
    db: undefined as unknown,
  };
  let seq = 0;
  const planOf = (studentId: string) => w.plans.filter((p) => p.studentId === studentId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

  w.db = {
    student: { findUnique: async ({ where }: { where: { id: string } }) => w.students[where.id] ?? null },
    school: { findUnique: async ({ where }: { where: { id: string } }) => SCHOOLS[where.id] ?? null },
    board: { findUnique: async ({ where }: { where: { id: string } }) => BOARDS[where.id] ?? null },
    schoolClass: { findUnique: async ({ where }: { where: { id: string } }) => CLASSES[where.id] ?? null },
    auditLog: { create: async ({ data }: { data: { userId?: string; resource?: string; message: string } }) => void w.audit.push(data) },
    schoolClassSubject: {
      findMany: async ({ where }: { where: { schoolClassId: string } }) => (w.classSubjects[where.schoolClassId] ?? []).map((subject) => ({ isEnabled: true, subject })),
    },
    weaknessProfile: { findMany: async ({ where }: { where: { studentId: string } }) => w.weak[where.studentId] ?? [] },
    examSchedule: { findMany: async ({ where }: { where: unknown }) => w.schedules.filter((s) => matches(s as never, where)) },
    academicEvent: {
      findMany: async ({ where }: { where: unknown }) => {
        if (w.failAcademicReads) throw new Error("simulated database failure");
        return w.events.filter((e) => matches(e as never, where));
      },
      findUnique: async ({ where }: { where: { id: string } }) => w.events.find((e) => e.id === where.id) ?? null,
      createMany: async ({ data }: { data: Omit<EventRow, "id">[] }) => {
        w.calls.eventCreates += data.length;
        for (const d of data) w.events.push({ ...d, id: `ev-${++seq}` } as EventRow);
        return { count: data.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<EventRow> }) => {
        w.calls.eventUpdates++;
        const e = w.events.find((x) => x.id === where.id)!;
        Object.assign(e, data);
        return e;
      },
      updateMany: async ({ where, data }: { where: unknown; data: Partial<EventRow> }) => {
        const hit = w.events.filter((e) => matches(e as never, where));
        for (const e of hit) Object.assign(e, data);
        w.calls.eventUpdates += hit.length;
        return { count: hit.length };
      },
    },
    studyPlan: {
      findFirst: async ({ where }: { where: { studentId: string } }) => planOf(where.studentId),
      create: async ({ data }: { data: { studentId: string } }) => {
        w.calls.planCreates++;
        const p: PlanRow = { id: `plan-${++seq}`, studentId: data.studentId, createdAt: new Date(w.clock), items: [] };
        w.plans.push(p);
        return p;
      },
    },
    studyPlanItem: {
      deleteMany: async ({ where }: { where: { studyPlanId: string } }) => {
        const plan = w.plans.find((p) => p.id === where.studyPlanId)!;
        const before = plan.items.length;
        plan.items = plan.items.filter((i) => !matches(i as never, where));
        w.calls.planItemDeletes += before - plan.items.length;
        return { count: before - plan.items.length };
      },
      createMany: async ({ data }: { data: Omit<PlanItemRow, "id" | "completed">[] }) => {
        for (const d of data) {
          const plan = w.plans.find((p) => p.id === d.studyPlanId)!;
          plan.items.push({ ...d, id: `item-${++seq}`, completed: false });
        }
        w.calls.planItemCreates += data.length;
        return { count: data.length };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return Object.assign(w, {
    planOf,
    futureItems: (studentId: string, from: Date) => (planOf(studentId)?.items ?? []).filter((i) => i.date >= from).sort((a, b) => a.date.getTime() - b.date.getTime()),
  });
}
export type World = ReturnType<typeof makeWorld>;
