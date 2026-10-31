"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Panel chi phí AI (S15 — FR-SC-15..23).
 *
 * ⚠️ FR-SC-18 — mọi con số tiền đều là **ước tính** theo bảng giá model.
 * ⚠️ P7 — không hiện % hoàn thành mơ hồ; chỉ số liệu cụ thể.
 */

export interface CostPanelProps {
  initial: {
    days: number;
    totalCalls: number;
    inputTokens: number;
    outputTokens: number;
    cacheRead: number;
    cacheWrite: number;
    estimatedCost: number;
    daily: Array<{
      date: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      cacheRead: number;
      cacheWrite: number;
      estimatedCost: number;
    }>;
    byFeature: Array<{
      feature: string;
      model: string;
      calls: number;
      estimatedCost: number;
      share: number;
    }>;
    monthlyBudgetUsd: number;
    monthCost: number;
    budgetStatus: "ok" | "warning" | "exceeded";
    budgetUsedPct: number;
  };
}

const FEATURE_LABELS: Record<string, string> = {
  daily_plan: "Sinh kế hoạch",
  grading: "Chấm điểm",
  journal_feedback: "Phản hồi nhật ký",
  weekly_review: "Review tuần",
  classify: "Phân loại",
  roleplay: "Hội thoại",
  mock_interview: "Phỏng vấn",
  language_test: "Bài thi",
};

