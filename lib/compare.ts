import { queryOne } from "./db";
import { safeParseStoredReport } from "./zod-schemas";

export type CompareSummary = {
  id: string;
  role: string;
  created_at: number;
  ended_at: number | null;
  provider: string;
  model: string;
  planned_rounds: number;
  answered_turns: number;
  overall_score: number;
  pillars: { content: number; relevance: number; clarity: number; depth: number };
};

type CompareResult =
  | { ok: true; a: CompareSummary; b: CompareSummary; warnings: string[] }
  | { ok: false; status: number; error: string };

type CompareRow = {
  id: string;
  role: string;
  status: string;
  created_at: number;
  ended_at: number | null;
  provider: string;
  model: string;
  planned_rounds: number;
  report_json: string | null;
  answered_turns: number;
};

/** Match role labels without treating case or repeated whitespace as a different role. */
export function normalizeCompareRole(role: string): string {
  return role.trim().replace(/\s+/gu, " ").toLowerCase();
}

function loadSummary(id: string, side: "A" | "B"): CompareSummary | { ok: false; status: number; error: string } {
  const row = queryOne<CompareRow>(
    `SELECT s.id, s.role, s.status, s.created_at, s.ended_at, s.provider, s.model, s.planned_rounds,
            e.report_json,
            (SELECT COUNT(*) FROM message_turns m WHERE m.session_id = s.id AND m.role = 'user') AS answered_turns
       FROM sessions s LEFT JOIN evaluations e ON e.session_id = s.id WHERE s.id = ?`,
    [id],
  );
  if (!row) return { ok: false, status: 404, error: `Không tìm thấy phiên ${side}.` };
  if (row.status !== "completed") return { ok: false, status: 409, error: `Phiên ${side} chưa hoàn tất.` };
  if (row.report_json === null) return { ok: false, status: 409, error: `Phiên ${side} chưa có báo cáo.` };
  const report = safeParseStoredReport(row.report_json);
  if (!report) return { ok: false, status: 422, error: `Báo cáo phiên ${side} không hợp lệ.` };

  return {
    id: row.id,
    role: row.role,
    created_at: row.created_at,
    ended_at: row.ended_at,
    provider: row.provider,
    model: row.model,
    planned_rounds: row.planned_rounds,
    answered_turns: row.answered_turns,
    overall_score: report.overall_score,
    pillars: {
      content: report.pillars.content.score,
      relevance: report.pillars.relevance.score,
      clarity: report.pillars.clarity.score,
      depth: report.pillars.depth.score,
    },
  };
}

/** Reads stored reports only. Never performs evaluation or returns free-form report text. */
export function compareSessions(aId: string | null, bId: string | null): CompareResult {
  const validId = (id: string | null): id is string => id !== null && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
  if (!validId(aId) || !validId(bId) || aId === bId) {
    return { ok: false, status: 400, error: "Chọn đúng hai phiên khác nhau (A và B)." };
  }

  const a = loadSummary(aId, "A");
  if ("ok" in a) return a;
  const b = loadSummary(bId, "B");
  if ("ok" in b) return b;
  if (normalizeCompareRole(a.role) !== normalizeCompareRole(b.role)) {
    return { ok: false, status: 422, error: "Hai phiên phải có cùng vị trí sau khi chuẩn hóa." };
  }

  const warnings: string[] = [];
  if (a.provider !== b.provider) warnings.push("Provider khác nhau; điểm số không nhất thiết tương đương.");
  if (a.model !== b.model) warnings.push("Model khác nhau; điểm số không nhất thiết tương đương.");
  if (a.planned_rounds !== b.planned_rounds) warnings.push("Số vòng dự kiến khác nhau; hãy cân nhắc khi đối chiếu.");
  if (a.answered_turns !== b.answered_turns) warnings.push("Số câu trả lời khác nhau; hãy cân nhắc khi đối chiếu.");
  return { ok: true, a, b, warnings };
}
