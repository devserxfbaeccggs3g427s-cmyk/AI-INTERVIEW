-- CreateTable
CREATE TABLE "FocusTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "skillId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FocusTarget_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FocusTarget_date_key" ON "FocusTarget"("date");

-- CreateIndex
CREATE INDEX "FocusTarget_skillId_idx" ON "FocusTarget"("skillId");

-- CreateIndex
CREATE INDEX "PlanItem_skillId_idx" ON "PlanItem"("skillId");
