-- CreateTable
CREATE TABLE "WeeklyReviewRun" (
    "weekKey" TEXT NOT NULL PRIMARY KEY,
    "weekStart" DATETIME NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "slotCount" INTEGER NOT NULL DEFAULT 0,
    "reliefNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monthlyBudgetUsd" REAL,
    "emergencyMode" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_UserProfile" ("aiTone", "createdAt", "enLevel", "goals", "id", "learningLangs", "name", "zhLevel") SELECT "aiTone", "createdAt", "enLevel", "goals", "id", "learningLangs", "name", "zhLevel" FROM "UserProfile";
DROP TABLE "UserProfile";
ALTER TABLE "new_UserProfile" RENAME TO "UserProfile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
