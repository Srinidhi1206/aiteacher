# Study Plan: ticks and chapter revision

How a tick on the Study Plan is read, and how a chapter the student has ticked is planned again for revision. The code is in `lib/analytics/exam-plan.ts`
(the planner, pure) and `lib/analytics/learning-path-core.ts` (saving and regenerating). Tests: `tests/chapter-revision.test.ts`.

## What a tick is

A tick is the student's **own record**. Nothing checks it. It says nothing about mastery - that comes from exams and practice. The Study Plan page and the
dashboard call it "marked done by you" (`lib/study-plan/wording.ts`).

A plan item stores `completed` (true/false), the day it was planned for, and its title. It does **not** store when it was ticked, and it has no link to a
chapter row: the **title is the item's whole identity**. So:

- The plan cannot know *when* a chapter was finished. It only knows the chapter is ticked as of the moment the plan is generated. It never claims
  otherwise; the page says "the next time you generate your plan".
- The Heatmap on the Performance page does not count ticks (it would credit them to the day they were planned for, not the day they were ticked).

## Chapter revision

A chapter that is ticked gets **one** revision task, titled `Revise chapter: <chapter>` (general plan) or `Revise chapter: <chapter> · for <exam>` (exam plan).
This is separate from the subject-level `Revise: <subject> · for <exam>` tasks, which are unchanged.

A chapter counts as done for an exam when either title is ticked:

| Ticked title | Where it came from |
|---|---|
| `Study: <chapter> · for <exam>` | the exam's own plan |
| `Study: <chapter>` | the general plan, made before any exam was published |

The ticked row is kept exactly as it is (same row, same day). The chapter is **not studied again** for the exam; it gets its revision task instead. A tick
made for a *different* exam says nothing about this one. A revision task ticked in the general plan does not stand in for the exam's revision: the exam still
gets its one task.

### Where it is placed

- Exam plan: first on the revision days that still have room (earliest first), then on the study days nearest the exam (latest first).
- General plan: on the existing revision days (every 4th day, except mock-test days).
- Never above a day's limit (3 on a revision-only day, 2 on a study day), counting what is already there (done or kept tasks).
- Never on or after the exam day. Never on today, unless today is the only day left before the exam and has room.
- What does not fit is said in the plan's notes ("could not get a revision day before it" / "waiting for a revision day"), never dropped silently.

### Same-day regeneration

Because there is no completion time, the rule is relative to the moment the plan is generated: a chapter ticked today is revised on a **later** day. Generating
again the same day gives the same days again and adds nothing, because a task is identified by its title and one that is already planned (or done) is not
planned twice.

### Regeneration

Regenerating keeps every completed task and every task dated before today, and replaces only unfinished tasks dated today or later.

- A revision task that was **missed** (its day passed, not done) stays as history, unchanged. Its title is not "done", so one fresh revision task is planned for a
  later day. There is always at most one unfinished revision task per chapter; repeated regenerations do not pile them up.
- If the student later ticks the missed one, it counts as done: the unfinished one is removed and no more are planned.
- If the student un-ticks the chapter, its unfinished revision task is removed on the next regeneration and the chapter is to be studied again.
- Another student's ticks are never read: the plan is looked up by the student's own id.

### Known limits

- A plan made before a chapter was ticked is reported as out of date ("it does not include revision for the chapters you have marked done yet") until it is
  regenerated. Nothing changes by itself.
- Each plan says nothing about *how well* a chapter was learned; priority is HIGH for a chapter with a weak topic or within 7 days of the exam.
