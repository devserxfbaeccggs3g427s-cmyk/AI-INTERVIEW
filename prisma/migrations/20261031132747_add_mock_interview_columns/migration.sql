-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InterviewProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "seniority" TEXT NOT NULL DEFAULT 'mid',
    "language" TEXT NOT NULL DEFAULT 'en',
    "questionKinds" TEXT NOT NULL DEFAULT 'concept,design',
    "focusSkills" TEXT NOT NULL DEFAULT '[]',
    "answerMode" TEXT NOT NULL DEFAULT 'text',
    "englishClarity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_InterviewProfile" ("createdAt", "focusSkills", "id", "jobTitle", "label", "language", "questionKinds", "seniority") SELECT "createdAt", "focusSkills", "id", "jobTitle", "label", "language", "questionKinds", "seniority" FROM "InterviewProfile";
DROP TABLE "InterviewProfile";
ALTER TABLE "new_InterviewProfile" RENAME TO "InterviewProfile";
CREATE TABLE "new_InterviewSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "plannedCount" INTEGER NOT NULL DEFAULT 8,
    "askedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "totalScore" REAL,
    "skillsFocused" TEXT NOT NULL DEFAULT '[]',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "activityId" TEXT,
    "report" JSONB,
    "questionKinds" TEXT NOT NULL DEFAULT 'concept,design',
    "answerMode" TEXT NOT NULL DEFAULT 'text',
    "englishClarity" BOOLEAN NOT NULL DEFAULT false,
    "adaptive" BOOLEAN NOT NULL DEFAULT true,
    "sessionType" TEXT NOT NULL DEFAULT 'interview_loop',
    "focusHint" TEXT,
    CONSTRAINT "InterviewSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "InterviewProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterviewSession_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InterviewSession" ("activityId", "askedCount", "endedAt", "id", "plannedCount", "profileId", "skillsFocused", "startedAt", "status", "totalScore") SELECT "activityId", "askedCount", "endedAt", "id", "plannedCount", "profileId", "skillsFocused", "startedAt", "status", "totalScore" FROM "InterviewSession";
DROP TABLE "InterviewSession";
ALTER TABLE "new_InterviewSession" RENAME TO "InterviewSession";
CREATE UNIQUE INDEX "InterviewSession_activityId_key" ON "InterviewSession"("activityId");
CREATE INDEX "InterviewSession_profileId_status_startedAt_idx" ON "InterviewSession"("profileId", "status", "startedAt");
CREATE TABLE "new_InterviewTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "skillName" TEXT,
    "answer" TEXT,
    "scores" JSONB,
    "total" REAL,
    "feedback" TEXT,
    "nextQuestion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "skillId" TEXT,
    "behavioralScores" JSONB,
    "clarityScore" REAL,
    "nextKind" TEXT,
    "nextSkillId" TEXT,
    "isFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "adaptiveReason" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    CONSTRAINT "InterviewTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_InterviewTurn" ("answer", "createdAt", "feedback", "id", "index", "kind", "nextQuestion", "question", "scores", "sessionId", "skillName", "total") SELECT "answer", "createdAt", "feedback", "id", "index", "kind", "nextQuestion", "question", "scores", "sessionId", "skillName", "total" FROM "InterviewTurn";
DROP TABLE "InterviewTurn";
ALTER TABLE "new_InterviewTurn" RENAME TO "InterviewTurn";
CREATE INDEX "InterviewTurn_sessionId_index_idx" ON "InterviewTurn"("sessionId", "index");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
