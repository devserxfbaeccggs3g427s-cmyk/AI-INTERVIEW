/*
  Warnings:

  - Added the required column `updatedAt` to the `Reflection` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AiCall" ADD COLUMN "dataKinds" TEXT;
ALTER TABLE "AiCall" ADD COLUMN "dataPreview" TEXT;
ALTER TABLE "AiCall" ADD COLUMN "sourceId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Reflection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT,
    "prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "aiFeedback" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "classifiedDomain" TEXT,
    "classifiedSkillId" TEXT,
    "classificationConfidence" REAL,
    "draftUpdatedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reflection_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Reflection" ("activityId", "aiFeedback", "answer", "createdAt", "id", "prompt") SELECT "activityId", "aiFeedback", "answer", "createdAt", "id", "prompt" FROM "Reflection";
DROP TABLE "Reflection";
ALTER TABLE "new_Reflection" RENAME TO "Reflection";
CREATE UNIQUE INDEX "Reflection_activityId_key" ON "Reflection"("activityId");
CREATE INDEX "Reflection_status_createdAt_idx" ON "Reflection"("status", "createdAt");
CREATE INDEX "Reflection_classifiedDomain_idx" ON "Reflection"("classifiedDomain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
