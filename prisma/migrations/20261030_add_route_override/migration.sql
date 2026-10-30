-- Migration 17.10 — thêm bảng RouteOverride lưu model local do người dùng chọn.

CREATE TABLE "RouteOverride" (
    "task" TEXT NOT NULL PRIMARY KEY,
    "model" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
