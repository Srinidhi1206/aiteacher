/*
  School-level isolation for StudyMaterial.

  StudyMaterial.schoolId must be NOT NULL (a material always belongs to a
  school going forward), but this table already has existing rows, so a
  plain "ADD COLUMN ... NOT NULL" would fail. Handled safely in three steps:

  1. Add the column as nullable.
  2. Backfill every existing row's schoolId from its own recorded uploader
     (StudyMaterial.uploadedByUserId -> Admin.schoolId, or Teacher.schoolId
     if the uploader was a teacher). This is not a guess: it is the same
     authoritative source (the uploader's own school) that every future
     row will use going forward, applied retroactively to rows created
     before this column existed.
  3. Only after every row has a real value, enforce NOT NULL.

  If any row's uploader has no school (schoolId null on both Admin and
  Teacher), step 3 fails loudly and this migration aborts (Postgres runs
  DDL transactionally) rather than silently leaving/guessing an owner -
  see docs/DATABASE.md and the audit report for this stage for the exact
  row count this was verified against before writing this migration.
*/

-- AlterTable: add nullable first (existing rows can't have a value yet)
ALTER TABLE "StudyMaterial" ADD COLUMN "schoolId" TEXT;

-- Backfill: derive schoolId from the uploader's own school (Admin first,
-- then Teacher - a StudyMaterial's uploader is always exactly one of the
-- two, never both).
UPDATE "StudyMaterial" sm
SET "schoolId" = COALESCE(
  (SELECT a."schoolId" FROM "Admin" a WHERE a."userId" = sm."uploadedByUserId"),
  (SELECT t."schoolId" FROM "Teacher" t WHERE t."userId" = sm."uploadedByUserId")
)
WHERE sm."schoolId" IS NULL;

-- Now that every row has a real value, enforce the real constraint.
ALTER TABLE "StudyMaterial" ALTER COLUMN "schoolId" SET NOT NULL;

-- DropIndex
DROP INDEX "StudyMaterial_boardId_schoolClassId_subjectId_idx";

-- CreateIndex
CREATE INDEX "StudyMaterial_schoolId_boardId_schoolClassId_subjectId_idx" ON "StudyMaterial"("schoolId", "boardId", "schoolClassId", "subjectId");

-- AddForeignKey
ALTER TABLE "StudyMaterial" ADD CONSTRAINT "StudyMaterial_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
