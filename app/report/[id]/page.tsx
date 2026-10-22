"use client";

/**
 * Screen 04 — Evaluation report.
 *
 * Reads the persisted report from SQLite (parsed through Zod on the server),
 * then renders:
 *   - Overall score + recommendation
 *   - Four pillar cards (content / relevance / clarity / depth)
 *   - Per-turn breakdown
 *   - Strengths / improvements
 *   - Standout quotes
 *   - 3-5 next steps
 */
import { useEffect, useState } from "react";
import { Chip } from "@/components/Chip";
import { useByok } from "@/components/ByokConfigContext";
import { renderMarkdown } from "@/lib/markdown";
import { sessionKeyError } from "@/lib/session-key";
import { EVALUATION_STALE_AFTER_MS } from "@/lib/evaluation-constants";
import { encodePracticePrefill, practiceFocusLabel } from "@/lib/practice-prefill";
import { visibleReport } from "@/lib/report-visibility";
import type { SessionRow, MessageTurnRow } from "@/lib/types-shared";
import type { EvaluationReport, Pillar, TurnEval } from "@/lib/zod-schemas";

interface ApiResp {
  ok: boolean;
  report: EvaluationReport | null;
  error?: string;
}

const RECO_TONE: Record<string, { label: string; tone: "emerald" | "indigo" | "amber" | "rose" | "neutral" }> = {
  "Strong Hire":      { label: "Strong Hire",      tone: "emerald" },
  "Hire":             { label: "Hire",             tone: "emerald" },
  "Lean Hire":        { label: "Lean Hire",        tone: "indigo"  },
  "Lean No-Hire":     { label: "Lean No-Hire",     tone: "amber"   },
  "No-Hire":          { label: "No-Hire",          tone: "rose"    },
  "Needs Improvement":{ label: "Needs Improvement",tone: "rose"    },
};

