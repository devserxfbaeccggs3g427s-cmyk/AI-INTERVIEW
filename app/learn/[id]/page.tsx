"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useByok } from "@/components/ByokConfigContext";
import { encodePracticePrefill, practiceFocusLabel } from "@/lib/practice-prefill";
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
type ModeSlot = { id?: string; status: Status; retryable?: boolean; claimedAt?: number | string };
type OlderLesson = { id: string; mode: Mode; label: string; createdAt?: number | string };
type Catalog = { source: Source; modes: Record<Mode, ModeSlot>; older: OlderLesson[] };
type Question = { stem: string; options: { id: Option; text: string }[] };
type LessonContent = {
  title: string;
  goal: string;
  objectives: string[];
  explanation: string;
  example: string;
  sections: { heading: string; body: string; code?: string }[];
  questions: Question[];
};
type Lesson = { id: string; sessionId: string; status: Status; mode?: Mode; source?: LessonSource; content?: LessonContent };
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
  [/not ready|is unavailable/i, "Bài học chưa sẵn sàng."],
  [/not found/i, "Không tìm thấy nội dung yêu cầu."],
];

function explain(message: string): string {
  return ERROR_TEXT.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    const message = typeof data?.error === "string" && data.error ? data.error : `Yêu cầu thất bại (HTTP ${response.status}).`;
    throw new Error(explain(message));
  }
  return data as T;
}

/** Only role, language and ONE short label from the original item may enter the practice URL. */
function sourcePractice(source: LessonSource): { href: string; warning: string | null } {
  const roleOnly = encodePracticePrefill({ role: source.role, language: source.language, focus: [] });
  const fallback = roleOnly ?? "/new";
  const focus = practiceFocusLabel(source.label);
  if (!focus) {
    return {
      href: fallback,
      warning: "Không dùng được nội dung mục này làm trọng tâm ngắn. Trang tạo phiên mở không có trọng tâm; bạn có thể tự nhập hoặc bỏ trống.",
    };
  }
  const href = encodePracticePrefill({ role: source.role, language: source.language, focus: [focus] });
  if (!href) {
    return {
      href: fallback,
      warning: "Không chuyển được vai trò/trọng tâm của mục này sang trang tạo phiên. Trang sẽ mở không có trọng tâm; bạn tự chọn vai trò và nhập trọng tâm.",
    };
  }
  return { href, warning: null };
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
    if (!lessonId || lessons[lessonId]) return;
    const controller = new AbortController();
    void loadLesson(lessonId, controller.signal);
    return () => controller.abort();
  }, [lessonId, lessons, loadLesson]);

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

  const practice = source
    ? sourcePractice(source)
    : { href: "/new", warning: "Không tải được mục gốc. Trang tạo phiên sẽ mở không có trọng tâm; bạn có thể tự nhập." };

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
          <a href={practice.href} className={styles.primaryAction}>
            Luyện lại chủ đề này <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
          </a>
        </div>
      </header>
      <div className={styles.content}>

      {practice.warning ? <p role="status" className={styles.message}>{practice.warning}</p> : null}
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
            <p>Lệnh tạo dùng provider, model và đích của phiên gốc, với khóa API bạn gửi kèm. Một lần bấm có thể phát sinh phí; mở trang hoặc chuyển cách học không tự gọi AI. Bài đã tạo được lưu và mở lại không mất phí tạo mới.</p>
            {catalog ? <p>Phiên gốc: {catalog.source.config?.provider ?? catalog.source.provider} · {catalog.source.config?.model ?? catalog.source.model}. Nếu cấu hình hiện tại khác, hãy <a className="underline" href="/">mở Cấu hình AI và nhập lại đúng khóa</a>; hệ thống không tự đổi provider.</p> : null}
            {slot?.status === "failed" ? <p className="text-warning">Lần gọi trước có thể đã phát sinh phí. Chỉ thử lại khi bạn muốn gửi một lệnh mới.</p> : null}
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
                {MODE_LABEL[lesson.mode ?? mode]} · đã có bài (nội dung không đổi)
                {lesson.content.title && (lesson.source?.language ?? "vi") === "en" ? " · nội dung tiếng Anh" : ""}
              </span>
              <h2 className={styles.largeHeading}>{lesson.content.title}</h2>
              <p className={`${styles.muted} whitespace-pre-wrap break-words`}>{lesson.content.goal}</p>
              <h3 className={styles.subheading}>Mục tiêu bài học</h3>
              <ul className={styles.objectives}>
                {lesson.content.objectives.map((objective, i) => <li key={i} className="whitespace-pre-wrap break-words">{objective}</li>)}
              </ul>
            </section>
            <section className={styles.lessonSection}>
              <h3 className={styles.subheading}><span className={styles.sectionIcon} aria-hidden="true">01</span> Giải thích</h3>
              <p className="whitespace-pre-wrap break-words">{lesson.content.explanation}</p>
            </section>
            {lesson.content.sections.map((part, i) => (
              <section key={i} className={styles.lessonSection}>
                <h3 className={styles.subheading}><span className={styles.sectionIcon} aria-hidden="true">{String(i + 2).padStart(2, "0")}</span> {part.heading}</h3>
                <p className="whitespace-pre-wrap break-words">{part.body}</p>
                {part.code ? (
                  <pre className={styles.code}><code>{part.code}</code></pre>
                ) : null}
              </section>
            ))}
            <section className={styles.lessonSection}>
              <h3 className={styles.subheading}><span className={styles.sectionIcon} aria-hidden="true">{String(lesson.content.sections.length + 2).padStart(2, "0")}</span> Ví dụ</h3>
              <p className="whitespace-pre-wrap break-words">{lesson.content.example}</p>
            </section>
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
          <a href={practice.href} className={styles.primaryAction}>Luyện lại chủ đề này <span aria-hidden="true">→</span></a>
        </div>
      ) : null}
      </div>
    </main>
  );
}