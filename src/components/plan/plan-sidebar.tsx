import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { Domain } from "@/lib/prompts";

/**
 * Sidebar S02 — 3 khối (task §27).
 *
 * 27.1 "Ràng Buộc Sinh Học" — mood/energy/sleep/focus hôm nay.
 * 27.2 "Trọng Tâm Bứt Phá"  — skill ít bằng chứng nhất + badge ưu tiên.
 * 27.3 "Chi Phí Phiên Sinh"  — token cached/output, latency, USD (từ `AiCall`).
 * 27.4 "Local-First Vault Synced" — nội dung tĩnh, nội dung cục bộ.
 *
 * ⚠️ P7 — không vanity metric: khối "Chi phí" hiển thị **chi phí thật** đã
 * ghi trong `AiCall`, không phải số liệu ước lượng.
 */

export interface BioConstraints {
  mood: number | null;
  energy: number | null;
  sleep: number | null;
  focus: number | null;
}

export interface BreakthroughFocus {
  skillId: string;
  skillName: string;
  domain: Domain;
  evidenceCount: number;
  /** Điểm ưu tiên 0–100 (thấp = cần đào sâu). */
  priority: number;
}

export interface GenerationCost {
  /** Token input đọc từ cache. */
  cachedInputTokens: number;
  /** Token input mới. */
  inputTokens: number;
  /** Token output. */
  outputTokens: number;
  /** Độ trễ ms. */
  latencyMs: number;
  /** Chi phí USD (đã tính sẵn ở server). */
  usd: number;
  /** Model đã dùng. */
  model: string;
  /** Thời điểm gọi. */
  createdAt: string;
}

const BIO_FIELDS: Array<{ key: keyof BioConstraints; label: string }> = [
  { key: "mood", label: "Tâm trạng" },
  { key: "energy", label: "Năng lượng" },
  { key: "sleep", label: "Giấc ngủ" },
  { key: "focus", label: "Tập trung" },
];

const DOMAIN_LABELS: Record<Domain, string> = {
  professional: "Chuyên môn",
  communication: "Giao tiếp",
  language: "Ngoại ngữ",
  personal: "Cá nhân",
};

export interface PlanSidebarProps {
  bio: BioConstraints;
  focus: BreakthroughFocus | null;
  cost: GenerationCost | null;
  /** Đang chờ phản hồi AI. */
  loading?: boolean;
  className?: string;
}

export function PlanSidebar({
  bio,
  focus,
  cost,
  loading = false,
  className,
}: PlanSidebarProps) {
  return (
    <aside
      aria-label="Ngữ cảnh kế hoạch"
      className={cn("flex flex-col gap-space-md", className)}
    >
      {/* 27.1 — Ràng Buộc Sinh Học */}
      <section className="rounded-xl bg-surface-container-low p-gutter-md">
        <h3 className="flex items-center gap-1 font-label-md text-label-md uppercase tracking-wider text-outline">
          <Icon name="monitor_heart" size={16} className="text-primary" />
          Ràng Buộc Sinh Học
        </h3>
        <dl className="mt-space-sm space-y-space-xs">
          {BIO_FIELDS.map((field) => {
            const value = bio[field.key];
            return (
              <div key={field.key} className="flex items-center justify-between gap-2">
                <dt className="font-body-sm text-body-sm text-on-surface-variant">
                  {field.label}
                </dt>
                <dd className="font-code-md text-code-md text-on-surface tabular">
                  {value === null ? "—" : `${value}/10`}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {/* 27.2 — Trọng Tâm Bứt Phá */}
      <section className="rounded-xl bg-surface-container-low p-gutter-md">
        <h3 className="flex items-center gap-1 font-label-md text-label-md uppercase tracking-wider text-outline">
          <Icon name="target" size={16} className="text-secondary" />
          Trọng Tâm Bứt Phá
        </h3>

        {focus ? (
          <div className="mt-space-sm">
            <p className="font-headline-sm text-headline-sm text-on-surface">
              {focus.skillName}
            </p>
            <p className="mt-space-xs font-label-sm text-label-sm text-outline">
              {DOMAIN_LABELS[focus.domain]} · {focus.evidenceCount} bằng chứng
            </p>
            <span className="mt-space-sm inline-flex items-center rounded-full bg-error-container/40 px-2 py-0.5 font-label-sm text-label-sm text-error">
              Ưu tiên đào sâu
            </span>
          </div>
        ) : (
          <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
            {loading ? "Đang dò kỹ năng cần đào sâu…" : "Chưa đủ dữ liệu bằng chứng."}
          </p>
        )}
      </section>

      {/* 27.3 — Chi Phí Phiên Sinh */}
      <section className="rounded-xl bg-surface-container-low p-gutter-md">
        <h3 className="flex items-center gap-1 font-label-md text-label-md uppercase tracking-wider text-outline">
          <Icon name="toll" size={16} className="text-tertiary" />
          Chi Phí Phiên Sinh
        </h3>

        {cost ? (
          <dl className="mt-space-sm space-y-space-xs">
            <div className="flex items-center justify-between gap-2">
              <dt className="font-body-sm text-body-sm text-on-surface-variant">
                Token cached
              </dt>
              <dd className="font-code-md text-code-md text-primary tabular">
                {cost.cachedInputTokens.toLocaleString("vi-VN")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="font-body-sm text-body-sm text-on-surface-variant">
                Token mới
              </dt>
              <dd className="font-code-md text-code-md text-on-surface tabular">
                {cost.inputTokens.toLocaleString("vi-VN")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="font-body-sm text-body-sm text-on-surface-variant">
                Token output
              </dt>
              <dd className="font-code-md text-code-md text-on-surface tabular">
                {cost.outputTokens.toLocaleString("vi-VN")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="font-body-sm text-body-sm text-on-surface-variant">
                Độ trễ
              </dt>
              <dd className="font-code-md text-code-md text-on-surface tabular">
                {cost.latencyMs} ms
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="font-body-sm text-body-sm text-on-surface-variant">
                Chi phí
              </dt>
              <dd className="font-code-md text-code-md text-secondary tabular">
                ${cost.usd.toFixed(4)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
            {loading ? "Đang tính…" : "Chưa có phiên AI nào."}
          </p>
        )}
      </section>

      {/* 27.4 — Local-First Vault Synced (nội dung tĩnh) */}
      <section className="rounded-xl bg-gradient-to-br from-surface-container to-surface-container-low p-gutter-md">
        <h3 className="flex items-center gap-1 font-label-md text-label-md uppercase tracking-wider text-outline">
          <Icon name="lock" size={16} className="text-primary" />
          Local-First Vault Synced
        </h3>
        <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
          Toàn bộ dữ liệu nằm trong SQLite cục bộ. Không tài khoản, không telemetry.
        </p>
      </section>
    </aside>
  );
}