export default function EvaluationPage({ params }: { params: { id: string } }) {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [turns, setTurns] = useState<MessageTurnRow[]>([]);
  const [loadedReport, setReport] = useState<EvaluationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [checkedAt, setCheckedAt] = useState(Date.now());
  const { cfg } = useByok();

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/sessions/${params.id}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data?.session) throw new Error("Session not found");
        if (!alive) return;
        setSession(data.session);
        setTurns(data.turns ?? []);
        setCheckedAt(Date.now());
        if (data.session.status === "completed") {
          const result = await fetch(`/api/sessions/${params.id}/report`, { cache: "no-store" });
          const reportData = await result.json() as ApiResp;
          if (alive && result.ok && reportData.ok && reportData.report) {
            setReport(reportData.report);
            setError(null);
          } else if (alive) {
            setReport(null);
            setError("Không tải được báo cáo đã hoàn tất. Vui lòng tải lại.");
          }
        } else {
          setReport(null);
          if (data.session.status !== "failed") setError(null);
        }
      } catch (e) {
        if (alive) {
          setReport(null);
          setError((e as Error).message);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [params.id]);

  const retryEvaluation = async () => {
    if (retrying || !session) return;
    const keyError = sessionKeyError(cfg, session);
    if (keyError) { setError(keyError); return; }
    setRetrying(true);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${params.id}/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cfg.apiKey ? { "x-api-key": cfg.apiKey } : {}) },
        body: JSON.stringify({
          provider: session.provider, model: session.model, baseUrl: session.base_url ?? undefined,
          temperature: session.temperature, maxTokens: session.max_tokens, topP: session.top_p,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      const [sessionResponse, reportResponse] = await Promise.all([
        fetch(`/api/sessions/${params.id}`, { cache: "no-store" }),
        fetch(`/api/sessions/${params.id}/report`, { cache: "no-store" }),
      ]);
      const sessionData = await sessionResponse.json();
      const reportData = await reportResponse.json() as ApiResp;
      if (!sessionResponse.ok || !reportResponse.ok || !reportData.ok || !reportData.report) {
        throw new Error("Báo cáo chưa sẵn sàng. Vui lòng tải lại.");
      }
      setSession(sessionData.session);
      setTurns(sessionData.turns ?? []);
      setReport(reportData.report);
      setCheckedAt(Date.now());
      setError(null);
    } catch (e) {
      setReport(null);
      setError((e as Error).message);
      try {
        const latest = await fetch(`/api/sessions/${params.id}`, { cache: "no-store" });
        if (latest.ok) {
          const data = await latest.json();
          setSession(data.session);
          setTurns(data.turns ?? []);
          setCheckedAt(Date.now());
        }
      } catch { /* Keep the retry error visible; polling can recover later. */ }
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return <div className="w-full px-gutter py-space-xl text-center text-on-surface-variant">Đang tải báo cáo…</div>;
  }
  if (!session) {
    return <div className="w-full px-gutter py-space-xl text-center text-error">{error ?? "Không tải được phiên."}</div>;
  }
  const currentReport = visibleReport(session.status, loadedReport, error);
  if (!currentReport) {
    const stale = session.status === "evaluating" &&
      (session.evaluation_started_at == null || checkedAt - session.evaluation_started_at * 1000 > EVALUATION_STALE_AFTER_MS);
    const canRetry = (session.status === "failed" || stale) && !retrying;
    return (
      <div className="w-full px-gutter py-space-xl text-center">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          {retrying ? "AI đang chấm điểm…" : canRetry ? "Chấm điểm chưa hoàn tất" : session.status === "evaluating" ? "AI đang chấm điểm…" : "Báo cáo chưa có"}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-space-sm">
          {retrying ? "Câu trả lời đã được lưu; đang thử chấm điểm lại." :
            canRetry ? "Câu trả lời đã được lưu. Bạn có thể thử chấm điểm lại với khóa API của mình." :
            session.status === "evaluating" ? "Đang đợi báo cáo; trang sẽ tự cập nhật. Nếu quá thời hạn, bạn sẽ có thể thử lại." :
            "Phiên này chưa được chấm điểm tổng kết."}
        </p>
        {error ? <p className="font-body-md text-body-md text-error mt-space-sm">{error}</p> : null}
        {canRetry || retrying ? (
          <button className="btn btn-primary mt-space-md" onClick={retryEvaluation} disabled={retrying}>
            {retrying ? "Đang chấm điểm…" : "Thử chấm điểm lại"}
          </button>
        ) : null}
        <a className="btn btn-ghost mt-space-md" href={`/session/${params.id}`}>Về phiên</a>
      </div>
    );
  }

  // Below this point only a freshly confirmed completed report can create learning links.
  const report = currentReport;
  const reco = RECO_TONE[report.recommendation] ?? { label: report.recommendation, tone: "neutral" as const };
  const answered = turns.filter((t) => t.role === "user").length;
  const asked = turns.filter((t) => t.role === "assistant").length;
  const practiceUrl = (candidate: string) => {
    const label = practiceFocusLabel(candidate);
    return label ? encodePracticePrefill({ role: session.role, language: session.language, focus: [label] }) : null;
  };

  return (
    <div className="w-full px-gutter py-space-lg max-w-7xl mx-auto flex flex-col gap-space-lg">
      {/* Hero */}
      <div className="card p-space-lg flex flex-col lg:flex-row lg:items-center gap-space-lg relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="flex-1 flex flex-col gap-space-sm">
          <div className="flex items-center gap-space-xs flex-wrap">
            <Chip tone="emerald">FR-9 · FR-17 Evaluation</Chip>
            <Chip tone="indigo">{session.id}</Chip>
            <Chip tone="neutral">{session.language === "vi" ? "Tiếng Việt" : "English"}</Chip>
            <Chip tone="amber">{session.mode === "coaching" ? "Coaching" : "Strict"}</Chip>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">{session.role}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {answered} câu trả lời · {asked} câu hỏi ·
            bắt đầu {new Date(session.created_at * 1000).toLocaleString("vi-VN")}
            {session.ended_at
              ? ` · kết thúc ${new Date(session.ended_at * 1000).toLocaleString("vi-VN")}`
              : null}
          </p>
          <p className="label-code-sm text-on-surface-variant">
            Provider: {session.provider} · {session.model}
          </p>
        </div>

        <div className="flex flex-col items-center gap-space-sm">
          <ScoreRing score={report.overall_score} />
          <Chip tone={reco.tone}>{reco.label}</Chip>
          {report.hiring_probability_pct ? (
            <span className="label-code-sm text-on-surface-variant">
              Hiring probability: {report.hiring_probability_pct}%
            </span>
          ) : null}
        </div>
      </div>

      {/* Body grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        <div className="lg:col-span-8 flex flex-col gap-space-lg">
          <Section title="4 tiêu chí (FR-9)" subtitle="Mỗi tiêu chí 0-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
              <PillarCard label="Content"  pillar={report.pillars.content} />
              <PillarCard label="Relevance" pillar={report.pillars.relevance} />
              <PillarCard label="Clarity"   pillar={report.pillars.clarity} />
              <PillarCard label="Depth"     pillar={report.pillars.depth} />
            </div>
          </Section>

          <Section title="Điểm mạnh" subtitle="Những gì ứng viên làm tốt">
            <BulletList items={report.strengths} icon="check_circle" tone="emerald" />
          </Section>

          <Section title="Cần cải thiện" subtitle="Lỗ hổng kiến thức / cách diễn đạt">
            <BulletList items={report.improvements} icon="lightbulb" tone="amber" practiceUrl={practiceUrl} learningUrl={(index) => `/learn/${encodeURIComponent(session.id)}?kind=improvement&index=${index}`} />
          </Section>

          <Section title="Phân tích theo từng câu" subtitle="Điểm 4 tiêu chí + rubric per turn">
            <div className="flex flex-col gap-space-md">
              {report.per_turn.map((t) => (
                <TurnCard key={t.turn_number} turn={t} />
              ))}
            </div>
          </Section>

          <Section title="Trích dẫn nổi bật" subtitle="Pull-quote từ câu trả lời">
            <div className="grid grid-cols-1 gap-space-sm">
              {report.per_turn
                .filter((t) => t.standout_quote && t.standout_quote.length > 0)
                .map((t) => (
                  <blockquote key={t.turn_number} className="card p-space-md flex flex-col gap-space-xs">
                    <p className="font-body-md text-body-md text-on-surface italic">
                      &ldquo;{t.standout_quote}&rdquo;
                    </p>
                    <p className="label-code-sm text-on-surface-variant">— Câu {t.turn_number} · {t.topic}</p>
                  </blockquote>
                ))}
              {report.per_turn.every((t) => !t.standout_quote) ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant italic">
                  Không có trích dẫn nào được AI highlight.
                </p>
              ) : null}
            </div>
          </Section>

          <Section title="3-5 bước hành động tiếp theo" subtitle="Roadmap cá nhân hoá">
            <ol className="flex flex-col gap-space-sm">
              {report.next_steps.map((s, i) => (
                <li key={`${s.title}-${i}`} className="card p-space-md flex items-start gap-space-sm" style={{ borderColor: "var(--border-focus)" }}>
                  <span className="w-6 h-6 rounded-full bg-primary text-white label-code-sm flex items-center justify-center flex-shrink-0 font-bold">{i + 1}</span>
                  <div className="flex flex-col gap-1">
                    <span className="font-body-md text-body-md text-on-surface">{s.title}</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">{s.description}</span>
                    <span className="label-code-sm text-tertiary mt-1">{s.duration}</span>
                    <div className="flex flex-wrap gap-space-xs mt-space-xs">
                      <a href={`/learn/${encodeURIComponent(session.id)}?kind=next_step&index=${i}`} className="btn btn-primary" aria-label={`Học chủ đề này: bước ${i + 1}`}>
                        Học chủ đề này
                      </a>
                      {practiceUrl(s.title) ? (
                        <a href={practiceUrl(s.title)!} className="btn btn-ghost" aria-label={`Luyện chủ đề này: ${practiceFocusLabel(s.title)}`}>
                          Luyện chủ đề này
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        {/* Right column */}
        <aside className="lg:col-span-4 flex flex-col gap-space-md">
          <div className="card p-space-md flex flex-col gap-space-sm">
            <span className="label-caps text-on-surface uppercase">Thông tin phiên</span>
            <Row k="Provider" v={`${session.provider} · ${session.model}`} />
            <Row k="Số câu" v={`${answered} / ${session.planned_rounds}`} />
            <Row k="Ngôn ngữ" v={session.language === "vi" ? "Tiếng Việt" : "English"} />
            <Row k="Chế độ" v={session.mode === "coaching" ? "Coaching" : "Strict"} />
            <Row k="CV" v={session.cv_source === "none" ? "Không" : (session.cv_filename ?? session.cv_source ?? "")} />
            <Row k="Bắt đầu" v={new Date(session.created_at * 1000).toLocaleString("vi-VN")} />
            {session.ended_at ? <Row k="Kết thúc" v={new Date(session.ended_at * 1000).toLocaleString("vi-VN")} /> : null}
            <Row k="Schema" v={report.schema_version} />
            <Row k="Generated" v={new Date(report.generated_at).toLocaleString("vi-VN")} />
          </div>

          <div className="card p-space-md flex flex-col gap-space-sm">
            <span className="label-caps text-on-surface uppercase">Lưu / Xuất</span>
            <button onClick={() => downloadJson(session, turns, report)} className="btn btn-ghost w-full">
              <span className="material-symbols-outlined text-[18px]">download</span> Tải báo cáo JSON
            </button>
            <a href="/new" className="btn btn-primary w-full">
              <span className="material-symbols-outlined text-[18px]">add</span> Tạo phiên mới
            </a>
            <a href="/history" className="btn btn-ghost w-full">
              <span className="material-symbols-outlined text-[18px]">history</span> Về lịch sử
            </a>
          </div>

          <div className="card p-space-md flex flex-col gap-space-sm" style={{ borderColor: "rgba(244,63,94,0.4)" }}>
            <span className="label-caps text-error uppercase">NFR-11 · Minh bạch rủi ro</span>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Instance này là <strong className="text-on-surface">single-tenant / không xác thực</strong>.
              Mọi người trên cùng máy chủ chia sẻ dữ liệu. Không triển khai công khai nếu không có firewall bổ sung.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 48;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = c - (pct / 100) * c;
  const color = pct >= 75 ? "var(--tertiary)" : pct >= 50 ? "var(--primary)" : pct >= 25 ? "var(--warning)" : "var(--destructive)";
  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} stroke="var(--bg-surface-elevated)" strokeWidth="10" fill="none" />
        <circle cx="60" cy="60" r={r} stroke={color} strokeWidth="10" fill="none"
                strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-headline-lg text-headline-lg text-on-surface" style={{ color }}>{Math.round(pct)}</span>
        <span className="label-caps text-on-surface-variant uppercase">/ 100</span>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-headline-md text-headline-md text-on-surface">{title}</h2>
        {subtitle ? <span className="label-code-sm text-on-surface-variant">{subtitle}</span> : null}
      </div>
      {children}
    </div>
  );
}

