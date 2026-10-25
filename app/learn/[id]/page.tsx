"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useByok } from "@/components/ByokConfigContext";
import { encodeLessonPractice } from "@/lib/practice-prefill";
import { getProviderSpec, isProviderEnabled, type ProviderId } from "@/lib/providers/registry";
import styles from "./learning.module.css";

type Kind = "improvement" | "next_step";
type Mode = "fundamentals" | "answering";
type Status = "uncreated" | "generating" | "failed" | "ready";
type Option = "A" | "B" | "C";

/** Catalog item: the current report source plus the state of the two independent modes. */
type Source = {
  kind: Kind;
  index: number;
  label: string;
  description?: string;
  duration?: string;
  role: string;
  language: "vi" | "en";
  revision: string;
  provider?: ProviderId;
  model?: string;
  baseUrl?: string | null;
  config?: { provider: ProviderId; model: string; baseUrl?: string | null };
};
/** Historical source snapshot kept on the lesson: context already merges description/duration. */
type LessonSource = {
  kind: Kind;
  index: number;
  label: string;
  context?: string;
  role: string;
  language: "vi" | "en";
};
type ModeSlot = { id?: string; status: Status; retryable?: boolean; claimedAt?: number | string; failureReason?: string };
type OlderLesson = { id: string; mode: Mode; label: string; createdAt?: number | string };
type Catalog = { source: Source; modes: Record<Mode, ModeSlot>; older: OlderLesson[] };
type Question = { stem: string; options: { id: Option; text: string }[] };
type ContentBase = { title: string; goal: string; objectives: string[]; questions: Question[] };
/** v3: one flexible lesson shape for both learning modes; the body is a list of typed blocks. */
type V3BlockKind = "explain" | "walkthrough" | "compare" | "misconception" | "answer";
type V3Step = { action: string; reason?: string };
type V3CompareOption = { label: string; when?: string; why?: string };
type V3Note = { point: string; reason?: string };
type V3FollowUp = { question: string; answer: string };
type V3Block =
  | { kind: "explain"; heading: string; body: string; why?: string }
  | { kind: "walkthrough"; heading: string; situation: string; input?: string; steps: V3Step[]; outcome: string; why?: string }
  | { kind: "compare"; heading: string; options: V3CompareOption[]; takeaway: string }
  | { kind: "misconception"; heading: string; belief: string; correction: string; evidence?: string }
  | { kind: "answer"; heading: string; question: string; answer: string; notes: V3Note[]; followUps?: V3FollowUp[] };
type LessonContent = ContentBase & (
  | { version: 1; explanation: string; example: string; sections: { heading: string; body: string; code?: string }[] }
  | { version: 2; mode: "fundamentals"; concepts: { term: string; meaning: string }[]; mechanism: string;
      walkthrough: { situation: string; input: string; steps: { action: string; reason: string }[]; result: string; why: string } }
  | { version: 2; mode: "answering"; interviewQuestion: string; modelAnswer: string;
      annotations: { point: string; reason: string }[]; tradeOff: { benefit: string; cost: string; when: string };
      followUps: { question: string; answer: string }[] }
  | { version: 3; mode: Mode; hook?: string; blocks: V3Block[] }
);
type Lesson = { id: string; sessionId: string; status: Status; mode?: Mode; source?: LessonSource; content?: LessonContent; practiceFocus?: string | null };
type PracticeSession = { id: string; role: string; status: string; createdAt: number; overallScore: number | null };
type PracticeSessions = { sessions: PracticeSession[]; nextCursor: string | null; hasMore: boolean };
type LessonResponse = { lesson: Lesson; oldRevision: boolean };
type AttemptQuestion = { selectedOption: Option; correctOption: Option; explanation: string; isCorrect: boolean };
type Attempt = { id: string; clientAttemptId: string; answers: Option[]; score: number; total: number; createdAt: number | string; questions: AttemptQuestion[] };
type ChecksResponse = { attempts: Attempt[] };

const MODES: readonly Mode[] = ["fundamentals", "answering"];
const MODE_LABEL: Record<Mode, string> = { fundamentals: "Chưa biết", answering: "Luyện diễn đạt & Đào sâu" };
const MODE_DESC: Record<Mode, string> = {
  fundamentals: "Nền tảng, khái niệm, cơ chế và ví dụ đơn giản.",
  answering: "Cách diễn đạt câu trả lời, lập luận, tình huống phản biện và câu hỏi đào sâu.",
};
const STATUS_LABEL: Record<Status, string> = { uncreated: "Chưa tạo bài", generating: "Đang tạo…", failed: "Tạo lỗi", ready: "Đã có bài" };
const MODE_ICON: Record<Mode, string> = { fundamentals: "auto_stories", answering: "record_voice_over" };

/** v3 block vocabulary: a fixed set of kinds keeps the outline readable and the CSS stable. */
const V3_KINDS: readonly V3BlockKind[] = ["explain", "walkthrough", "compare", "misconception", "answer"];
const V3_KIND_LABEL: Record<V3BlockKind, string> = {
  explain: "Giải thích",
  walkthrough: "Từng bước",
  compare: "So sánh",
  misconception: "Sai lầm thường gặp",
  answer: "Câu trả lời mẫu",
};
const V3_KIND_ICON: Record<V3BlockKind, string> = {
  explain: "lightbulb",
  walkthrough: "route",
  compare: "compare_arrows",
  misconception: "help",
  answer: "format_quote",
};

/** Server messages are English; keep the reading experience in Vietnamese. */
const ERROR_TEXT: [RegExp, string][] = [
  [/report (?:or lesson )?changed/i, "Báo cáo đã thay đổi. Hãy tải lại chủ đề này."],
  [/retry to try again/i, "Lệnh tạo trước có thể vẫn đang chạy và đã có thể phát sinh phí. Chỉ chọn Thử lại khi bạn thực sự muốn gửi lệnh mới."],
  [/restore the original provider configuration/i, "Hãy mở Cấu hình AI, chọn đúng provider/model của phiên gốc và nhận lại khóa API."],
  [/provider configuration differs/i, "Cấu hình AI đang khác phiên gốc. Hệ thống không tự chuyển sang provider khác."],
  [/lesson (?:is not ready|unavailable)/i, "Bài học chưa sẵn sàng để mở."],
  [/previous or unavailable report/i, "Bài học này thuộc báo cáo trước hoặc báo cáo không còn khả dụng; chỉ có thể xem."],
  [/answer every question/i, "Hãy trả lời đúng một đáp án cho mỗi câu."],
  [/maximum 20 attempts/i, "Bài này đã đạt tối đa 20 lần tự kiểm tra."],
  [/attempt id was already used/i, "Mã lần thử này đã dùng với đáp án khác. Hãy bắt đầu một lần tự kiểm tra mới."],
  [/maintenance in progress/i, "Cơ sở dữ liệu đang bảo trì. Vui lòng thử lại sau."],
  [/could not create lesson/i, "Không tạo được bài học."],
  [/not ready|is unavailable/i, "Bài học chưa sẵn sàng."],
  [/not found/i, "Không tìm thấy nội dung yêu cầu."],
];

