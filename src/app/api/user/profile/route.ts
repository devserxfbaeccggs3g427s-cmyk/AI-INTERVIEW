/**
 * `GET /api/user/profile` — lấy hồ sơ người dùng.
 *
 * Placeholder cho Phase 1 — S15 Settings.
 *
 * Xem tasks.md 14.2 · design.md §4.16.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      name: "Người dùng",
      email: "user@example.com",
      avatar: null,
      settings: {
        theme: "system",
        language: "vi",
        notifications: true,
      },
    },
  });
}