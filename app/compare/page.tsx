import Link from "next/link";
import { compareSessions, type CompareSummary } from "@/lib/compare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const measures = [
  { key: "overall_score", label: "Điểm tổng" },
  { key: "content", label: "Nội dung" },
  { key: "relevance", label: "Liên quan" },
  { key: "clarity", label: "Rõ ràng" },
  { key: "depth", label: "Chiều sâu" },
] as const;

function score(summary: CompareSummary, key: (typeof measures)[number]["key"]): number {
  return key === "overall_score" ? summary.overall_score : summary.pillars[key];
}

function date(timestamp: number | null): string {
  return timestamp == null ? "—" : new Date(timestamp * 1000).toLocaleString("vi-VN");
}

export default function ComparePage({ searchParams }: { searchParams: { a?: string | string[]; b?: string | string[] } }) {
  const result = compareSessions(
    typeof searchParams.a === "string" ? searchParams.a : null,
    typeof searchParams.b === "string" ? searchParams.b : null,
  );
  return (
    <main className="w-full px-gutter py-space-lg max-w-5xl mx-auto flex flex-col gap-space-lg">
      <div>
        <Link className="btn btn-ghost" href="/history">← Lịch sử</Link>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight mt-space-sm">So sánh hai báo cáo</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">Các điểm đã lưu được đối chiếu theo thứ tự A → B. Chênh lệch = B − A (điểm trên thang 0–100).</p>
      </div>
      {!result.ok ? (
        <div role="alert" className="card p-space-md text-error">
          {result.error} <Link className="underline" href="/history">Chọn lại hai phiên trong lịch sử.</Link>
        </div>
      ) : (
        <>
          <div className="card p-space-md overflow-x-auto">
            <table className="w-full text-left font-body-md text-body-md text-on-surface">
              <caption className="text-left font-headline-sm text-headline-sm mb-space-sm">Điểm đánh giá đã lưu · {result.a.role}</caption>
              <thead><tr className="border-b" style={{ borderColor: "var(--border-hairline)" }}>
                <th scope="col" className="py-space-sm pr-space-sm">Tiêu chí</th>
                <th scope="col" className="py-space-sm pr-space-sm">A</th>
                <th scope="col" className="py-space-sm pr-space-sm">B</th>
                <th scope="col" className="py-space-sm">B − A</th>
              </tr></thead>
              <tbody>
                {measures.map(({ key, label }) => {
                  const delta = score(result.b, key) - score(result.a, key);
                  return <tr key={key} className="border-b" style={{ borderColor: "var(--border-hairline)" }}>
                    <th scope="row" className="py-space-sm pr-space-sm font-medium">{label}</th>
                    <td className="py-space-sm pr-space-sm tabular-nums">{score(result.a, key)}</td>
                    <td className="py-space-sm pr-space-sm tabular-nums">{score(result.b, key)}</td>
                    <td className="py-space-sm tabular-nums">{delta > 0 ? "+" : ""}{delta}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {([result.a, result.b] as const).map((s, index) => (
              <section key={s.id} className="card p-space-md flex flex-col gap-space-xs">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">{index === 0 ? "A" : "B"} · {s.role}</h2>
                <p className="label-code-sm text-on-surface-variant">{s.id}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Tạo: {date(s.created_at)} · Kết thúc: {date(s.ended_at)}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Provider / model: {s.provider} / {s.model}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Số câu đã trả lời: {s.answered_turns} / {s.planned_rounds} vòng dự kiến</p>
                <Link className="btn btn-ghost self-start" href={`/report/${encodeURIComponent(s.id)}`}>Xem báo cáo {index === 0 ? "A" : "B"}</Link>
              </section>
            ))}
          </div>
          {result.warnings.length ? <div role="note" className="card p-space-md">
            <p className="font-body-md text-body-md text-on-surface">Lưu ý khi đối chiếu</p>
            <ul className="list-disc pl-space-lg font-body-sm text-body-sm text-on-surface-variant">
              {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div> : null}
          <p className="font-body-sm text-body-sm text-on-surface-variant">So sánh này chỉ mô tả hai báo cáo đã lưu, không chấm lại bằng AI và không chứng minh sự tiến bộ hay quan hệ nhân quả.</p>
        </>
      )}
    </main>
  );
}
