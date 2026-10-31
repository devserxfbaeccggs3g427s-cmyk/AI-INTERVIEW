/**
 * Lộ trình 3 giai đoạn (Q4) — thay cho mục tiêu cứng có deadline.
 *
 * Nguồn chân lý: `.kiro/steering/user-profile-decisions.md` §5.
 *
 * ⚠️ Nguyên tắc P7 — không vanity metric: điều kiện đạt và tiêu chí đều đo
 * được từ `Evidence`/`Activity` thật, không phải số đếm tự đặt.
 */

export interface StageCriterion {
  /** Điều kiện đạt — mô tả bằng số liệu thật. */
  condition: string;
  /** Tiêu chí hoàn thành, đo được từ Evidence/Activity. */
  criteria: string;
}

export interface Stage {
  id: 1 | 2 | 3;
  name: string;
  /** Số Evidence ở domain professional cần có để sang giai đoạn này. */
  requiredEvidence: number;
  /** Điểm mock interview tối thiểu (null = chưa áp dụng cho giai đoạn này). */
  requiredInterviewScore: number | null;
  criteria: StageCriterion;
}

/**
 * 3 giai đoạn — điều kiện đạt theo thứ tự tăng dần.
 *
 * Giai đoạn 2 cần giai đoạn 1 đạt **và** mock interview ≥ 3.5/5.
 * Giai đoạn 3 cần giai đoạn 2 đạt.
 */
export const STAGES: readonly Stage[] = [
  {
    id: 1,
    name: "Nền tảng",
    requiredEvidence: 20,
    requiredInterviewScore: null,
    criteria: {
      condition: "≥ 20 Evidence ở domain professional",
      criteria: "Viết được 1 REST service Spring Boot + 1 query JPA không N+1",
    },
  },
  {
    id: 2,
    name: "Vững chắc",
    requiredEvidence: 20,
    requiredInterviewScore: 3.5,
    criteria: {
      condition: "Giai đoạn 1 đạt + mock interview ≥ 3.5/5",
      criteria: "Giải thích được GC, connection pool, và 1 đánh đổi system design",
    },
  },
  {
    id: 3,
    name: "Mở rộng",
    requiredEvidence: 20,
    requiredInterviewScore: 3.5,
    criteria: {
      condition: "Giai đoạn 2 đạt",
      criteria: "Thiết kế 1 hệ thống đặt vé (10 triệu người dùng đỉnh cao)",
    },
  },
] as const;

/** Mặc định velocity khi chưa có ≥7 ngày dữ liệu: 1 Evidence/ngày. */
export const DEFAULT_VELOCITY = 1;

export interface StageProgress {
  /** Giai đoạn hiện tại = giai đoạn đầu tiên CHƯA đạt điều kiện. */
  stage: Stage;
  /** 0..100 — tiến độ tới điều kiện của giai đoạn hiện tại. */
  pct: number;
  /** Số bằng chứng chuyên môn đã có. */
  evidenceCount: number;
  /** Điểm mock interview gần nhất (null = chưa có). */
  interviewScore: number | null;
  /** Evidence/ngày trong 7 ngày gần nhất. */
  velocity: number;
  /** Có đủ dữ liệu velocity đáng tin (≥7 ngày). */
  hasVelocityData: boolean;
}

/**
 * Xác định giai đoạn hiện tại + tiến độ.
 *
 * @param evidenceCount số Evidence ở domain professional (mọi rating)
 * @param interviewScore điểm mock interview gần nhất (null = chưa có)
 * @param recentEvidence số Evidence 7 ngày gần nhất (để tính velocity)
 * @param daysWithData số ngày có dữ liệu (≥7 mới tin velocity)
 */
export function resolveCurrentStage(
  evidenceCount: number,
  interviewScore: number | null,
  recentEvidence = 0,
  daysWithData = 0,
): StageProgress {
  const hasVelocityData = daysWithData >= 7;
  const velocity = hasVelocityData ? recentEvidence / daysWithData : DEFAULT_VELOCITY;

  for (const stage of STAGES) {
    const evidenceOk = evidenceCount >= stage.requiredEvidence;

    // Giai đoạn 2 & 3 yêu cầu mock interview ≥ 3.5.
    const interviewOk =
      stage.requiredInterviewScore === null ||
      (interviewScore !== null && interviewScore >= stage.requiredInterviewScore);

    if (!evidenceOk || !interviewOk) {
      // Tiến độ = phần đã đạt / phần cần (chia nhỏ hơn còn thiếu).
      const evidencePct = Math.min(
        100,
        Math.round((100 * evidenceCount) / Math.max(1, stage.requiredEvidence)),
      );

      let pct = evidencePct;
      if (stage.requiredInterviewScore !== null) {
        const interviewPct =
          interviewScore === null
            ? 0
            : Math.min(
                100,
                Math.round(
                  (100 * interviewScore) / Math.max(0.1, stage.requiredInterviewScore),
                ),
              );
        // Trung bình 2 điều kiện — điều kiện nào yếu hơn thì kéo tổng xuống.
        pct = Math.round((evidencePct + interviewPct) / 2);
      }

      return {
        stage,
        pct,
        evidenceCount,
        interviewScore,
        velocity,
        hasVelocityData,
      };
    }
  }

  // Đã đạt cả 3 giai đoạn → giữ giai đoạn cuối, tiến độ 100%.
  const last = STAGES[STAGES.length - 1];
  return {
    stage: last,
    pct: 100,
    evidenceCount,
    interviewScore,
    velocity,
    hasVelocityData,
  };
}

/**
 * Có nên **giảm tải** không? (FR-DL-11 — "trượt ≥2 ngày → giảm tải")
 *
 * @param daysSinceLastActivity số ngày trôi qua không có bằng chứng mới
 */
export function shouldReduceLoad(daysSinceLastActivity: number): boolean {
  return daysSinceLastActivity >= 2;
}
