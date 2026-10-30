-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameZh" TEXT,
    "domain" TEXT NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "targetLevel" INTEGER NOT NULL DEFAULT 3,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Skill_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Skill" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillId" TEXT,
    "domain" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "quality" INTEGER,
    "aiScore" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Evidence_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reflection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "aiFeedback" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reflection_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slot" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "minutes" INTEGER NOT NULL DEFAULT 15,
    "skillId" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lang" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "frontAlt" TEXT,
    "back" TEXT NOT NULL,
    "note" TEXT,
    "example" TEXT,
    "examplePinyin" TEXT,
    "hint" TEXT,
    "group" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'recognize',
    "cardState" JSONB NOT NULL,
    "due" DATETIME NOT NULL,
    "stability" REAL NOT NULL DEFAULT 0,
    "difficulty" REAL NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "mood" INTEGER,
    "energy" INTEGER,
    "sleep" REAL,
    "focus" INTEGER,
    "note" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "goals" TEXT,
    "aiTone" TEXT NOT NULL DEFAULT 'direct',
    "learningLangs" TEXT NOT NULL DEFAULT 'zh,en',
    "zhLevel" TEXT NOT NULL DEFAULT 'zero',
    "enLevel" TEXT NOT NULL DEFAULT 'zero',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheRead" INTEGER NOT NULL DEFAULT 0,
    "cacheWrite" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" REAL NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "fallbackFrom" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InterviewProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "seniority" TEXT NOT NULL DEFAULT 'mid',
    "language" TEXT NOT NULL DEFAULT 'en',
    "questionKinds" TEXT NOT NULL DEFAULT 'concept,design',
    "focusSkills" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InterviewSession" (
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
    CONSTRAINT "InterviewSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "InterviewProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterviewSession_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InterviewTurn" (
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
    CONSTRAINT "InterviewTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestSession" (
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
    CONSTRAINT "TestSession_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestItem" (
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
    CONSTRAINT "TestItem_testId_fkey" FOREIGN KEY ("testId") REFERENCES "TestSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Evidence_skillId_idx" ON "Evidence"("skillId");

-- CreateIndex
CREATE INDEX "Evidence_activityId_idx" ON "Evidence"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "Reflection_activityId_key" ON "Reflection"("activityId");

-- CreateIndex
CREATE INDEX "PlanItem_date_idx" ON "PlanItem"("date");

-- CreateIndex
CREATE INDEX "Card_lang_due_idx" ON "Card"("lang", "due");

-- CreateIndex
CREATE INDEX "Review_cardId_idx" ON "Review"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyState_date_key" ON "DailyState"("date");

-- CreateIndex
CREATE INDEX "AiCall_createdAt_idx" ON "AiCall"("createdAt");

-- CreateIndex
CREATE INDEX "AiCall_provider_idx" ON "AiCall"("provider");

-- CreateIndex
CREATE INDEX "AiCall_feature_idx" ON "AiCall"("feature");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewSession_activityId_key" ON "InterviewSession"("activityId");

-- CreateIndex
CREATE INDEX "InterviewTurn_sessionId_idx" ON "InterviewTurn"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TestSession_activityId_key" ON "TestSession"("activityId");

-- CreateIndex
CREATE INDEX "TestItem_testId_idx" ON "TestItem"("testId");