/** The server reports why a lesson failed as a code; the reader gets the reason. */
const REASON_TEXT: Record<string, string> = {
  provider_error: "provider báo lỗi khi sinh bài (kết nối, xác thực hoặc máy chủ)",
  timeout: "provider không trả lời trong 90 giây",
  truncated: "AI trả lời bị cắt cụt vì quá dài nên không dựng được bài",
  too_large: "câu trả lời của AI vượt quá 24 KiB mà hệ thống cho phép",
  invalid_format: "AI trả về nội dung không đúng cấu trúc bài học",
  empty: "provider trả về nội dung rỗng",
};

function reasonText(reason?: string | null): string | null {
  if (!reason) return null;
  return REASON_TEXT[reason] ?? `mã lỗi ${reason}`;
}

function explain(message: string): string {
  return ERROR_TEXT.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    const message = typeof data?.error === "string" && data.error ? data.error : `Yêu cầu thất bại (HTTP ${response.status}).`;
    const reason = typeof data?.reason === "string" ? reasonText(data.reason) : null;
    throw new Error(reason ? `${explain(message)} Lý do: ${reason}.` : explain(message));
  }
  return data as T;
}

/** Destination comparison that ignores trailing slashes but never a host change. */
function sameDestination(a: string | null | undefined, b: string | null | undefined): boolean {
  const normalize = (raw: string | null | undefined) => {
    if (!raw) return "";
    try {
      const url = new URL(raw.trim());
      return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
    } catch {
      return raw.trim();
    }
  };
  return normalize(a) === normalize(b);
}

function itemLabel(source: Pick<LessonSource, "kind" | "index">) {
  return `${source.kind === "improvement" ? "Điểm cần cải thiện" : "Bước tiếp theo"} #${source.index + 1}`;
}

/** SQLite stores unix seconds; ISO strings are accepted too. */
function formatWhen(value: number | string | undefined) {
  if (value === undefined) return "";
  const date = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("vi-VN");
}

/* ------------------------------------------------------------------ */
/*  v3 flexible lesson blocks                                          */
/* ------------------------------------------------------------------ */

/** Lesson content is model output, so every field is treated as untrusted before rendering. */
function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}
function asSteps(value: unknown): V3Step[] {
  return asRecords(value)
    .map((item) => {
      const action = asText(item.action);
      const reason = asText(item.reason);
      return reason ? { action, reason } : { action };
    })
    .filter((step) => step.action);
}
function asCompareOptions(value: unknown): V3CompareOption[] {
  return asRecords(value)
    .map((item) => {
      const label = asText(item.label);
      const when = asText(item.when);
      const why = asText(item.why);
      return {
        label,
        ...(when ? { when } : {}),
        ...(why ? { why } : {}),
      };
    })
    .filter((option) => option.label);
}
function asNotes(value: unknown): V3Note[] {
  return asRecords(value)
    .map((item) => {
      const point = asText(item.point);
      const reason = asText(item.reason);
      return reason ? { point, reason } : { point };
    })
    .filter((note) => note.point);
}
function asFollowUps(value: unknown): V3FollowUp[] {
  return asRecords(value)
    .map((item) => ({ question: asText(item.question), answer: asText(item.answer) }))
    .filter((item) => item.question && item.answer);
}

/** Keeps only blocks that carry the fields their renderer needs; unknown kinds are dropped. */
function normalizeV3Blocks(raw: unknown): V3Block[] {
  if (!Array.isArray(raw)) return [];
  const blocks: V3Block[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const kind = String(record.kind ?? record.type ?? "") as V3BlockKind;
    if (!V3_KINDS.includes(kind)) continue;
    const heading = asText(record.heading);
    if (kind === "explain") {
      const body = asText(record.body);
      if (!body) continue;
      const why = asText(record.why);
      blocks.push({ kind, heading, body, ...(why ? { why } : {}) });
      continue;
    }
    if (kind === "walkthrough") {
      const situation = asText(record.situation);
      const outcome = asText(record.outcome);
      const steps = asSteps(record.steps);
      if (!situation || !outcome || !steps.length) continue;
      const input = asText(record.input);
      const why = asText(record.why);
      blocks.push({ kind, heading, situation, steps, outcome, ...(input ? { input } : {}), ...(why ? { why } : {}) });
      continue;
    }
    if (kind === "compare") {
      const options = asCompareOptions(record.options);
      const takeaway = asText(record.takeaway);
      if (!options.length || !takeaway) continue;
      blocks.push({ kind, heading, options, takeaway });
      continue;
    }
    if (kind === "misconception") {
      const belief = asText(record.belief);
      const correction = asText(record.correction);
      if (!belief || !correction) continue;
      const evidence = asText(record.evidence);
      blocks.push({ kind, heading, belief, correction, ...(evidence ? { evidence } : {}) });
      continue;
    }
    const question = asText(record.question);
    const answer = asText(record.answer);
    if (!question || !answer) continue;
    const notes = asNotes(record.notes);
    const followUps = asFollowUps(record.followUps);
    blocks.push({ kind, heading, question, answer, notes, ...(followUps.length ? { followUps } : {}) });
  }
  return blocks;
}

const v3BlockId = (index: number) => `lesson-block-${index + 1}`;

/** Short, skimmable callout: a label plus one focused paragraph. */
function LessonNote({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className={styles.noteBox}>
      <p className={styles.noteLabel}>
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{icon}</span>
        {label}
      </p>
      <div className={styles.noteBody}>{children}</div>
    </div>
  );
}