function PillarCard({ label, pillar }: { label: string; pillar: Pillar }) {
  const color = pillar.score >= 75 ? "var(--tertiary)" : pillar.score >= 50 ? "var(--primary)" : pillar.score >= 25 ? "var(--warning)" : "var(--destructive)";
  return (
    <div className="card p-space-md flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
        <span className="label-caps text-on-surface uppercase">{label}</span>
        <span className="label-code-sm" style={{ color }}>{Math.round(pillar.score)}</span>
      </div>
      <span className="font-body-md text-body-md text-on-surface">{pillar.headline}</span>
      <p className="font-body-sm text-body-sm text-on-surface-variant">{pillar.rationale}</p>
      {pillar.evidence_quote ? (
        <p className="label-code-sm text-on-surface-variant italic">&ldquo;{pillar.evidence_quote}&rdquo;</p>
      ) : null}
      <div className="h-1.5 rounded-full bg-surface-container-lowest overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${Math.max(0, Math.min(100, pillar.score))}%`, background: color }} />
      </div>
    </div>
  );
}

function BulletList({ items, icon, tone, practiceUrl, learningUrl }: { items: string[]; icon: string; tone: "emerald" | "amber"; practiceUrl?: (item: string) => string | null; learningUrl?: (index: number) => string }) {
  const borderColor = tone === "emerald" ? "rgba(16,185,129,0.4)" : "rgba(245,158,11,0.4)";
  const iconColor = tone === "emerald" ? "text-tertiary" : "text-warning";
  return (
    <ul className="flex flex-col gap-space-sm">
      {items.map((s, i) => (
        <li key={i} className="card p-space-md flex items-start gap-space-sm" style={{ borderColor }}>
          <span className={`material-symbols-outlined ${iconColor} flex-shrink-0`}>{icon}</span>
          <div className="flex flex-col gap-1">
            <span className="font-body-md text-body-md text-on-surface">{s}</span>
            {learningUrl || practiceUrl?.(s) ? (
              <div className="flex flex-wrap gap-space-xs mt-space-xs">
                {learningUrl ? (
                  <a href={learningUrl(i)} className="btn btn-primary" aria-label={`Học chủ đề này: điểm cần cải thiện ${i + 1}`}>
                    Học chủ đề này
                  </a>
                ) : null}
                {practiceUrl?.(s) ? (
                  <a href={practiceUrl(s)!} className="btn btn-ghost" aria-label={`Luyện chủ đề này: ${practiceFocusLabel(s)}`}>
                    Luyện chủ đề này
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function TurnCard({ turn }: { turn: TurnEval }) {
  return (
    <div className="card p-space-md flex flex-col gap-space-sm">
      <div className="flex items-center justify-between flex-wrap gap-space-xs">
        <span className="label-caps text-tertiary uppercase">Câu {turn.turn_number}</span>
        <span className="font-body-sm text-body-sm text-on-surface">{turn.topic}</span>
      </div>
      <div className="grid grid-cols-4 gap-space-sm">
        <Mini label="Content"   v={turn.pillar_scores.content} />
        <Mini label="Relevance" v={turn.pillar_scores.relevance} />
        <Mini label="Clarity"   v={turn.pillar_scores.clarity} />
        <Mini label="Depth"     v={turn.pillar_scores.depth} />
      </div>
      {typeof turn.micro_rubric.score === "number" ? (
        <div className="label-code-sm text-on-surface-variant">Coaching score: {turn.micro_rubric.score}/100</div>
      ) : null}
      {turn.micro_rubric.strengths.length > 0 || turn.micro_rubric.improvements.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
          {turn.micro_rubric.strengths.length > 0 ? (
            <div>
              <div className="label-caps text-tertiary uppercase mb-1">Điểm tốt</div>
              <ul className="flex flex-col gap-1">
                {turn.micro_rubric.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-space-xs font-body-sm text-body-sm text-on-surface">
                    <span className="material-symbols-outlined text-[14px] text-tertiary flex-shrink-0 mt-0.5">check</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {turn.micro_rubric.improvements.length > 0 ? (
            <div>
              <div className="label-caps text-warning uppercase mb-1">Cải thiện</div>
              <ul className="flex flex-col gap-1">
                {turn.micro_rubric.improvements.map((s, i) => (
                  <li key={i} className="flex items-start gap-space-xs font-body-sm text-body-sm text-on-surface">
                    <span className="material-symbols-outlined text-[14px] text-warning flex-shrink-0 mt-0.5">lightbulb</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {turn.standout_quote ? (
        <blockquote className="border-l-2 pl-space-sm" style={{ borderColor: "var(--border-focus)" }}>
          <span className="font-body-sm text-body-sm text-on-surface italic">&ldquo;{turn.standout_quote}&rdquo;</span>
        </blockquote>
      ) : null}
    </div>
  );
}

function Mini({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex flex-col">
      <span className="label-caps text-on-surface-variant uppercase">{label}</span>
      <span className="label-code-sm text-on-surface">{Math.round(v)}</span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between items-start gap-space-sm">
      <span className="label-caps text-on-surface-variant uppercase">{k}</span>
      <span className="label-code-sm text-on-surface text-right max-w-[60%] truncate">{v}</span>
    </div>
  );
}

function downloadJson(session: SessionRow, turns: MessageTurnRow[], report: EvaluationReport) {
  const blob = new Blob([JSON.stringify({ session, turns, report }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `interview-${session.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
