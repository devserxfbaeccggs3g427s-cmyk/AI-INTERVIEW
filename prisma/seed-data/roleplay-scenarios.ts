/**
 * Seed data: 6 tình huống role-play (FR-CM-06, SPEC §6.9).
 * Mã: SP-01, SP-03, SP-05, SP-09, SP-12, SP-15.
 * Mỗi tình huống có hiddenGoal (mục tiêu ẩn) — chỉ dùng khi chấm cuối phiên.
 */

export interface SeedRoleplayScenario {
  code: string;
  title: string;
  brief: string;
  hiddenGoal: string;
  lang: "en" | "vi" | "zh";
  level: "A1" | "A2" | "B1" | "B2" | "C1";
  durationSec: number;
  tags: string[];
}

export const ROLEPLAY_SCENARIOS: SeedRoleplayScenario[] = [
  {
    code: "SP-01",
    title: "Pitching Kiến Trúc Hệ Thống",
    brief: "Trình bày bản thảo (Pitching) giải pháp kiến trúc trước hội đồng kỹ thuật. Mục tiêu: thuyết phục Tech Lead & Principal Architect chấp nhận chuyển nền tảng dữ liệu lớn sang Event-Driven không gián đoạn giao dịch.",
    hiddenGoal: "Thuyết phục Tech Lead & Principal Architect chấp nhận chuyển nền tảng dữ liệu lớn sang Event-Driven KHÔNG GIÁN ĐOẠN GIAO DỊCH.",
    lang: "en",
    level: "C1",
    durationSec: 60,
    tags: ["pitching", "architecture", "event-driven", "technical-leadership"],
  },
  {
    code: "SP-03",
    title: "Daily Standup Súc Tích 60s",
    brief: "Báo cáo việc hoàn thành, mục tiêu hôm nay, rủi ro cản trở. Mục tiêu: không lan man, nêu rõ blocker trong 60 giây.",
    hiddenGoal: "Không lan man, NÊU RÕ BLOCKER trong 60 giây.",
    lang: "en",
    level: "B1",
    durationSec: 60,
    tags: ["standup", "daily", "blocker", "communication"],
  },
  {
    code: "SP-05",
    title: "Trình Bày Incident Post-Mortem",
    brief: "Giải trình sự cố P0 trước ban lãnh đạo. Mục tiêu: phân tích root cause theo 5-Whys không đổ lỗi ai.",
    hiddenGoal: "Phân tích root cause theo 5-Whys KHÔNG ĐỔ LỖI AI.",
    lang: "en",
    level: "B2",
    durationSec: 90,
    tags: ["postmortem", "incident", "root-cause", "blameless"],
  },
  {
    code: "SP-09",
    title: "Đàm Phán Scope & Deadline",
    brief: "Đàm phán phạm vi với Product Manager. Mục tiêu: từ chối feature gấp bằng dữ liệu velocity thực tế + đề xuất phased rollout.",
    hiddenGoal: "TỪ CHỐI feature gấp bằng dữ liệu velocity thực tế + ĐỀ XUẤT PHASED ROLLOUT.",
    lang: "en",
    level: "B2",
    durationSec: 120,
    tags: ["negotiation", "scope", "deadline", "velocity", "phased-rollout"],
  },
  {
    code: "SP-12",
    title: "Giải Thích Lỗi Kỹ Thuật Cho Non-Tech",
    brief: "Diễn giải deadlock DB cho giám đốc kinh doanh. Mục tiêu: giải thích bằng phép ẩn dụ đời thường để hiểu rủi ro.",
    hiddenGoal: "Giải thích deadlock DB bằng PHÉP ẨN DỤ ĐỜI THƯỜNG để giám đốc kinh doanh hiểu rủi ro.",
    lang: "en",
    level: "C1",
    durationSec: 60,
    tags: ["explanation", "non-technical", "deadlock", "analogy", "communication"],
  },
  {
    code: "SP-15",
    title: "Bảo Vệ Quyết Định Refactor Codebase",
    brief: "Bao vệ quyết định tái cấu trúc trước ban giám đốc. Mục tiêu: xin cấp 2 sprint tái cấu trúc mô hình dữ liệu, nêu rõ nợ kỹ thuật.",
    hiddenGoal: "Xin cấp 2 SPRINT TÁI CẤU TRÚC mô hình dữ liệu, nêu rõ NỢ KỸ THUẬT.",
    lang: "en",
    level: "B2",
    durationSec: 90,
    tags: ["refactor", "technical-debt", "executive", "advocacy"],
  },
];