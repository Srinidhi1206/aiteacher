-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "boardId" TEXT;

-- CreateIndex
CREATE INDEX "Admin_schoolId_idx" ON "Admin"("schoolId");

-- CreateIndex
CREATE INDEX "School_boardId_idx" ON "School"("boardId");

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
