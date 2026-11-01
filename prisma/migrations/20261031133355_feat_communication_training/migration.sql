-- CreateTable
CREATE TABLE "SpeakPrompt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'both',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "isUserMade" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SpeakAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "promptId" TEXT,
    "mode" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rubric" JSONB NOT NULL,
    "totalScore" REAL NOT NULL,
    "delta" JSONB,
    "speechMeta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpeakAttempt_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SpeakAttempt_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "SpeakPrompt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoleplayScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "hiddenGoal" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "level" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 60,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RoleplaySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "goalScore" INTEGER,
    "goalNote" TEXT,
    "transcript" JSONB NOT NULL DEFAULT [],
    "activityId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "RoleplaySession_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "RoleplayScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoleplaySession_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoleplayTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoleplayTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RoleplaySession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LanguagePractice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "corrected" TEXT,
    "errorGroups" JSONB NOT NULL,
    "keywords" JSONB NOT NULL DEFAULT [],
    "score" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LanguagePractice_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PracticeCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "practiceId" TEXT NOT NULL,
    "cardId" TEXT,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "note" TEXT,
    "example" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeCard_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "LanguagePractice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SpeakPrompt_code_key" ON "SpeakPrompt"("code");

-- CreateIndex
CREATE INDEX "SpeakPrompt_level_lang_mode_idx" ON "SpeakPrompt"("level", "lang", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "SpeakAttempt_activityId_key" ON "SpeakAttempt"("activityId");

-- CreateIndex
CREATE INDEX "SpeakAttempt_mode_createdAt_idx" ON "SpeakAttempt"("mode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoleplayScenario_code_key" ON "RoleplayScenario"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RoleplaySession_activityId_key" ON "RoleplaySession"("activityId");

-- CreateIndex
CREATE INDEX "RoleplaySession_status_startedAt_idx" ON "RoleplaySession"("status", "startedAt");

-- CreateIndex
CREATE INDEX "RoleplayTurn_sessionId_index_idx" ON "RoleplayTurn"("sessionId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "LanguagePractice_activityId_key" ON "LanguagePractice"("activityId");

-- CreateIndex
CREATE INDEX "PracticeCard_practiceId_idx" ON "PracticeCard"("practiceId");
