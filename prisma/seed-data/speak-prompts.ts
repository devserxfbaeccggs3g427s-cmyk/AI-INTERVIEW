/**
 * Seed data: 12 bài mẫu luyện nói/viết (FR-CM-09, SPEC §6.8).
 * Mã: EX-01..EX-12, isUserMade = false.
 * 8 bài en + 4 bài vi; level A1–C1.
 */

export interface SeedSpeakPrompt {
  code: string;
  title: string;
  prompt: string;
  level: "A1" | "A2" | "B1" | "B2" | "C1";
  lang: "en" | "vi" | "zh";
  mode: "write" | "speak" | "both";
  tags: string[];
  isUserMade: boolean;
}

export const SPEAK_PROMPTS: SeedSpeakPrompt[] = [
  // en — 8 bài
  {
    code: "EX-01",
    title: "Yêu cầu hoãn sprint deadline",
    prompt: "Viết email cho Product Manager yêu cầu hoãn deadline sprint hiện tại 3 ngày vì phát hiện nợ kỹ thuật nghiêm trọng khi refactor module thanh toán. Cần nêu rõ rủi ro nếu deploy vội, đề xuất kế hoạch khắc phục và cam kết ngày hoàn thành mới.",
    level: "B2",
    lang: "en",
    mode: "both",
    tags: ["email", "technical-debt", "negotiation"],
    isUserMade: false,
  },
  {
    code: "EX-02",
    title: "Thương thảo hợp đồng API",
    prompt: "Viết email thương thảo điều khoản SLA và chiết khấu cho hợp đồng API B2B với đối tác lớn. Yêu cầu: uptime 99.9%, latency <200ms, chiết khấu 15% cho volume >1M calls/tháng. Tone chuyên nghiệp, giữ mối quan hệ dài hạn.",
    level: "C1",
    lang: "en",
    mode: "both",
    tags: ["contract", "sla", "negotiation", "api"],
    isUserMade: false,
  },
  {
    code: "EX-03",
    title: "Thông báo bảo trì hệ thống",
    prompt: "Viết thông báo cho toàn team về downtime 30 phút vào 02:00 AM thứ 7 tới để upgrade PostgreSQL từ 14 lên 16. Bao gồm: lý do, phạm vi ảnh hưởng, kế hoạch rollback, đường dẫn hỗ trợ khẩn cấp.",
    level: "B1",
    lang: "en",
    mode: "write",
    tags: ["maintenance", "downtime", "database", "communication"],
    isUserMade: false,
  },
  {
    code: "EX-04",
    title: "Hỏi lịch học team",
    prompt: "Viết email hỏi lịch học chung của team để đặt meeting cross-functional. Tone thân thiện, ngắn gọn.",
    level: "A1",
    lang: "en",
    mode: "write",
    tags: ["email", "scheduling", "team"],
    isUserMade: false,
  },
  {
    code: "EX-05",
    title: "Nhắn đồng nghiệp báo hỏi thăm",
    prompt: "Nhắn tin Slack cho đồng nghiệp vừa ốm: hỏi thăm, cập nhật trạng thái task đang làm, hỏi có cần support gì không.",
    level: "A2",
    lang: "en",
    mode: "both",
    tags: ["slack", "wellbeing", "update"],
    isUserMade: false,
  },
  {
    code: "EX-06",
    title: "Báo cáo tiến độ tuần cho team lead",
    prompt: "Viết báo cáo tuần: đã hoàn thành API authentication + unit test 85%; đang làm integration test payment gateway; vướng chỗ webhook timeout 30s; kế hoạch tuần sau: fix webhook + deploy staging.",
    level: "B1",
    lang: "en",
    mode: "write",
    tags: ["weekly-report", "progress", "status"],
    isUserMade: false,
  },
  {
    code: "EX-07",
    title: "Post-mortem sự cố DB",
    prompt: "Viết post-mortem sự cố P0: connection pool exhaustion do query N+1 trong batch job mới deploy. Cấu trúc: tóm tắt → timeline → root cause (5 Whys) → hành động khắc phục (index, query rewrite, alert, code review checklist).",
    level: "B2",
    lang: "en",
    mode: "write",
    tags: ["postmortem", "incident", "database", "root-cause"],
    isUserMade: false,
  },
  {
    code: "EX-08",
    title: "Từ chối đối tác lịch thiệp",
    prompt: "Viết email từ chối đề xuất hợp tác từ đối tác cũ một cách lịch thiệp: cảm ơn, nêu lý do (chiến lược tập trung core product), đề xuất giữ liên lạc qua newsletter, mở cửa cơ hội tương lai.",
    level: "C1",
    lang: "en",
    mode: "both",
    tags: ["rejection", "partnership", "relationship"],
    isUserMade: false,
  },
  // vi — 4 bài
  {
    code: "EX-09",
    title: "Nhắn hỗ trợ đồng nghiệp mới",
    prompt: "Nhắn chào đồng nghiệp mới gia nhập team: giới thiệu bản thân, hỏi cần hỗ trợ gì về môi trường dev / quy trình / codebase.",
    level: "A1",
    lang: "vi",
    mode: "both",
    tags: ["onboarding", "welcome", "support"],
    isUserMade: false,
  },
  {
    code: "EX-10",
    title: "Xin phép hủy lịch hẹn",
    prompt: "Nhắn tin xin phép hủy lịch 1-on-1 với manager do việc gia đình đột xuất, đề xuất 2 khung giờ thay thế vào tuần sau.",
    level: "A2",
    lang: "vi",
    mode: "both",
    tags: ["schedule", "cancellation", "manager"],
    isUserMade: false,
  },
  {
    code: "EX-11",
    title: "Đề xuất lộ trình chuyển đổi hệ thống",
    prompt: "Viết đề xuất chuyển từ monolith sang microservices cho hệ thống thanh toán: nêu vấn đề (deploy chậm, coupling cao), đề xuất strangler fig pattern, lợi ích (tự chủ deploy, scale độc lập), rủi ro (distributed tracing, eventual consistency).",
    level: "B1",
    lang: "vi",
    mode: "write",
    tags: ["proposal", "architecture", "migration", "microservices"],
    isUserMade: false,
  },
  {
    code: "EX-12",
    title: "Thông báo tăng giá dịch vụ",
    prompt: "Viết thông báo cho khách hàng enterprise về tăng giá 15% từ quý tới: lý do (chi phí infra, nâng cấp SLA), mức tăng cụ thể, điều khoản grandfathering 6 tháng, cam kết hỗ trợ migration nếu cần.",
    level: "B2",
    lang: "vi",
    mode: "write",
    tags: ["price-increase", "customer", "enterprise", "communication"],
    isUserMade: false,
  },
];