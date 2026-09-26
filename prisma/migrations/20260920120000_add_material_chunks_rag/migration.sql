-- AlterTable
ALTER TABLE "StudyMaterial" ADD COLUMN     "indexError" TEXT,
ADD COLUMN     "indexedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MaterialChunk" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "topicId" TEXT,
    "chunkIndex" INTEGER NOT NULL,
    "page" INTEGER,
    "text" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialChunk_schoolId_schoolClassId_subjectId_idx" ON "MaterialChunk"("schoolId", "schoolClassId", "subjectId");

-- CreateIndex
CREATE INDEX "MaterialChunk_materialId_idx" ON "MaterialChunk"("materialId");

-- AddForeignKey
ALTER TABLE "MaterialChunk" ADD CONSTRAINT "MaterialChunk_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "StudyMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

