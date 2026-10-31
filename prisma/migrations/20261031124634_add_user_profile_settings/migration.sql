-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "goals" TEXT,
    "aiTone" TEXT NOT NULL DEFAULT 'direct',
    "learningLangs" TEXT NOT NULL DEFAULT 'zh,en',
    "zhLevel" TEXT NOT NULL DEFAULT 'zero',
    "enLevel" TEXT NOT NULL DEFAULT 'zero',
    "viLevel" TEXT NOT NULL DEFAULT 'B2',
    "languageStandard" TEXT NOT NULL DEFAULT 'cefr',
    "interviewLang" TEXT NOT NULL DEFAULT 'en',
    "monthlyBudgetUsd" REAL NOT NULL DEFAULT 15,
    "saverMode" BOOLEAN NOT NULL DEFAULT false,
    "focusSkillId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_UserProfile" ("aiTone", "createdAt", "enLevel", "focusSkillId", "goals", "id", "learningLangs", "name", "zhLevel") SELECT "aiTone", "createdAt", "enLevel", "focusSkillId", "goals", "id", "learningLangs", "name", "zhLevel" FROM "UserProfile";
DROP TABLE "UserProfile";
ALTER TABLE "new_UserProfile" RENAME TO "UserProfile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
