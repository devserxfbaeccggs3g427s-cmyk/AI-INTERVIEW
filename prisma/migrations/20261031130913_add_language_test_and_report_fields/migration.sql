-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'srs',
    CONSTRAINT "Review_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Review" ("at", "cardId", "id", "rating", "state") SELECT "at", "cardId", "id", "rating", "state" FROM "Review";
DROP TABLE "Review";
ALTER TABLE "new_Review" RENAME TO "Review";
CREATE TABLE "new_TestItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "itemType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "audioText" TEXT,
    "options" JSONB,
    "answer" TEXT,
    "userAnswer" TEXT,
    "isCorrect" BOOLEAN,
    "cardId" TEXT,
    "skillName" TEXT,
    "errorGroups" JSONB,
    "notes" TEXT,
    "seconds" INTEGER,
    "explanation" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "rubric" JSONB,
    "scored" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TestItem_testId_fkey" FOREIGN KEY ("testId") REFERENCES "TestSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TestItem" ("answer", "audioText", "cardId", "errorGroups", "id", "index", "isCorrect", "itemType", "notes", "options", "prompt", "seconds", "skillName", "testId", "userAnswer") SELECT "answer", "audioText", "cardId", "errorGroups", "id", "index", "isCorrect", "itemType", "notes", "options", "prompt", "seconds", "skillName", "testId", "userAnswer" FROM "TestItem";
DROP TABLE "TestItem";
ALTER TABLE "new_TestItem" RENAME TO "TestItem";
CREATE UNIQUE INDEX "TestItem_testId_index_key" ON "TestItem"("testId", "index");
CREATE TABLE "new_TestSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lang" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "topic" TEXT,
    "level" TEXT,
    "score" REAL,
    "maxScore" REAL,
    "durationSec" INTEGER,
    "blueprint" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "formSignature" TEXT,
    "levelSource" TEXT NOT NULL DEFAULT 'local',
    "sourceText" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "standard" TEXT NOT NULL DEFAULT 'cefr',
    CONSTRAINT "TestSession_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestSession" ("activityId", "blueprint", "createdAt", "durationSec", "id", "lang", "level", "maxScore", "score", "testType", "topic") SELECT "activityId", "blueprint", "createdAt", "durationSec", "id", "lang", "level", "maxScore", "score", "testType", "topic" FROM "TestSession";
DROP TABLE "TestSession";
ALTER TABLE "new_TestSession" RENAME TO "TestSession";
CREATE UNIQUE INDEX "TestSession_activityId_key" ON "TestSession"("activityId");
CREATE INDEX "TestSession_lang_status_idx" ON "TestSession"("lang", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE INDEX "Evidence_createdAt_idx" ON "Evidence"("createdAt");

-- CreateIndex
CREATE INDEX "PlanItem_date_done_idx" ON "PlanItem"("date", "done");
