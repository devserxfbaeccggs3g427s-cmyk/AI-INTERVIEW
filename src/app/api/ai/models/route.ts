/**
 * `GET /api/ai/models` — trạng thái Ollama + danh sách model local (FR-AI-12).
 *
 * S15 dùng route này để hiển thị:
 *   - badge trạng thái "Offline / Local (Ollama)" hay "Cloud (Anthropic)",
 *   - danh sách model local đã cài để người dùng biết cần `ollama pull` gì.
 *
 * Route handler **mỏng**: nhận request → gọi `listLocalModels()` → trả JSON.
 * Lỗi → `{available:false, models:[]}` chứ không phải 500 (AC-8).
 *
 * Xem tasks.md 2.10 · design.md §6.4 / §6.9.
 */

import { NextResponse } from "next/server";

import { listLocalModels } from "@/lib/ai/ollama";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const result = await listLocalModels();
    return NextResponse.json({
      available: result.available,
      models: result.models.map((m) => ({ name: m.name, size: m.size })),
      baseUrl: result.baseUrl,
    });
  } catch {
    // Không bao giờ 500 — client cần biết "Ollama chưa chạy" để hiện hướng dẫn.
    return NextResponse.json({
      available: false,
      models: [],
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    });
  }
}