export function CostPanel({ initial }: CostPanelProps) {
  const [days, setDays] = useState(initial.days);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function load(window: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/costs?days=${window}`);
      const payload = await res.json();
      if (payload.ok) setData(payload.data);
    } catch {
      // Giữ dữ liệu cũ — không giả lập số.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(days);
  }, [days]);

  const maxCost = Math.max(...data.daily.map((d) => d.estimatedCost), 0.0001);

  return (
    <div className="space-y-gutter-md">
      {/* Tổng quan + ngân sách */}
      <section className="rounded-xl bg-surface-container p-space-lg">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Chi phí AI
          </h2>

          <div className="flex gap-1" role="group" aria-label="Khoảng thời gian">
            {[7, 30, 90].map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={days === option}
                onClick={() => setDays(option)}
                className={cn(
                  "rounded-lg px-3 py-1 font-code-md text-code-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  days === option
                    ? "bg-primary-container text-on-primary"
                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-highest",
                )}
              >
                {option} ngày
              </button>
            ))}
          </div>
        </div>

        {/* 4 ô tổng quan */}
        <div className="mt-space-md grid grid-cols-2 gap-gutter-md lg:grid-cols-4">
          <StatBox
            label="Tổng chi phí (ước tính)"
            value={`$${data.estimatedCost.toFixed(4)}`}
          />
          <StatBox label="Số lượt gọi" value={String(data.totalCalls)} />
          <StatBox
            label="Cache read"
            value={data.cacheRead.toLocaleString("vi-VN")}
          />
          <StatBox
            label="Ngân sách tháng"
            value={`$${data.monthlyBudgetUsd.toFixed(0)}`}
          />
        </div>

        {/* Ngân sách — FR-SC-22 */}
        <div className="mt-space-md rounded-lg bg-surface-container-low p-space-md">
          <div className="flex flex-wrap items-center justify-between gap-space-sm">
            <span className="font-label-md text-label-md text-on-surface">
              Đã dùng tháng này: ${data.monthCost.toFixed(4)} / $
              {data.monthlyBudgetUsd.toFixed(0)}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-label-sm text-label-sm",
                data.budgetStatus === "exceeded"
                  ? "bg-error/15 text-error"
                  : data.budgetStatus === "warning"
                    ? "bg-tertiary/20 text-tertiary"
                    : "bg-primary/10 text-primary",
              )}
            >
              {data.budgetStatus === "exceeded"
                ? "Đã vượt ngân sách"
                : data.budgetStatus === "warning"
                  ? "Gần vượt ngân sách (≥80%)"
                  : "Trong ngân sách"}
            </span>
          </div>

          {/* Thanh ngân sách */}
          <div className="mt-space-sm h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                data.budgetStatus === "exceeded"
                  ? "bg-error"
                  : data.budgetStatus === "warning"
                    ? "bg-tertiary"
                    : "bg-primary",
              )}
              style={{
                width: `${Math.min(100, data.budgetUsedPct)}%`,
              }}
            />
          </div>
          <span className="font-code-md text-code-md text-outline tabular">
            {data.budgetUsedPct}% ngân sách tháng
          </span>
        </div>
      </section>

      {/* Biểu đồ theo ngày — FR-SC-15 */}
      <section className="rounded-xl bg-surface-container-low p-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Chi phí theo ngày
        </h2>

        <div className="mt-space-md flex h-32 items-end gap-1">
          {data.daily.map((day) => (
            <div
              key={day.date}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
              title={`${day.date}: ${day.calls} lượt · $${day.estimatedCost.toFixed(4)}`}
            >
              <div
                className="w-full rounded-t-sm bg-secondary"
                style={{
                  height: `${Math.max(2, (day.estimatedCost / maxCost) * 88)}px`,
                }}
              />
            </div>
          ))}
        </div>

        {/* Bảng ngày — FR-SC-15 */}
        <div className="mt-space-md overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Chi phí AI theo ngày</caption>
            <thead>
              <tr className="border-b border-outline-variant">
                <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Ngày
                </th>
                <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Lượt
                </th>
                <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Input
                </th>
                <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Output
                </th>
                <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Cache read
                </th>
                <th scope="col" className="py-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  USD (ước tính)
                </th>
              </tr>
            </thead>
            <tbody>
              {data.daily
                .filter((day) => day.calls > 0)
                .map((day) => (
                  <tr key={day.date} className="border-b border-outline-variant/40">
                    <td className="py-2 pr-3 font-code-md text-code-md text-on-surface tabular">
                      {day.date}
                    </td>
                    <td className="py-2 pr-3 font-code-md text-code-md text-on-surface tabular">
                      {day.calls}
                    </td>
                    <td className="py-2 pr-3 font-code-md text-code-md text-on-surface tabular">
                      {day.inputTokens.toLocaleString("vi-VN")}
                    </td>
                    <td className="py-2 pr-3 font-code-md text-code-md text-on-surface tabular">
                      {day.outputTokens.toLocaleString("vi-VN")}
                    </td>
                    <td className="py-2 pr-3 font-code-md text-code-md text-on-surface tabular">
                      {day.cacheRead.toLocaleString("vi-VN")}
                    </td>
                    <td className="py-2 font-code-md text-code-md text-primary tabular">
                      ${day.estimatedCost.toFixed(4)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Chi phí theo tính năng — FR-SC-16 */}
      <section className="rounded-xl bg-surface-container-low p-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Chi phí theo tính năng
        </h2>

        {data.byFeature.length === 0 ? (
          <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
            Chưa có lượt gọi AI nào trong khoảng thời gian này.
          </p>
        ) : (
          <ul className="mt-space-md space-y-space-sm">
            {data.byFeature.map((item) => (
              <li key={`${item.feature}|${item.model}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-space-sm">
                  <span className="font-body-sm text-body-sm text-on-surface">
                    {FEATURE_LABELS[item.feature] ?? item.feature}
                    <span className="ml-2 font-code-md text-code-md text-outline">
                      {item.model}
                    </span>
                  </span>
                  <span className="font-code-md text-code-md text-on-surface tabular">
                    {item.calls} lượt · ${item.estimatedCost.toFixed(4)} ·{" "}
                    {item.share.toFixed(1)}%
                  </span>
                </div>

                {/* Thanh phân bổ */}
                <div className="mt-space-xs h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
                  <div
                    className="h-full rounded-full bg-tertiary"
                    style={{ width: `${Math.min(100, item.share)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tổng token — FR-SC-17 */}
      <section className="rounded-xl bg-surface-container-low p-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Tổng token
        </h2>
        <dl className="mt-space-md grid grid-cols-2 gap-gutter-md lg:grid-cols-4">
          <StatBox
            label="Input"
            value={data.inputTokens.toLocaleString("vi-VN")}
          />
          <StatBox
            label="Output"
            value={data.outputTokens.toLocaleString("vi-VN")}
          />
          <StatBox
            label="Cache read"
            value={data.cacheRead.toLocaleString("vi-VN")}
          />
          <StatBox
            label="Cache write"
            value={data.cacheWrite.toLocaleString("vi-VN")}
          />
        </dl>
      </section>

      {/* Nhật ký gọi API + xuất CSV — FR-SC-19..21 */}
      <AiCallsLog />

      {loading && (
        <p className="font-label-sm text-label-sm text-outline" aria-live="polite">
          Đang tải…
        </p>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container p-space-md">
      <dt className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
        {label}
      </dt>
      <dd className="mt-space-xs font-headline-sm text-headline-sm text-on-surface tabular">
        {value}
      </dd>
    </div>
  );
}

/** Nhật ký gọi API + nút xuất CSV (FR-SC-19..21). */
function AiCallsLog() {
  const [items, setItems] = useState<
    Array<{
      id: string;
      createdAt: string;
      feature: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      cacheRead: number;
      cacheWrite: number;
      estimatedCost: number;
      ok: boolean;
      error: string | null;
    }>
  >([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ai/calls?limit=50");
        const payload = await res.json();
        if (payload.ok) setItems(payload.data.items);
      } catch {
        // Không giả lập — để bảng trống.
      }
    })();
  }, []);

  return (
    <section className="rounded-xl bg-surface-container-low p-space-lg">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Nhật ký gọi API
        </h2>

        {/* FR-SC-21 — xuất CSV */}
        <a
          href="/api/ai/calls?limit=500&format=csv"
          download
          className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="download" size={16} />
          Xuất CSV
        </a>
      </div>

      {items.length === 0 ? (
        <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
          Chưa có lượt gọi AI nào.
        </p>
      ) : (
        <div className="mt-space-md overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Nhật ký gọi AI</caption>
            <thead>
              <tr className="border-b border-outline-variant">
                <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Thời gian
                </th>
                <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Tính năng
                </th>
                <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Model
                </th>
                <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  In
                </th>
                <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Cache read
                </th>
                <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Out
                </th>
                <th scope="col" className="py-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  USD
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-outline-variant/40"
                >
                  <td className="py-2 pr-3 font-code-md text-code-md text-on-surface tabular">
                    {new Date(item.createdAt).toLocaleString("vi-VN")}
                  </td>
                  <td className="py-2 pr-3 font-code-md text-code-md text-on-surface">
                    {FEATURE_LABELS[item.feature] ?? item.feature}
                  </td>
                  <td className="py-2 pr-3 font-code-md text-code-md text-outline">
                    {item.model}
                  </td>
                  <td className="py-2 pr-3 font-code-md text-code-md text-on-surface tabular">
                    {item.inputTokens.toLocaleString("vi-VN")}
                  </td>
                  {/* FR-SC-19 — cache read hiện ở TỪNG DÒNG */}
                  <td className="py-2 pr-3 font-code-md text-code-md text-primary tabular">
                    {item.cacheRead.toLocaleString("vi-VN")}
                  </td>
                  <td className="py-2 pr-3 font-code-md text-code-md text-on-surface tabular">
                    {item.outputTokens.toLocaleString("vi-VN")}
                  </td>
                  <td className="py-2 font-code-md text-code-md text-on-surface tabular">
                    ${item.estimatedCost.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
