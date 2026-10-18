"use client";

/**
 * Screen 03 index — picker for active / in-progress sessions.
 *
 * Why this exists:
 *   - The TopBar nav link "Phiên đang diễn ra" goes to /session, but only
 *     /session/[id] exists. Without this index, /session 404s.
 *   - We list every active + evaluating session from SQLite, plus the
 *     most-recent non-completed one as the "continue" CTA.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Chip } from "@/components/Chip";

interface SessionListItem {
  id: string;
  role: string;
  language: "vi" | "en";
  mode: "strict" | "coaching";
  status: "active" | "evaluating" | "completed" | "failed";
  provider: string;
  model: string;
  planned_rounds: number;
  created_at: number;
  ended_at: number | null;
  overall_score: number | null;
  evaluated_turns: number;
}

export default function SessionIndex() {
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Surface active + evaluating first, then everything else.
        const res = await fetch("/api/sessions?status=active&sort=newest&limit=50");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!alive) return;
        setItems(Array.isArray(j.sessions) ? j.sessions : []);
      } catch (e) {
        if (!alive) return;
        setErr((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Pick the most-recent active or evaluating session as the "continue" target.
  const resumable = items.find((s) => s.status === "active" || s.status === "evaluating");

  return (
    <div className="w-full px-gutter py-space-lg max-w-5xl mx-auto flex flex-col gap-space-lg">
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center gap-space-xs">
          <Chip tone="indigo">FR-11 · FR-20</Chip>
          <Chip tone="neutral">Phiên của tôi</Chip>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Phiên đang diễn ra</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Tất cả phiên phỏng vấn chưa hoàn tất được liệt kê tại đây. Mở phiên để tiếp tục — toàn bộ
          transcript đã được persist vào SQLite nên bạn có thể đóng tab và quay lại bất cứ lúc nào.
        </p>
      </div>

      {err ? (
        <div className="card p-space-md border" style={{ borderColor: "rgba(244,63,94,0.4)" }}>
          <span className="font-body-md text-body-md text-error">Không tải được: {err}</span>
        </div>
      ) : null}

      {resumable ? (
        <Link
          href={`/session/${resumable.id}`}
          className="card-elevated p-space-md flex items-center gap-space-md hover:scale-[1.005] transition-transform"
          style={{ borderColor: "var(--border-focus)" }}
        >
          <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center text-on-primary flex-shrink-0">
            <span className="material-symbols-outlined text-[24px]">play_circle</span>
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="label-caps text-tertiary uppercase">Tiếp tục phiên gần nhất</span>
            <span className="font-headline-md text-headline-md text-on-surface truncate">{resumable.role}</span>
            <span className="label-code-sm text-on-surface-variant">
              {resumable.id} · {resumable.provider} · {resumable.model} · {resumable.evaluated_turns}/{resumable.planned_rounds} câu
            </span>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
        </Link>
      ) : null}

      {loading ? (
        <div className="card p-space-md text-on-surface-variant">Đang tải danh sách phiên…</div>
      ) : items.length === 0 ? (
        <div className="card p-space-lg flex flex-col items-center gap-space-md text-center">
          <span className="material-symbols-outlined text-[48px] text-primary">forum</span>
          <span className="font-headline-sm text-headline-sm text-on-surface">Chưa có phiên nào đang diễn ra</span>
          <span className="font-body-md text-body-md text-on-surface-variant max-w-md">
            Tất cả phiên bạn đã bắt đầu sẽ xuất hiện ở đây. Bắt đầu phiên mới để luyện tập.
          </span>
          <Link href="/new" className="btn btn-primary">
            <span className="material-symbols-outlined text-[18px]">add</span> Bắt đầu phỏng vấn
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-space-sm">
          <span className="label-caps text-on-surface-variant uppercase">Phiên khác</span>
          {items.map((s) => (
            <Link
              key={s.id}
              href={`/session/${s.id}`}
              className="card p-space-md flex items-center gap-space-md hover:bg-surface-elevated transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-space-xs flex-wrap">
                  <span className="font-body-md text-body-md text-on-surface truncate">{s.role}</span>
                  <Chip tone={s.mode === "coaching" ? "emerald" : "neutral"}>{s.mode}</Chip>
                  <Chip tone={s.status === "evaluating" ? "amber" : "indigo"}>{s.status}</Chip>
                </div>
                <div className="label-code-sm text-on-surface-variant mt-1">
                  {s.id} · {s.provider} · {s.model} · {s.evaluated_turns}/{s.planned_rounds} câu ·{" "}
                  {new Date(s.created_at * 1000).toLocaleString("vi-VN")}
                </div>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
            </Link>
          ))}
        </div>
      )}

      <div className="card p-space-md flex items-start gap-space-sm" style={{ borderColor: "var(--border-t2)" }}>
        <span className="material-symbols-outlined text-tertiary">history</span>
        <div className="flex flex-col">
          <span className="font-body-md text-body-md text-on-surface">Đã hoàn tất phiên trước đó?</span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Mở <Link href="/history" className="text-primary underline">Lịch sử &amp; SQLite</Link> để xem tất cả phiên,
            hoặc báo cáo đánh giá ở <Link href="/report" className="text-primary underline">đây</Link>.
          </span>
        </div>
      </div>
    </div>
  );
}
