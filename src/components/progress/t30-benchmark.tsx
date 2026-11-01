"use client";

export interface T30BenchmarkProps {
  t30: {
    available: boolean;
    daysMissing: number;
    metrics: Array<{
      key: string;
      label: string;
      current: number | null;
      previous: number | null;
      delta: number | null;
      unit: string;
    }>;
  };
}

/**
 * Tự đối sánh 30 ngày (FR-PR-03, AC-RP-8).
 *
 * ⚠️ `available === false` ⇒ ẩn khối, hiện "Cần thêm {n} ngày dữ liệu".
 */
export function T30Benchmark({ t30 }: T30BenchmarkProps) {
  if (!t30.available) {
    return (
      <div className="bg-surface-container p-space-lg rounded-xl">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Hiện tại vs 30 ngày trước
        </h2>
        <p className="mt-space-md font-body-md text-body-md text-on-surface-variant">
          Cần thêm {t30.daysMissing} ngày dữ liệu
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-container p-space-lg rounded-xl">
      <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
        Hiện tại vs 30 ngày trước
      </h2>
      <table className="mt-space-md w-full">
        <caption className="sr-only">
          So sánh chỉ số hiện tại với 30 ngày trước
        </caption>
        <thead>
          <tr className="border-b border-outline-variant/40">
            <th scope="col" className="text-left font-label-sm text-label-sm text-outline">
              Chỉ số
            </th>
            <th scope="col" className="text-right font-label-sm text-label-sm text-outline">
              Hiện tại
            </th>
            <th scope="col" className="text-right font-label-sm text-label-sm text-outline">
              30 ngày trước
            </th>
            <th scope="col" className="text-right font-label-sm text-label-sm text-outline">
              Δ
            </th>
          </tr>
        </thead>
        <tbody>
          {t30.metrics.map((metric) => {
            const up = (metric.delta ?? 0) > 0;
            const flat = (metric.delta ?? 0) === 0;
            return (
              <tr key={metric.key} className="border-b border-outline-variant/20">
                <th scope="row" className="text-left font-body-sm text-body-sm text-on-surface">
                  {metric.label}
                  <span className="ml-1 font-label-sm text-label-sm text-outline">
                    {metric.unit}
                  </span>
                </th>
                <td className="text-right font-code-md text-code-md tabular text-on-surface">
                  {metric.current ?? "—"}
                </td>
                <td className="text-right font-code-md text-code-md tabular text-on-surface-variant">
                  {metric.previous ?? "—"}
                </td>
                <td
                  className={
                    flat
                      ? "text-right font-code-md text-code-md tabular text-on-surface-variant"
                      : up
                        ? "text-right font-code-md text-code-md tabular text-primary"
                        : "text-right font-code-md text-code-md tabular text-error"
                  }
                >
                  <span aria-hidden="true">{flat ? "—" : up ? "▲" : "▼"}</span>{" "}
                  {metric.delta !== null
                    ? `${up ? "+" : ""}${metric.delta}`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
