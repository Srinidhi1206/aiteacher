-- CreateEnum
CREATE TYPE "AcademicEventType" AS ENUM ('EXAM', 'HOLIDAY', 'RESULT', 'MEETING', 'EVENT', 'DEADLINE', 'TERM', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MaterialType" ADD VALUE 'STUDY_MATERIAL';
ALTER TYPE "MaterialType" ADD VALUE 'QUESTION_PAPER';

-- AlterTable
ALTER TABLE "StudyMaterial" ALTER COLUMN "schoolId" DROP NOT NULL,
ALTER COLUMN "chapterId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MaterialChunk" ALTER COLUMN "schoolId" DROP NOT NULL,
ALTER COLUMN "chapterId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AcademicEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "AcademicEventType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "description" TEXT,
    "academicYear" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "schoolId" TEXT,
    "boardId" TEXT,
    "schoolClassId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicEvent_boardId_schoolClassId_startDate_idx" ON "AcademicEvent"("boardId", "schoolClassId", "startDate");

-- CreateIndex
CREATE INDEX "AcademicEvent_schoolId_startDate_idx" ON "AcademicEvent"("schoolId", "startDate");

-- AddForeignKey
ALTER TABLE "AcademicEvent" ADD CONSTRAINT "AcademicEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicEvent" ADD CONSTRAINT "AcademicEvent_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicEvent" ADD CONSTRAINT "AcademicEvent_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicEvent" ADD CONSTRAINT "AcademicEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