/** Outline of the lesson blocks; each entry jumps to its section and marks the visible one. */
function LessonOutline({ blocks }: { blocks: V3Block[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !blocks.length) return;
    const targets = blocks
      .map((_, index) => document.getElementById(v3BlockId(index)))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!targets.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [blocks]);

  return (
    <nav className={styles.outline} aria-labelledby="lesson-outline-heading">
      <div className={styles.outlineHeader}>
        <h3 id="lesson-outline-heading" className={styles.outlineTitle}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">list</span>
          Dàn ý bài học
        </h3>
        <span className={styles.outlineHint}>Chọn một phần để nhảy tới nội dung tương ứng</span>
      </div>
      <a className={styles.outlineSkip} href="#quiz-heading">
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">fact_check</span>
        Nhảy tới phần tự kiểm tra
      </a>
      <ol className={styles.outlineList}>
        {blocks.map((block, index) => {
          const id = v3BlockId(index);
          const active = activeId === id;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                className={`${styles.outlineLink} ${active ? styles.outlineLinkActive : ""}`}
                aria-current={active ? "true" : undefined}
              >
                <span className={styles.outlineIndex} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.outlineText}>
                  <span className={styles.outlineKind}>{V3_KIND_LABEL[block.kind]}</span>
                  <span className={styles.outlineHeading}>{block.heading || V3_KIND_LABEL[block.kind]}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Renders one v3 block; each kind keeps its own layout so the page stays skimmable. */
function LessonBlock({ block, index }: { block: V3Block; index: number }) {
  const id = v3BlockId(index);
  const headingId = `${id}-heading`;
  return (
    <section id={id} className={`${styles.lessonSection} ${styles.blockSection}`} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.subheading}>
        <span className={styles.sectionIcon} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        {block.heading || V3_KIND_LABEL[block.kind]}
        <span className={styles.blockKind}>
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{V3_KIND_ICON[block.kind]}</span>
          {V3_KIND_LABEL[block.kind]}
        </span>
      </h3>
      {block.kind === "explain" ? (
        <>
          <p className="whitespace-pre-wrap break-words">{block.body}</p>
          {block.why ? <LessonNote icon="lightbulb" label="Vì sao">{block.why}</LessonNote> : null}
        </>
      ) : null}
      {block.kind === "walkthrough" ? (
        <>
          <div className={styles.blockLead}>
            <span className={styles.blockLabel}>Tình huống</span>
            <p className="whitespace-pre-wrap break-words">{block.situation}</p>
          </div>
          {block.input ? (
            <div className={styles.blockLead}>
              <span className={styles.blockLabel}>Đầu vào</span>
              <p className="whitespace-pre-wrap break-words">{block.input}</p>
            </div>
          ) : null}
          <ol className={styles.teachingList}>
            {block.steps.map((step, stepIndex) => (
              <li key={stepIndex} className={styles.teachingItem}>
                <h4 className={styles.itemTitle}>Bước {stepIndex + 1} · {step.action}</h4>
                {step.reason ? <p className="whitespace-pre-wrap break-words"><strong>Vì sao:</strong> {step.reason}</p> : null}
              </li>
            ))}
          </ol>
          <div className={styles.blockLead}>
            <span className={styles.blockLabel}>Kết quả</span>
            <p className="whitespace-pre-wrap break-words">{block.outcome}</p>
          </div>
          {block.why ? <LessonNote icon="lightbulb" label="Vì sao có kết quả này">{block.why}</LessonNote> : null}
        </>
      ) : null}
      {block.kind === "compare" ? (
        <>
          <ul className={styles.compareGrid}>
            {block.options.map((option, optionIndex) => (
              <li key={optionIndex} className={styles.compareCard}>
                <h4 className={styles.compareLabel}>{option.label}</h4>
                {option.when ? (
                  <p className={styles.compareField}>
                    <span className={styles.blockLabel}>Khi nào dùng</span>
                    <span className="whitespace-pre-wrap break-words">{option.when}</span>
                  </p>
                ) : null}
                {option.why ? (
                  <p className={styles.compareField}>
                    <span className={styles.blockLabel}>Vì sao</span>
                    <span className="whitespace-pre-wrap break-words">{option.why}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <LessonNote icon="fact_check" label="Điều cần nhớ">{block.takeaway}</LessonNote>
        </>
      ) : null}
      {block.kind === "misconception" ? (
        <>
          <div className={styles.misconception}>
            <div className={styles.misconceptionSide}>
              <h4 className={styles.misconceptionTitle}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">cancel</span>
                Niềm tin phổ biến
              </h4>
              <p className="whitespace-pre-wrap break-words">{block.belief}</p>
            </div>
            <div className={`${styles.misconceptionSide} ${styles.misconceptionTruth}`}>
              <h4 className={styles.misconceptionTitle}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span>
                Điều đúng
              </h4>
              <p className="whitespace-pre-wrap break-words">{block.correction}</p>
            </div>
          </div>
          {block.evidence ? <LessonNote icon="search" label="Bằng chứng">{block.evidence}</LessonNote> : null}
        </>
      ) : null}
      {block.kind === "answer" ? (
        <>
          <div className={styles.blockLead}>
            <span className={styles.blockLabel}>Câu hỏi phỏng vấn</span>
            <p className="whitespace-pre-wrap break-words">{block.question}</p>
          </div>
          <blockquote className={`${styles.sampleAnswer} whitespace-pre-wrap break-words`}>{block.answer}</blockquote>
          {block.notes.length ? (
            <>
              <h4 className={styles.blockSubheading}>Vì sao câu trả lời này hiệu quả</h4>
              <ol className={styles.teachingList}>
                {block.notes.map((note, noteIndex) => (
                  <li key={noteIndex} className={styles.teachingItem}>
                    <h5 className={styles.itemTitle}>Ý {noteIndex + 1} · {note.point}</h5>
                    {note.reason ? <p className="whitespace-pre-wrap break-words">{note.reason}</p> : null}
                  </li>
                ))}
              </ol>
            </>
          ) : null}
          {block.followUps?.length ? (
            <>
              <h4 className={styles.blockSubheading}>Câu hỏi đào sâu</h4>
              <ol className={styles.teachingList}>
                {block.followUps.map((item, followUpIndex) => (
                  <li key={followUpIndex} className={styles.teachingItem}>
                    <h5 className={styles.itemTitle}>Hỏi xoáy {followUpIndex + 1} · {item.question}</h5>
                    <p className="whitespace-pre-wrap break-words"><strong>Gợi ý trả lời:</strong> {item.answer}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/**
 * Screen 06 — Learning from ONE report item.
 *
 * The URL carries only session id + item kind + item index (+ an opaque lesson id
 * for read-only history). Opening this page, switching mode and reading a saved
 * lesson never call a provider; only "Tạo bài học"/"Thử lại" does.
 */
export default function LearningPage({ params }: { params: { id: string } }) {
  const { cfg, hydrated } = useByok();

  // Parse the URL after mount (no search-param hook, no implicit request before then).
  const [query, setQuery] = useState<URLSearchParams | null>(null);
  useEffect(() => { setQuery(new URLSearchParams(window.location.search)); }, []);

  const kindParam = query?.get("kind") ?? null;
  const indexParam = query?.get("index") ?? null;
  const oldId = query?.get("lesson") ?? null;
  const valid = query !== null && (kindParam === "improvement" || kindParam === "next_step") &&
    indexParam !== null && /^(0|[1-9]\d*)$/.test(indexParam) && Number.isSafeInteger(Number(indexParam));
  const index = valid ? Number(indexParam) : -1;
  const sessionId = params.id;
  const catalogUrl = valid ? `/api/sessions/${encodeURIComponent(sessionId)}/learning?kind=${kindParam}&index=${index}` : "";
  const backUrl = `/report/${encodeURIComponent(sessionId)}`;

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("fundamentals");
  const [lessons, setLessons] = useState<Record<string, LessonResponse>>({});
  const [practiceSessionsState, setPracticeSessionsState] = useState<{ lessonId: string; page: PracticeSessions } | null>(null);
  const [practiceSessionsErrorState, setPracticeSessionsErrorState] = useState<{ lessonId: string; message: string } | null>(null);
  const [loadingMoreSessionsFor, setLoadingMoreSessionsFor] = useState<string | null>(null);
  const [sessionsRetry, setSessionsRetry] = useState(0);
  // null marks a lesson whose attempt history failed to load, so the UI stops saying "loading".
  const [attemptsByLesson, setAttemptsByLesson] = useState<Record<string, Attempt[] | null>>({});
  const [attemptsLoading, setAttemptsLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<Option[]>([]);
  const [reviewing, setReviewing] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<{ lessonId: string; id: string; answers: Option[] } | null>(null);
  const busyRef = useRef(false);
  const submitRef = useRef(false);
  const sessionsRequest = useRef<AbortController | null>(null);

  const loadCatalog = useCallback(async (signal?: AbortSignal) => {
    if (!catalogUrl) return;
    try {
      const data = await jsonResponse<Catalog>(await fetch(catalogUrl, { cache: "no-store", signal }));
      if (signal?.aborted) return;
      setCatalog(data);
      setCatalogError(null);
    } catch (error) {
      if (signal?.aborted) return;
      setCatalog(null);
      setCatalogError((error as Error).message);
    }
  }, [catalogUrl]);

  useEffect(() => {
    setCatalog(null);
    setCatalogError(null);
    setLessons({});
    setAttemptsByLesson({});
    setLessonError(null);
    setNotice(null);
    if (!catalogUrl) return;
    const controller = new AbortController();
    void loadCatalog(controller.signal);
    return () => controller.abort();
  }, [loadCatalog, catalogUrl]);

  const slot = catalog?.modes[mode];
  const lessonId = oldId ?? slot?.id;
  const historical = Boolean(oldId);
  const lessonResponse = lessonId ? lessons[lessonId] : undefined;
  const lesson = lessonResponse?.lesson;
  const oldRevision = historical || Boolean(lessonResponse?.oldRevision);
  const otherMode: Mode = mode === "fundamentals" ? "answering" : "fundamentals";

  /** Poll only while a create request is still in flight; the poll never triggers one. */
  useEffect(() => {
    if (!catalog) return;
    const pendingSomewhere = MODES.some((name) => {
      const state = catalog.modes[name];
      return state.status === "generating" || (state.status === "failed" && state.retryable === false);
    });
    if (!pendingSomewhere) return;
    const timer = window.setInterval(() => { void loadCatalog(); }, 4000);
    return () => window.clearInterval(timer);
  }, [catalog, loadCatalog]);

  const loadLesson = useCallback(async (targetLessonId: string, signal?: AbortSignal) => {
    setLoadingLesson(true);
    setLessonError(null);
    try {
      const data = await jsonResponse<LessonResponse>(await fetch(`/api/learning/${encodeURIComponent(targetLessonId)}`, { cache: "no-store", signal }));
      if (signal?.aborted) return;
      if (data.lesson.sessionId !== sessionId) throw new Error("Bài học không thuộc phiên này.");
      setLessons((previous) => ({ ...previous, [targetLessonId]: data }));
    } catch (error) {
      if (!signal?.aborted) setLessonError((error as Error).message);
    } finally {
      if (!signal?.aborted) setLoadingLesson(false);
    }
  }, [sessionId]);

  const retryLesson = async () => {
    if (!lessonId) return;
    await loadLesson(lessonId);
  };

  useEffect(() => {
    if (!lessonId || (lessons[lessonId] && !(slot?.status === "ready" && lessons[lessonId].lesson.status !== "ready"))) return;
    const controller = new AbortController();
    void loadLesson(lessonId, controller.signal);
    return () => controller.abort();
  }, [lessonId, slot?.status, lessons, loadLesson]);

  const loadAttempts = useCallback(async (targetLessonId: string) => {
    setAttemptsLoading(targetLessonId);
    try {
      const data = await jsonResponse<ChecksResponse>(await fetch(`/api/learning/${encodeURIComponent(targetLessonId)}/checks`, { cache: "no-store" }));
      setAttemptsByLesson((previous) => ({ ...previous, [targetLessonId]: data.attempts }));
    } catch (error) {
      setAttemptsByLesson((previous) => ({ ...previous, [targetLessonId]: null }));
      setNotice((error as Error).message);
    } finally {
      setAttemptsLoading((current) => current === targetLessonId ? null : current);
    }
  }, []);

  useEffect(() => {
    if (!lessonId || lesson?.status !== "ready" || lessonId in attemptsByLesson) return;
    void loadAttempts(lessonId);
  }, [lessonId, lesson?.status, attemptsByLesson, loadAttempts]);

  useEffect(() => {
    setSelected([]);
    setReviewing(true);
    setPending(null);
    setNotice(null);
  }, [lessonId, mode]);

  const source = useMemo<LessonSource | null>(() => {
    if (historical) return lesson?.source ?? null;
    if (!catalog) return null;
    return {
      kind: catalog.source.kind,
      index: catalog.source.index,
      label: catalog.source.label,
      context: catalog.source.description,
      role: catalog.source.role,
      language: catalog.source.language,
    };
  }, [historical, lesson?.source, catalog]);

  const practiceHref = lesson?.status === "ready" && lesson.practiceFocus && lessonId
    ? encodeLessonPractice(lessonId) : null;
  const practiceSessions = practiceSessionsState && practiceSessionsState.lessonId === lessonId ? practiceSessionsState.page : null;
  const practiceSessionsError = practiceSessionsErrorState && practiceSessionsErrorState.lessonId === lessonId ? practiceSessionsErrorState.message : null;
  const loadingMoreSessions = loadingMoreSessionsFor === lessonId;

  useEffect(() => {
    sessionsRequest.current?.abort();
    if (!lessonId || lesson?.status !== "ready") return;
    const controller = new AbortController();
    sessionsRequest.current = controller;
    setPracticeSessionsErrorState(null);
    (async () => {
      try {
        const data = await jsonResponse<PracticeSessions>(await fetch(`/api/learning/${encodeURIComponent(lessonId)}/sessions`, { cache: "no-store", signal: controller.signal }));
        if (!controller.signal.aborted) setPracticeSessionsState({ lessonId, page: data });
      } catch (cause) {
        if (!controller.signal.aborted) setPracticeSessionsErrorState({ lessonId, message: (cause as Error).message });
      }
    })();
    return () => controller.abort();
  }, [lessonId, lesson?.status, sessionsRetry]);

  const loadMoreSessions = async () => {
    if (!lessonId || !practiceSessions?.nextCursor || loadingMoreSessions) return;
    const id = lessonId;
    const cursor = practiceSessions.nextCursor;
    const controller = new AbortController();
    sessionsRequest.current?.abort();
    sessionsRequest.current = controller;
    setLoadingMoreSessionsFor(id);
    setPracticeSessionsErrorState(null);
    try {
      const page = await jsonResponse<PracticeSessions>(await fetch(`/api/learning/${encodeURIComponent(id)}/sessions?cursor=${encodeURIComponent(cursor)}`, { cache: "no-store", signal: controller.signal }));
      if (!controller.signal.aborted) setPracticeSessionsState((previous) => previous?.lessonId === id
        ? { lessonId: id, page: { ...page, sessions: [...previous.page.sessions, ...page.sessions] } } : previous);
    } catch (cause) {
      if (!controller.signal.aborted) setPracticeSessionsErrorState({ lessonId: id, message: (cause as Error).message });
    } finally {
      setLoadingMoreSessionsFor((current) => current === id ? null : current);
    }
  };

  const attempts = lessonId ? attemptsByLesson[lessonId] : undefined;
  // The checks API returns attempts oldest-first (ORDER BY created_at, rowid).
  const latest = attempts?.length ? attempts[attempts.length - 1] : undefined;
  // loadAttempts overwrites both success and failure, so a retry needs no cache reset.
  const reloadAttempts = async () => {
    if (!lessonId) return;
    await loadAttempts(lessonId);
  };
  const questions = lesson?.content?.questions ?? [];
  const answeredCount = selected.filter(Boolean).length;
  // v3 lessons carry a flexible block list instead of a mode-specific body.
  const lessonContent = lesson?.content ?? null;
  const flexibleContent = lessonContent && lessonContent.version === 3 ? lessonContent : null;
  const flexibleBlocks = useMemo(
    () => (flexibleContent ? normalizeV3Blocks(flexibleContent.blocks) : []),
    [flexibleContent],
  );

  const generate = async () => {
    if (!catalog || oldRevision || !slot || busyRef.current) return;
    if (slot.status === "ready") return;
    if (slot.status !== "uncreated" && slot.retryable !== true) {
      setNotice("Lệnh tạo trước có thể vẫn đang chạy. Hãy đợi một lúc rồi tải lại trạng thái trước khi thử lại.");
      return;
    }
    if (!hydrated) { setNotice("Đang đọc cấu hình AI. Vui lòng thử lại sau giây."); return; }
    const original = catalog.source.config ??
      (catalog.source.provider && catalog.source.model
        ? { provider: catalog.source.provider, model: catalog.source.model, baseUrl: catalog.source.baseUrl }
        : null);
    if (!original) { setNotice("Báo cáo không còn thông tin cấu hình AI của phiên gốc nên không thể tạo bài."); return; }
    if (!isProviderEnabled(original.provider)) {
      setNotice(`Provider ${original.provider} của phiên gốc đang bị tắt trong cấu hình server. Hãy bật lại provider này trước khi tạo bài.`);
      return;
    }
    if (cfg.provider !== original.provider || cfg.model !== original.model ||
        (original.provider === "custom" && !sameDestination(cfg.baseUrl, original.baseUrl))) {
      setNotice(
        `Cấu hình AI hiện tại (${cfg.provider} · ${cfg.model}) khác phiên gốc (${original.provider} · ${original.model}). ` +
        `Hãy mở Cấu hình AI, chọn đúng provider/model${original.provider === "custom" ? " và Base URL" : ""} và nhập lại khóa. ` +
        "Hệ thống không tự chuyển sang provider khác.",
      );
      return;
    }
    if (getProviderSpec(original.provider).requiresApiKey && !cfg.apiKey) {
      setNotice("Chưa có API Key cho provider của phiên gốc. Hãy nhập lại khóa trong Cấu hình AI rồi thử lại.");
      return;
    }
    busyRef.current = true;
    setWorking(true);
    setNotice(null);
    try {
      await jsonResponse(await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/learning`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cfg.apiKey ? { "x-api-key": cfg.apiKey } : {}) },
        body: JSON.stringify({
          revision: catalog.source.revision,
          kind: catalog.source.kind,
          index: catalog.source.index,
          mode,
          ...(slot.status !== "uncreated" ? { retry: true } : {}),
          config: {
            provider: original.provider,
            model: original.model,
            ...(original.provider === "custom" ? { baseUrl: original.baseUrl ?? undefined } : {}),
          },
        }),
      }));
      await loadCatalog();
    } catch (error) {
      setNotice(`${(error as Error).message} Lệnh vừa rồi có thể đã phát sinh phí nếu nó đã đến provider — kiểm tra trạng thái trước khi thử lại.`);
      await loadCatalog();
    } finally {
      busyRef.current = false;
      setWorking(false);
    }
  };

  const submit = async () => {
    if (!lessonId || oldRevision || submitRef.current || !questions.length) return;
    if (selected.length !== questions.length || selected.some((answer) => !answer)) return;
    const reusable = pending && pending.lessonId === lessonId &&
      pending.answers.length === selected.length && pending.answers.every((answer, i) => answer === selected[i]);
    const attempt = reusable && pending ? pending : { lessonId, id: crypto.randomUUID(), answers: [...selected] };
    submitRef.current = true;
    setSubmitting(true);
    setPending(attempt);
    setNotice(null);
    try {
      await jsonResponse(await fetch(`/api/learning/${encodeURIComponent(lessonId)}/checks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientAttemptId: attempt.id, answers: attempt.answers }),
      }));
      const history = await jsonResponse<ChecksResponse>(await fetch(`/api/learning/${encodeURIComponent(lessonId)}/checks`, { cache: "no-store" }));
      setAttemptsByLesson((previous) => ({ ...previous, [lessonId]: history.attempts }));
      setReviewing(true);
      setPending(null);
    } catch (error) {
      // Same clientAttemptId is reused so a resubmit is idempotent, never a second attempt.
      setNotice(`${(error as Error).message} Nếu đã nộp nhưng mất kết nối, hãy nộp lại — cùng mã lần thử nên không tạo thêm lần nữa.`);
    } finally {
      submitRef.current = false;
      setSubmitting(false);
    }
  };

  const creating = working || (slot?.status === "generating" && slot.retryable !== true) ||
    (slot?.status === "failed" && slot.retryable === false);
  const canStart = slot?.status === "uncreated" || (slot?.status === "failed" && slot.retryable === true);
  const staleRetry = slot?.status === "generating" && slot.retryable === true;

  return (
    <main className={`${styles.page} w-full min-w-0`}>
      <header className={styles.ribbon}>
        <div className={styles.ribbonInner}>
          <div className={styles.breadcrumb}>
            <a href={backUrl} className={styles.backLink}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
              Quay lại Báo cáo đánh giá
            </a>
            {source ? <span className={styles.ribbonMeta}>{itemLabel(source)} <span aria-hidden="true">·</span> {source.role}</span> : null}
          </div>
          {practiceHref ? <a href={practiceHref} className={styles.primaryAction}>
            Luyện lại chủ đề này <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
          </a> : null}
        </div>
      </header>
      <div className={styles.content}>

      {lesson?.status === "ready" && !practiceHref ? <p role="status" className={styles.message}>Không thể luyện từ bài này vì chủ đề gốc không hợp lệ.</p> : null}
      {query === null ? <p role="status" className={styles.message}>Đang tải mục từ báo cáo…</p> : null}
      {query !== null && !valid ? <p role="alert" className={`${styles.message} text-error`}>Đường dẫn không hợp lệ. Hãy mở một mục từ trang báo cáo.</p> : null}
      {catalogError ? (
        <div role="alert" className={`${styles.message} flex flex-wrap items-center gap-space-sm text-error`}>
          <span>{catalogError}</span>
          <button type="button" className="btn btn-ghost text-body-sm" onClick={() => void loadCatalog()}>Tải lại</button>
        </div>
      ) : null}
      {valid && !catalog && !catalogError ? (
        <p role="status" className={styles.message}>Đang tải mục từ báo cáo…</p>
      ) : null}

      {source ? (
        <section className={styles.hero} aria-labelledby="topic-heading">
          <div className={styles.heroMeta}>
            <span className={styles.eyebrow}>{itemLabel(source)}</span>
            <span className={styles.metaValue}>{source.role} · {source.language === "vi" ? "Tiếng Việt" : "English"}</span>
            {catalog && !historical && catalog.source.duration ? <span className={styles.metaValue}>Thời lượng gợi ý: {catalog.source.duration}</span> : null}
          </div>
          <h1 id="topic-heading" className={styles.heroTitle}>{source.label}</h1>
          {source.context ? <div className={styles.sourceCallout}>
            <div className={styles.calloutHeading}><span className="material-symbols-outlined text-[20px]" aria-hidden="true">error_outline</span> Gợi ý gốc từ báo cáo phỏng vấn</div>
            <p className="whitespace-pre-wrap break-words">{source.context}</p>
          </div> : null}
          <p className={styles.disclaimer}>Gợi ý AI từ một mục của báo cáo, chưa được kiểm chứng; roadmap không phải chương trình bắt buộc.</p>
        </section>
      ) : null}

      {oldRevision ? (
        <p role="status" className={`${styles.message} text-warning`}>
          Từ báo cáo trước · chỉ xem. Bài và kết quả cũ không được tính vào mục của báo cáo hiện tại, và không thể tạo bài hoặc nộp tự kiểm tra mới ở đây.
        </p>
      ) : null}

      <section className={styles.modeSection} aria-labelledby="mode-heading">
        <div className={styles.sectionHeading}>
          <h2 id="mode-heading">Chọn cách học độc lập <span className={styles.muted}>(không ràng buộc thứ tự)</span></h2>
          <span className={styles.localBadge}><span className="material-symbols-outlined text-[16px]" aria-hidden="true">database</span> Trạng thái lưu riêng từng cách</span>
        </div>
        <div className={styles.modeGrid} role="group" aria-label="Cách học">
          {MODES.map((name) => {
            const current = catalog?.modes[name];
            const active = historical ? name === lesson?.mode : mode === name;
            const status = historical
              ? name === lesson?.mode
                ? `${STATUS_LABEL.ready} · từ báo cáo trước (đang xem)`
                : `${STATUS_LABEL[current?.status ?? "uncreated"]} · báo cáo hiện tại`
              : STATUS_LABEL[current?.status ?? "uncreated"];
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  // Leaving a historical lesson returns to the current report item.
                  if (oldId) {
                    if (name !== lesson?.mode) window.location.assign(`/learn/${encodeURIComponent(sessionId)}?kind=${kindParam}&index=${index}`);
                    return;
                  }
                  setMode(name);
                }}
                className={`${styles.modeCard} ${active ? styles.modeActive : ""}`}
              >
                <span className={styles.modeTop}>
                  <span className={styles.modeIcon}><span className="material-symbols-outlined" aria-hidden="true">{MODE_ICON[name]}</span></span>
                  <span className={`${styles.statusPill} ${current?.status === "ready" ? styles.readyPill : ""}`}>{status}</span>
                </span>
              <span className={styles.modeName}>{name === "fundamentals" ? "1." : "2."} {MODE_LABEL[name]}</span>
              <span className={styles.modeDescription}>{MODE_DESC[name]}</span>
              <span className={styles.modeFooter}>{active ? "Đang hiển thị bên dưới" : "Chọn để xem cách học này"}<span aria-hidden="true"> →</span></span>
              </button>
            );
          })}
        </div>
        <p className={styles.modeNote}>
          Hai cách học luôn mở, không cần hoàn thành cách này để dùng cách kia. Chuyển cách chỉ đổi nội dung hiển thị, không tạo bài mới và không xóa bài hay kết quả đã lưu.
        </p>
      </section>

      {notice ? <p role="alert" className={`${styles.message} text-error`}>{notice}</p> : null}

      {loadingLesson ? (
        <p role="status" className={styles.message}>
          {historical ? "Đang tải bài từ báo cáo trước…" : "Đang tải bài học đã lưu…"}
        </p>
      ) : null}
      {lessonError ? (
        <div role="alert" className={`${styles.message} flex flex-wrap items-center gap-space-sm text-error`}>
          <span>{lessonError}</span>
          <button type="button" className="btn btn-ghost text-body-sm" onClick={() => void retryLesson()}>Tải lại</button>
        </div>
      ) : null}

      {!historical && creating ? (
        <section className={styles.statePanel} role="status">
          <h2 className="font-headline-md text-headline-md">Đang tạo bài học…</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            AI đang soạn bài theo cách học đang chọn. Bạn có thể rời trang rồi quay lại; hệ thống không tự gửi thêm lệnh tạo.
          </p>
        </section>
      ) : null}

      {!historical && !working && staleRetry ? (
        <section className={styles.statePanel}>
          <h2 className="font-headline-md text-headline-md">Lệnh tạo trước không còn hoạt động</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Chưa có bài học nào được lưu. Lệnh cũ đã quá thời hạn; chỉ thử lại khi bạn muốn gửi một lệnh mới.
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Lệnh trước có thể đã phát sinh phí.</p>
          <button type="button" className={styles.primaryAction} onClick={() => void generate()}>Thử lại</button>
        </section>
      ) : null}

      {!historical && !working && canStart ? (
        <section className={styles.emptyPanel} aria-labelledby="empty-heading">
          <div className={styles.emptyHeader}>
            <span className={styles.eyebrow}>{slot?.status === "failed" ? "Trạng thái: Tạo lỗi" : "Trạng thái: Chưa khởi tạo"}</span>
            <span className={styles.localBadge}>BYOK · Chỉ tạo khi bấm</span>
          </div>
          <div className={styles.emptyBody}>
            <span className={styles.emptyIcon}><span className="material-symbols-outlined" aria-hidden="true">{slot?.status === "failed" ? "error_outline" : "auto_stories"}</span></span>
            <h2 id="empty-heading" className={styles.largeHeading}>{slot?.status === "failed" ? "Tạo bài chưa thành công" : "Bài học chưa được khởi tạo"}</h2>
            <p className={styles.muted}>{source?.label} · {MODE_LABEL[mode]}</p>
            <p className={styles.muted}>{MODE_DESC[mode]} Nội dung chỉ được tạo khi bạn bấm nút bên dưới.</p>
            <button type="button" className={styles.primaryAction} onClick={() => void generate()}>
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">bolt</span>
              {slot?.status === "failed" ? "Thử lại" : `Tạo bài học: ${MODE_LABEL[mode]}`}
            </button>
          </div>
          <div className={styles.costNotice}>
            <div className={styles.calloutHeading}><span className="material-symbols-outlined text-[20px]" aria-hidden="true">monetization_on</span> Lưu ý chi phí API (BYOK)</div>
            <p>Lệnh tạo dùng provider, model và đích của phiên gốc, với khóa API bạn gửi kèm. Bài chi tiết có thể dùng tối đa 4.000 token đầu ra trong một lệnh nên có thể phát sinh phí cao hơn bài ngắn trước đây; mở trang hoặc chuyển cách học không tự gọi AI. Bài đã tạo được lưu và mở lại không mất phí tạo mới.</p>
            {catalog ? <p>Phiên gốc: {catalog.source.config?.provider ?? catalog.source.provider} · {catalog.source.config?.model ?? catalog.source.model}. Nếu cấu hình hiện tại khác, hãy <a className="underline" href="/">mở Cấu hình AI và nhập lại đúng khóa</a>; hệ thống không tự đổi provider.</p> : null}
            {slot?.status === "failed" ? (
              <p className="text-warning">
                Lần gọi trước có thể đã phát sinh phí.
                {slot.failureReason
                  ? ` Lý do: ${reasonText(slot.failureReason)}.`
                  : " Lý do: không được ghi lại (lần tạo này có trước khi hệ thống bắt đầu ghi lý do)."}
                Chỉ thử lại khi bạn muốn gửi một lệnh mới.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {!historical && !working && slot?.status === "ready" && !lessonId ? (
        <p role="status" className={styles.message}>Đang tải bài học đã lưu…</p>
      ) : null}

      {lesson?.status === "ready" && lesson.content ? (
        <>
          <article lang={source?.language ?? "vi"} className={styles.lesson}>
            <section className={styles.lessonIntro}>
              <span className={styles.readyBadge}><span className="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span>
                {lesson.content.version === 3 ? `${MODE_LABEL[lesson.content.mode]} · bài linh hoạt` : MODE_LABEL[lesson.mode ?? mode]} · đã có bài (nội dung không đổi)
                {lesson.content.title && (lesson.source?.language ?? "vi") === "en" ? " · nội dung tiếng Anh" : ""}
              </span>
              <h2 className={styles.largeHeading}>{lesson.content.title}</h2>
              <p className={`${styles.muted} whitespace-pre-wrap break-words`}>{lesson.content.goal}</p>
              {lesson.content.version === 3 && lesson.content.hook ? (
                <p className={`${styles.hook} whitespace-pre-wrap break-words`}>{lesson.content.hook}</p>
              ) : null}
              <h3 className={styles.subheading}>Mục tiêu bài học</h3>
              <ul className={styles.objectives}>
                {lesson.content.objectives.map((objective, i) => <li key={i} className="whitespace-pre-wrap break-words">{objective}</li>)}
              </ul>
            </section>
            {lesson.content.version === 1 ? (
              <>
                <section className={styles.lessonSection}>
                  <h3 className={styles.subheading}><span className={styles.sectionIcon} aria-hidden="true">01</span> Giải thích</h3>
                  <p className="whitespace-pre-wrap break-words">{lesson.content.explanation}</p>
                </section>
                {lesson.content.sections.map((part, i) => (
                  <section key={i} className={styles.lessonSection}>
                    <h3 className={styles.subheading}><span className={styles.sectionIcon} aria-hidden="true">{String(i + 2).padStart(2, "0")}</span> {part.heading}</h3>
                    <p className="whitespace-pre-wrap break-words">{part.body}</p>
                    {part.code ? <pre className={styles.code}><code>{part.code}</code></pre> : null}
                  </section>
                ))}
                <section className={styles.lessonSection}>
                  <h3 className={styles.subheading}><span className={styles.sectionIcon} aria-hidden="true">{String(lesson.content.sections.length + 2).padStart(2, "0")}</span> Ví dụ</h3>
                  <p className="whitespace-pre-wrap break-words">{lesson.content.example}</p>
                </section>
              </>
            ) : lesson.content.version === 3 ? (
              <>
                {flexibleBlocks.length ? <LessonOutline blocks={flexibleBlocks} /> : null}
                {flexibleBlocks.map((block, index) => <LessonBlock key={v3BlockId(index)} block={block} index={index} />)}
                {flexibleBlocks.length === 0 ? (
                  <p className={styles.muted}>Bài học này không có phần nội dung nào để hiển thị.</p>
                ) : null}
              </>
            ) : lesson.content.mode === "fundamentals" ? (
              <>
                <section className={styles.lessonSection}>
                  <h3 className={styles.subheading}>01 · Khái niệm cần biết</h3>
                  <dl className={styles.teachingList}>
                    {lesson.content.concepts.map((item, i) => (
                      <div key={i} className={styles.teachingItem}>
                        <dt className={styles.itemTitle}>{item.term}</dt>
                        <dd className="whitespace-pre-wrap break-words">{item.meaning}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
                <section className={styles.lessonSection}>
                  <h3 className={styles.subheading}>02 · Cơ chế hoạt động</h3>
                  <p className="whitespace-pre-wrap break-words">{lesson.content.mechanism}</p>
                </section>
                <section className={styles.lessonSection}>
                  <h3 className={styles.subheading}>03 · Demo từng bước</h3>
                  <p className="whitespace-pre-wrap break-words">{lesson.content.walkthrough.situation}</p>
                  <div className={styles.teachingItem}><h4 className={styles.itemTitle}>Đầu vào / tình huống ban đầu</h4><p className="whitespace-pre-wrap break-words">{lesson.content.walkthrough.input}</p></div>
                  <ol className={styles.teachingList}>
                    {lesson.content.walkthrough.steps.map((step, i) => (
                      <li key={i} className={styles.teachingItem}>
                        <h4 className={styles.itemTitle}>Bước {i + 1} · Làm gì?</h4>
                        <p className="whitespace-pre-wrap break-words">{step.action}</p>
                        <p className="whitespace-pre-wrap break-words"><strong>Vì sao:</strong> {step.reason}</p>
                      </li>
                    ))}
                  </ol>
                  <div className={styles.teachingItem}><h4 className={styles.itemTitle}>Kết quả</h4><p className="whitespace-pre-wrap break-words">{lesson.content.walkthrough.result}</p><p className="whitespace-pre-wrap break-words"><strong>Vì sao có kết quả này:</strong> {lesson.content.walkthrough.why}</p></div>
                </section>
              </>
            ) : (
              <>
                <section className={styles.lessonSection}>
                  <h3 className={styles.subheading}>01 · Câu hỏi phỏng vấn</h3>
                  <p className="whitespace-pre-wrap break-words">{lesson.content.interviewQuestion}</p>
                </section>
                <section className={styles.lessonSection}>
                  <h3 className={styles.subheading}>02 · Câu trả lời mẫu</h3>
                  <blockquote className={`${styles.sampleAnswer} whitespace-pre-wrap break-words`}>{lesson.content.modelAnswer}</blockquote>
                </section>
                <section className={styles.lessonSection}>
                  <h3 className={styles.subheading}>03 · Vì sao câu trả lời hiệu quả?</h3>
                  <ol className={styles.teachingList}>
                    {lesson.content.annotations.map((item, i) => (
                      <li key={i} className={styles.teachingItem}><h4 className={styles.itemTitle}>Ý {i + 1} · {item.point}</h4><p className="whitespace-pre-wrap break-words">{item.reason}</p></li>
                    ))}
                  </ol>
                </section>
                <section className={styles.lessonSection}>
                  <h3 className={styles.subheading}>04 · Đánh đổi cần cân nhắc</h3>
                  <dl className={styles.teachingList}>
                    <div className={styles.teachingItem}><dt className={styles.itemTitle}>Lợi ích</dt><dd className="whitespace-pre-wrap break-words">{lesson.content.tradeOff.benefit}</dd></div>
                    <div className={styles.teachingItem}><dt className={styles.itemTitle}>Chi phí / hạn chế</dt><dd className="whitespace-pre-wrap break-words">{lesson.content.tradeOff.cost}</dd></div>
                    <div className={styles.teachingItem}><dt className={styles.itemTitle}>Khi nào phù hợp?</dt><dd className="whitespace-pre-wrap break-words">{lesson.content.tradeOff.when}</dd></div>
                  </dl>
                </section>
                <section className={styles.lessonSection}>
                  <h3 className={styles.subheading}>05 · Câu hỏi đào sâu</h3>
                  <ol className={styles.teachingList}>
                    {lesson.content.followUps.map((item, i) => (
                      <li key={i} className={styles.teachingItem}><h4 className={styles.itemTitle}>Hỏi xoáy {i + 1} · {item.question}</h4><p className="whitespace-pre-wrap break-words"><strong>Gợi ý trả lời:</strong> {item.answer}</p></li>
                    ))}
                  </ol>
                </section>
              </>
            )}
          </article>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Bài do AI tạo có thể sai hoặc không còn đúng. Hãy kiểm chứng các phát biểu, ví dụ và code trước khi dùng; code chỉ là minh họa, không phải bản đã kiểm định cho môi trường thật.
          </p>

          <section className={styles.quiz} aria-labelledby="quiz-heading">
            <div className={styles.sectionHeading}><h2 id="quiz-heading"><span className="material-symbols-outlined text-primary" aria-hidden="true">quiz</span> Tự kiểm tra ngắn</h2><span className={styles.localBadge}>{questions.length} câu hỏi · lưu kết quả</span></div>
            {attempts === undefined || attemptsLoading === lessonId ? (
              <p role="status" className="text-on-surface-variant">Đang tải lịch sử tự kiểm tra…</p>
            ) : attempts === null ? (
              <div role="alert" className="flex flex-wrap items-center gap-space-sm">
                <span>Không tải được lịch sử tự kiểm tra.</span>
                <button type="button" className="btn btn-ghost text-body-sm" onClick={() => void reloadAttempts()}>Tải lại</button>
              </div>
            ) : (
              <>
                {reviewing && latest ? (
                  <div role="status" className={styles.resultBanner}>
                    Đúng {latest.score}/{latest.total} · lần thử thứ {attempts.length}. Đây là kết quả tự kiểm tra, không phải đánh giá mức độ thành thạo.
                  </div>
                ) : null}
                {!latest ? (
                  <p className="text-on-surface-variant">
                    {oldRevision
                      ? "Chưa có lần tự kiểm tra nào được lưu cho bài này."
                      : reviewing ? "Chưa có lần tự kiểm tra nào. Đáp án và giải thích chỉ hiện sau khi bạn nộp." : "Đáp án và giải thích chỉ hiện sau khi bạn nộp."}
                  </p>
                ) : null}
                {!reviewing ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Chọn đủ {questions.length} câu rồi nộp.
                    {attempts.length > 0 ? " Bạn đã thấy đáp án lần trước, nên lần này chỉ để ôn tập, không phải đánh giá độc lập." : ""}
                  </p>
                ) : null}
                {questions.map((question, qi) => {
                  const result = reviewing ? latest?.questions[qi] : undefined;
                  return (
                    <fieldset key={qi} className={styles.question} disabled={reviewing || oldRevision || submitting}>
                      <legend className={styles.questionTitle}>Câu {qi + 1}: {question.stem}</legend>
                      {question.options.map((option) => (
                        <label key={option.id} className={styles.option}>
                          <input
                            type="radio"
                            className="mt-1 shrink-0 accent-primary"
                            name={`q-${lessonId}-${qi}`}
                            value={option.id}
                            checked={(reviewing ? latest?.answers[qi] : selected[qi]) === option.id}
                            onChange={() => setSelected((previous) => {
                              const next = [...previous];
                              next[qi] = option.id;
                              setPending(null);
                              return next;
                            })}
                          />
                          <span className="break-words">{option.id}. {option.text}</span>
                        </label>
                      ))}
                      {result ? (
                        <p role="status" className={`${styles.feedback} ${result.isCorrect ? styles.correct : styles.incorrect}`}>
                          {result.isCorrect ? "Đúng" : "Chưa đúng"} · bạn chọn {result.selectedOption}, đáp án đúng là {result.correctOption}. {result.explanation}
                        </p>
                      ) : null}
                    </fieldset>
                  );
                })}
                {!oldRevision && !reviewing ? (
                  <button type="button" className={styles.primaryAction} disabled={submitting || answeredCount !== questions.length} onClick={() => void submit()}>
                    {submitting ? "Đang nộp…" : `Nộp ${answeredCount}/${questions.length} câu đã trả lời`}
                  </button>
                ) : null}
                {!oldRevision && reviewing ? (
                  <button type="button" className={styles.secondaryAction} onClick={() => { setSelected([]); setReviewing(false); setPending(null); setNotice(null); }}>
                    {attempts.length > 0 ? "Làm lại để ôn tập (đã thấy đáp án)" : "Bắt đầu tự kiểm tra"}
                  </button>
                ) : null}
                {attempts.length > 0 ? (
                  <div className={styles.history}>
                    <h3 className="font-headline-sm text-headline-sm">Lịch sử tự kiểm tra</h3>
                    <ol className="flex flex-col gap-space-xs">
                      {[...attempts].reverse().map((attempt, i) => (
                        <li key={attempt.id} className="font-body-sm text-body-sm text-on-surface-variant">
                          Lần {attempts.length - i}: đúng {attempt.score}/{attempt.total} · {formatWhen(attempt.createdAt)}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </>
      ) : null}

      {lesson?.status === "ready" ? (
        <section className={styles.statePanel} aria-label="Phiên phỏng vấn từ bài học này">
          <h2 className="font-headline-sm text-headline-sm">Phiên phỏng vấn từ bài học này</h2>
          {!practiceSessions && !practiceSessionsError ? <p role="status">Đang tải các phiên đã luyện…</p> : null}
          {practiceSessions?.sessions.length === 0 ? <p className="font-body-sm text-body-sm text-on-surface-variant">Chưa có phiên phỏng vấn nào bắt đầu từ bài học này.</p> : null}
          {practiceSessions?.sessions.length ? (
            <ul className="flex flex-col gap-space-sm">
              {practiceSessions.sessions.map((entry) => (
                <li key={entry.id} className="card p-space-sm min-w-0">
                  <a className="underline break-words" href={`/${entry.status === "completed" ? "report" : "session"}/${encodeURIComponent(entry.id)}`}>
                    {entry.role} · {entry.id}
                  </a>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {formatWhen(entry.createdAt)} · {entry.status === "completed" ? "Đã hoàn tất" : entry.status === "active" ? "Đang phỏng vấn" : entry.status === "evaluating" ? "Đang chấm điểm" : "Chấm điểm lỗi"}
                    {entry.overallScore != null ? ` · ${entry.overallScore}/100` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          {practiceSessionsError ? <div role="alert" className="flex flex-wrap items-center gap-space-sm text-error">
            <span>{practiceSessionsError}</span>
            <button type="button" className={styles.secondaryAction} onClick={() => setSessionsRetry((value) => value + 1)}>Tải lại</button>
          </div> : null}
          {practiceSessions?.hasMore ? (
            <button type="button" className={styles.secondaryAction} onClick={() => void loadMoreSessions()} disabled={loadingMoreSessions}>
              {loadingMoreSessions ? "Đang tải…" : "Xem thêm phiên"}
            </button>
          ) : null}
        </section>
      ) : null}

      {catalog?.older.length ? (
        <section className={styles.statePanel}>
          <h2 className="font-headline-sm text-headline-sm">Bài đã tạo từ báo cáo trước</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Chỉ xem; các bài này không thuộc phiên bản báo cáo hiện tại.</p>
          <ul className="flex flex-col gap-space-xs">
            {catalog.older.map((older) => (
              <li key={older.id}>
                <a className="underline break-words" href={`/learn/${encodeURIComponent(sessionId)}?kind=${kindParam}&index=${index}&lesson=${encodeURIComponent(older.id)}`}>
                  {MODE_LABEL[older.mode]} · {older.label}{older.createdAt ? ` · ${formatWhen(older.createdAt)}` : ""}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {source && !historical && lesson?.status === "ready" ? (
        <div className={styles.bottomActions}>
          <button type="button" className={styles.secondaryAction} onClick={() => setMode(otherMode)}>Chuyển sang {MODE_LABEL[otherMode]} →</button>
          {practiceHref ? <a href={practiceHref} className={styles.primaryAction}>Luyện lại chủ đề này <span aria-hidden="true">→</span></a> : null}
        </div>
      ) : null}
      </div>
    </main>
  );
}