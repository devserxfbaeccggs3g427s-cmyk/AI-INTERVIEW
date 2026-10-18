"use client";

/**
 * Screen 04 index — landing page for the report nav.
 *
 * UX choice:
 *   - If there is at least one completed session, send the user to its report.
 *   - Otherwise, show an empty state with explicit CTAs (start a new interview,
 *     or browse all sessions) instead of silently bouncing to /history.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/Chip";

interface SessionListItem {
  id: string;
  role: string;
  status: "active" | "evaluating" | "completed" | "failed";
  created_at: number;
  overall_score: number | null;
}

type Phase = "loading" | "redirect" | "empty" | "error";

export default function ReportIndex() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [latest, setLatest] = useState<SessionListItem | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Try to find a completed report first.
        const r = await fetch("/api/sessions?status=completed&sort=newest&limit=1");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const first: SessionListItem | undefined = j.sessions?.[0];
        if (!alive) return;
        if (first) {
          setLatest(first);
          setPhase("redirect");
          router.replace(`/report/${first.id}`);
        } else {
          setPhase("empty");
        }
      } catch (e) {
        if (!alive) return;
        setMsg((e as Error).message);
        setPhase("error");
      }
    })();
    return () => { alive = false; };
  }, [router]);

  if (phase === "loading") {
    return (
      <div className="w-full px-gutter py-space-xl text-center text-on-surface-variant">
        Đang tìm báo cáo mới nhất…
      </div>
    );
  }

  if (phase === "redirect" && latest) {
    return (
      <div className="w-full px-gutter py-space-xl text-center text-on-surface-variant">
        Đang mở báo cáo <span className="text-on-surface">{latest.id}</span>…
      </div>
    );
  }

  return (
    <div className="w-full px-gutter py-space-lg max-w-3xl mx-auto flex flex-col gap-space-lg">
      <div className="card p-space-lg flex flex-col items-center gap-space-md text-center">
        <div className="w-14 h-14 rounded-xl bg-surface-elevated flex items-center justify-center text-primary">
          <span className="material-symbols-outlined text-[28px]">analytics</span>
        </div>
        <Chip tone="indigo">FR-9 · Báo cáo chưa sẵn sàng</Chip>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
          Chưa có báo cáo nào hoàn tất
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-xl">
          Báo cáo được tạo tự động khi một phiên phỏng vấn kết thúc (đủ số câu hoặc bạn bấm
          &ldquo;Dừng sớm &amp; chấm điểm&rdquo;). Hãy bắt đầu một phiên mới hoặc xem lịch sử.
        </p>
        {msg ? <p className="label-code-sm text-error">{msg}</p> : null}
        <div className="flex flex-col sm:flex-row gap-space-sm">
          <Link href="/new" className="btn btn-primary">
            <span className="material-symbols-outlined text-[18px]">play_circle</span>
            Bắt đầu phỏng vấn
          </Link>
          <Link href="/history" className="btn btn-ghost">
            <span className="material-symbols-outlined text-[18px]">history</span>
            Xem lịch sử phiên
          </Link>
        </div>
      </div>

      <div className="card p-space-md flex items-start gap-space-sm" style={{ borderColor: "rgba(244,63,94,0.4)" }}>
        <span className="material-symbols-outlined text-error flex-shrink-0">warning</span>
        <div className="flex flex-col">
          <span className="font-body-sm text-body-sm text-on-surface">Phiên đang diễn ra?</span>
          <span className="label-code-sm text-on-surface-variant">
            Mở <Link href="/session" className="text-primary underline">danh sách phiên</Link> để tiếp tục.
          </span>
        </div>
      </div>
    </div>
  );
}
