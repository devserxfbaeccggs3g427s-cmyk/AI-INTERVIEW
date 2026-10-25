"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useByok } from "@/components/ByokConfigContext";
import { Chip } from "@/components/Chip";
import { ProviderIcon } from "@/components/ProviderIcon";
import { getProviderSpec, isProviderEnabled } from "@/lib/providers/registry";
import { FocusSchema } from "@/lib/focus";
import { decodeLessonPractice, decodePracticePrefill } from "@/lib/practice-prefill";

const ROLE_SUGGESTIONS = [
  "Senior Frontend (React/TS)",
  "Backend Go / Distributed",
  "Fullstack Node/Next.js",
  "AI/ML Engineer (LLMOps)",
  "Staff System Architect",
  "Product Manager (Technical)",
  "DevOps / SRE",
];

type Lang = "vi" | "en";
type Mode = "strict" | "coaching";
type CvSource = "none" | "paste" | "pdf";
type Rounds = 5 | 8 | 12;

const MAX_CV_CHARS = 20_000;
const MAX_PROMPT_CV_CHARS = 6_000;
/** Authoritative cap is 10 MiB decoded bytes; the server enforces it.
 *  We use 14 MiB base64 length as a coarse client proxy. */
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDF_DATAURL_LEN = 14 * 1024 * 1024;

interface PdfPreview {
  text: string;
  charCount: number;
  truncated: boolean;
  promptCharCount: number;
  promptTruncated: boolean;
  digest: string;
}

interface PracticeLesson {
  id: string;
  sessionId: string;
  source: { kind: "improvement" | "next_step"; index: number; label: string; role: string; language: Lang };
  practiceFocus: string;
}

/** Browser-native SHA-256 hex digest (NFR-2 friendly, no third-party deps). */
async function sha256Hex(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Best-effort truncation of the prompt view (mirrors what the AI gets to see). */
function promptSlice(source: string, max: number): { text: string; truncated: boolean } {
  if (source.length <= max) return { text: source, truncated: false };
  return { text: source.slice(0, max), truncated: true };
}

function isPdfDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:application\/pdf;base64,/i.test(value);
}

export default function StartInterviewPage() {
  const router = useRouter();
  const { cfg, hydrated } = useByok();

  const [role, setRole] = useState("Senior Fullstack Engineer (React / Node.js / System Design)");
  const [lang, setLang] = useState<Lang>("vi");
  const [mode, setMode] = useState<Mode>("coaching");
  const [rounds, setRounds] = useState<Rounds>(8);
  const [focus, setFocus] = useState<string[]>([]);
  const [lessonLink, setLessonLink] = useState<string | null>(null);
  const [practiceLesson, setPracticeLesson] = useState<PracticeLesson | null>(null);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [cvSource, setCvSource] = useState<CvSource>("none");
  const [cvText, setCvText] = useState("");
  const [cvFilename, setCvFilename] = useState<string | null>(null);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfMeta, setPdfMeta] = useState<{ size: number } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<PdfPreview | null>(null);
  const [editableText, setEditableText] = useState("");
  const [editing, setEditing] = useState(false);
  const [previewDigest, setPreviewDigest] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Track the in-flight preview request to discard stale responses on re-pick.
  const previewSeq = useRef(0);

  // Parse the navigation URL only after mount; no search-param hook or implicit POST.
  useEffect(() => {
    const search = window.location.search;
    if (new URLSearchParams(search).has("lesson")) {
      const lessonId = decodeLessonPractice(search);
      if (!lessonId) setLessonError("Đường dẫn bài học không hợp lệ. Hãy mở lại từ bài học.");
      else setLessonLink(lessonId);
      return;
    }
    const prefill = decodePracticePrefill(search);
    if (!prefill) return;
    setRole(prefill.role);
    setLang(prefill.language);
    setFocus(prefill.focus);
  }, []);

  useEffect(() => {
    if (!lessonLink) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/learning/${encodeURIComponent(lessonLink)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Bài học không còn tồn tại.");
        const data = await response.json();
        if (data.lesson?.status !== "ready" || !data.lesson.practiceFocus) throw new Error("Bài học chưa sẵn sàng để luyện lại.");
        if (controller.signal.aborted) return;
        setPracticeLesson(data.lesson as PracticeLesson);
        setRole(data.lesson.source.role);
        setLang(data.lesson.source.language);
      } catch (cause) {
        if (!controller.signal.aborted) setLessonError((cause as Error).message);
      }
    })();
    return () => controller.abort();
  }, [lessonLink]);

  // Block submit if no BYOK config
  useEffect(() => {
    if (hydrated && (!cfg.model || (getProviderSpec(cfg.provider).requiresApiKey && !cfg.apiKey))) {
      // Soft warning — don't force redirect; show inline.
    }
  }, [hydrated, cfg]);

  /** Clear every piece of PDF state. Used on error, re-pick, and switch-away. */
  const clearPdfState = useCallback(() => {
    previewSeq.current += 1; // invalidate any in-flight preview
    setCvFilename(null);
    setPdfMeta(null);
    setPdfDataUrl(null);
    setPdfPreview(null);
    setEditableText("");
    setEditing(false);
    setPreviewDigest(null);
    setPdfLoading(false);
  }, []);

  /** Switch CV source. Make sure stale PDF state doesn't leak into other modes. */
  const pickCvSource = useCallback((next: CvSource) => {
    setCvSource(next);
    setError(null);
    // Don't clear on a same-tab re-selection but DO clear when leaving PDF.
    if (next !== "pdf") clearPdfState();
  }, [clearPdfState]);

  const onPickPdf = async (file: File) => {
    // Always reset stale state first so a failed pick cannot POST prior data.
    clearPdfState();
    setError(null);

    if (file.type !== "application/pdf") {
      setError("Chỉ chấp nhận file PDF");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError("PDF tối đa 10 MB");
      return;
    }

    setCvFilename(file.name);
    setPdfMeta({ size: file.size });

    const seq = previewSeq.current;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      if (previewSeq.current !== seq) return; // user picked something else meanwhile
      if (value.length > MAX_PDF_DATAURL_LEN) {
        // Coarse proxy for >10 MiB decoded; server is the authoritative gate.
        clearPdfState();
        setError("PDF tối đa 10 MB");
        return;
      }
      setPdfDataUrl(value);
    };
    reader.onerror = () => {
      if (previewSeq.current !== seq) return;
      clearPdfState();
      setError("Không đọc được file PDF. Vui lòng thử lại.");
    };
    reader.readAsDataURL(file);
  };

  /** Reset and re-open the file picker. */
  const onRepickPdf = () => {
    clearPdfState();
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    fileRef.current?.click();
  };

  // Trigger preview fetch whenever the data URL changes (and only when valid).
  useEffect(() => {
    if (cvSource !== "pdf" || !isPdfDataUrl(pdfDataUrl)) {
      setPdfPreview(null);
      setEditableText("");
      setPreviewDigest(null);
      setPdfLoading(false);
      return;
    }
    const dataUrl = pdfDataUrl;
    const seq = ++previewSeq.current;
    let cancelled = false;
    setPdfLoading(true);
    setPdfPreview(null);
    setEditableText("");
    setPreviewDigest(null);
    (async () => {
      try {
        const res = await fetch("/api/sessions/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cvDataUrl: dataUrl }),
        });
        if (cancelled || previewSeq.current !== seq) return;
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.ok !== true) {
          const msg = (json && typeof json.error === "string")
            ? json.error
            : `Không trích xuất được PDF (HTTP ${res.status}).`;
          clearPdfState();
          setError(msg);
          return;
        }
        const preview: PdfPreview = {
          text: typeof json.text === "string" ? json.text : "",
          charCount: Number(json.charCount) || 0,
          truncated: Boolean(json.truncated),
          promptCharCount: Number(json.promptCharCount) || 0,
          promptTruncated: Boolean(json.promptTruncated),
          digest: typeof json.digest === "string" ? json.digest : "",
        };
        if (preview.digest.length !== 64) {
          clearPdfState();
          setError("Phản hồi preview không hợp lệ. Vui lòng thử lại.");
          return;
        }
        setPdfPreview(preview);
        setEditableText(preview.text);
        setPreviewDigest(preview.digest);
        setEditing(false);
      } catch (e) {
        if (cancelled || previewSeq.current !== seq) return;
        clearPdfState();
        setError((e as Error).message || "Không trích xuất được PDF. Vui lòng thử lại.");
      } finally {
        if (!cancelled && previewSeq.current === seq) setPdfLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cvSource, pdfDataUrl, clearPdfState]);

  // While editing, every keystroke recomputes the local digest. The server is
  // still the source of truth and will 409 if anything is edited (per spec).
  useEffect(() => {
    if (!pdfPreview) return;
    if (!editing) {
      setPreviewDigest(pdfPreview.digest);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      sha256Hex(editableText).then((d) => {
        if (!cancelled) setPreviewDigest(d);
      }).catch(() => { /* ignore */ });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [editing, editableText, pdfPreview]);

  const submit = async () => {
    setError(null);
    if (lessonError || (lessonLink && !practiceLesson)) { setError("Không tải được bài học gốc. Hãy quay lại bài học và thử lại."); return; }
    if (practiceLesson && focus.length > 2) { setError("Chỉ được thêm tối đa 2 chủ đề ngoài chủ đề gốc."); return; }
    if (role.trim().length < 2) { setError("Vui lòng nhập vị trí ứng tuyển (≥ 2 ký tự)"); return; }
    const parsedFocus = FocusSchema.safeParse(focus.map((item) => item.trim()));
    if (!parsedFocus.success) { setError("Tối đa 3 chủ đề, mỗi chủ đề từ 1 đến 120 ký tự."); return; }
    if (cvSource === "paste") {
      if (cvText.length === 0) { setError("Vui lòng dán nội dung CV"); return; }
      if (cvText.length > MAX_CV_CHARS) { setError(`CV vượt quá ${MAX_CV_CHARS.toLocaleString("vi-VN")} ký tự`); return; }
    }
    if (cvSource === "pdf") {
      if (!pdfDataUrl) { setError("Vui lòng chọn file PDF"); return; }
      if (!pdfPreview || !previewDigest) {
        setError("Đang trích xuất PDF, vui lòng đợi trong giây lát…");
        return;
      }
    }
    if (!cfg.model) { setError("Bạn chưa cấu hình Model ở màn 1"); router.push("/"); return; }
    if (!isProviderEnabled(cfg.provider)) { setError(getProviderSpec(cfg.provider).disabledReason); return; }
    if (getProviderSpec(cfg.provider).requiresApiKey && !cfg.apiKey) { setError("Bạn chưa nhập API Key ở màn 1"); router.push("/"); return; }
    if (getProviderSpec(cfg.provider).requiresBaseUrl && !cfg.baseUrl.trim()) { setError("Vui lòng nhập Base URL ở màn cấu hình."); return; }

    setSubmitting(true);
    try {
      // Compute per-source digest on demand; spec asks for it on both paths.
      let pasteDigestHex: string | null = null;
      if (cvSource === "paste") {
        pasteDigestHex = await sha256Hex(cvText);
      }
      const body: Record<string, unknown> = {
        provider: cfg.provider,
        model: cfg.model,
        baseUrl: cfg.baseUrl.trim() || undefined,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        topP: cfg.topP,
        role: role.trim(),
        language: lang,
        focus: parsedFocus.data,
        ...(practiceLesson ? { originLessonId: practiceLesson.id } : {}),
        mode,
        plannedRounds: rounds,
        cvSource,
      };
      if (cvSource === "paste") {
        body.cvText = cvText;
        body.cvFilename = cvFilename ?? "pasted-cv.txt";
        body.previewDigest = pasteDigestHex;
      }
      if (cvSource === "pdf") {
        body.cvDataUrl = pdfDataUrl;
        body.cvFilename = cvFilename ?? "cv.pdf";
        body.previewDigest = previewDigest;
      }

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Không tạo được phiên");
      router.push(`/session/${json.sessionId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit gating (extra — keeps the button disabled until preconditions hold).
  const submitDisabled =
    submitting
    || Boolean(lessonError)
    || Boolean(lessonLink && !practiceLesson)
    || Boolean(practiceLesson && focus.length > 2)
    || !FocusSchema.safeParse(focus.map((item) => item.trim())).success
    || (cvSource === "paste" && cvText.length > MAX_CV_CHARS)
    || (cvSource === "paste" && cvText.length === 0)
    || (cvSource === "pdf" && (!pdfDataUrl || !pdfPreview || !previewDigest || pdfLoading));

  return (
    <div className="w-full px-gutter py-space-lg max-w-[1520px] mx-auto flex flex-col gap-space-lg">
      <Breadcrumb provider={cfg.provider} model={cfg.model} />

      <HeaderBlock />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        <div className="lg:col-span-8 flex flex-col gap-space-lg">
          <StepCard step="1" label="FR-1 · LỰA CHỌN 1" title="Vị trí ứng tuyển (Job Role)" right={
            <span className="label-code-sm text-on-surface-variant bg-surface-elevated px-2 py-1 rounded">
              {role.length} / 120 ký tự
            </span>
          }>
            <div className="flex flex-col gap-space-xs">
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[20px]">badge</span>
                <input
                  className="input pl-10 pr-4"
                  maxLength={120}
                  placeholder="Nhập tên vị trí (vd: Senior Backend Go, AI Engineer...)"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-tertiary">info</span>
                AI sẽ căn cứ vào chức danh này để xây dựng bộ câu hỏi từ fundamentals → production architecture.
              </p>
            </div>
            <div className="flex flex-col gap-space-xs">
              <span className="label-caps text-on-surface-variant uppercase">Gợi ý nhanh (Quick Fill):</span>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_SUGGESTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    type="button"
                    className="px-2.5 py-1 rounded bg-surface-elevated hover:bg-surface-overlay text-on-surface-variant hover:text-on-surface label-code-sm transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </StepCard>

          <StepCard step="+" label="TÙY CHỌN · LUYỆN TẬP" title="Chủ đề cần luyện (Focus)" right={
            <span className="label-code-sm text-on-surface-variant">{focus.length + (lessonLink ? 1 : 0)} / 3 chủ đề</span>
          }>
            {lessonError ? <p role="alert" className="font-body-sm text-body-sm text-error">{lessonError}</p> : null}
            {lessonLink && !practiceLesson && !lessonError ? <p role="status">Đang tải bài học gốc…</p> : null}
            {practiceLesson ? (
              <div className="card p-space-sm flex flex-col gap-space-xs min-w-0">
                <span className="label-caps text-tertiary uppercase">Chủ đề từ bài học · không thể sửa hoặc xóa</span>
                <span className="font-body-sm text-body-sm text-on-surface break-words">{practiceLesson.practiceFocus}</span>
                <a className="underline text-body-sm break-words" href={`/learn/${encodeURIComponent(practiceLesson.sessionId)}?kind=${practiceLesson.source.kind}&index=${practiceLesson.source.index}&lesson=${encodeURIComponent(practiceLesson.id)}`}>Xem bài học gốc →</a>
              </div>
            ) : null}
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {practiceLesson ? "Bạn có thể thêm tối đa 2 chủ đề khác, chỉ sửa hoặc xóa những chủ đề tự thêm." : "Gợi ý từ báo cáo chỉ là dữ liệu tham khảo. Bạn có thể sửa, xóa hoặc thêm chủ đề trước khi chủ động bắt đầu phiên mới."}
            </p>
            {focus.map((item, index) => (
              <div key={index} className="flex items-center gap-space-xs">
                <input
                  className="input flex-1 min-w-0"
                  aria-label={`Chủ đề luyện tập ${index + 1}`}
                  maxLength={120}
                  value={item}
                  onChange={(e) => setFocus((current) => current.map((value, i) => i === index ? e.target.value : value))}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={`Xóa chủ đề luyện tập ${index + 1}`}
                  onClick={() => setFocus((current) => current.filter((_, i) => i !== index))}
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
                </button>
              </div>
            ))}
            {focus.length + (lessonLink ? 1 : 0) < 3 ? (
              <button type="button" className="btn btn-ghost self-start" onClick={() => setFocus((current) => [...current, ""])}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span> Thêm chủ đề
              </button>
            ) : null}
            {focus.some((item) => !item.trim()) ? (
              <p className="font-body-sm text-body-sm text-error" role="alert">Nhập chủ đề hoặc xóa dòng trống trước khi bắt đầu.</p>
            ) : null}
            {lessonLink && focus.length > 2 ? (
              <p className="font-body-sm text-body-sm text-error" role="alert">Chỉ được thêm tối đa 2 chủ đề ngoài chủ đề gốc. Hãy xóa bớt chủ đề.</p>
            ) : null}
          </StepCard>

          <StepCard step="2" label="FR-1 · LỰA CHỌN 2" title="Ngôn ngữ phỏng vấn (Language)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
              <LangCard active={lang === "vi"} onClick={() => setLang("vi")} icon="translate" title="Tiếng Việt"
                body="Phỏng vấn hoàn toàn bằng tiếng Việt tự nhiên, giữ nguyên thuật ngữ kỹ thuật chuẩn."
                foot="Khuyên dùng cho ứng viên Việt Nam" />
              <LangCard active={lang === "en"} onClick={() => setLang("en")} icon="public" title="English"
                body="Full professional English technical interview, standardized global rubric & vocabulary."
                foot="MNCs & Remote Tech Jobs" />
            </div>
          </StepCard>

          <StepCard step="3" label="FR-1 · LỰA CHỌN 3" title="Chế độ phỏng vấn (Interview Mode)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
              <ModeCard active={mode === "strict"} onClick={() => setMode("strict")} icon="timer" title="Nghiêm khắc (Strict)"
                body="AI chỉ đóng vai interviewer cấp cao, hỏi tuần tự, không gợi ý giữa chừng. Chỉ chấm điểm tổng kết cuối phiên."
                foot="Không lộ rubric trước khi kết thúc" footIcon="visibility_off" footTone="muted" tag="Chuẩn thi tuyển thực tế" />
              <ModeCard active={mode === "coaching"} onClick={() => setMode("coaching")} icon="school" title="Kèm góp ý tức thì (Coaching)"
                body="AI phản hồi nhận xét ngắn, highlight điểm tốt / lỗ hổng kiến thức ngay sau mỗi câu trước khi hỏi tiếp."
                foot="Micro-rubric phản hồi ngay từng câu" footIcon="feedback" footTone="primary" tag="Khuyên dùng để luyện tập" />
            </div>
          </StepCard>

          <StepCard step="4" label="FR-1 · LỰA CHỌN 4" title="Độ dài phiên (Rounds)" right={
            <span className="label-code-sm text-on-surface-variant bg-surface-elevated px-2 py-1 rounded">{rounds} câu hỏi</span>
          }>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
              {([5, 8, 12] as Rounds[]).map((n) => (
                <button
                  key={n}
                  onClick={() => setRounds(n)}
                  className={`text-left p-space-md rounded-xl transition-all flex flex-col gap-space-sm ${
                    rounds === n ? "bg-surface-elevated glow-active" : "bg-surface-container-lowest hover:bg-surface-elevated"
                  }`}
                  style={{ border: `1px solid ${rounds === n ? "var(--border-focus)" : "var(--border-hairline)"}` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-headline-md text-headline-md text-on-surface">{n}</span>
                    <Chip tone={rounds === n ? "emerald" : "neutral"}>
                      {n === 5 ? "Ngắn" : n === 8 ? "Vừa" : "Dài"}
                    </Chip>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {n === 5
                      ? "Warm-up screening 30-45 phút."
                      : n === 8
                      ? "Full loop cân bằng fundamentals + system design."
                      : "Deep-dive — bao trùm cả Staff-level scenarios."}
                  </p>
                </button>
              ))}
            </div>
          </StepCard>

          <StepCard step="5" label="FR-1 · LỰA CHỌN 5" title="Nguồn CV (CV Source)">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
              <CvSourceCard active={cvSource === "none"} onClick={() => pickCvSource("none")} icon="block" title="Không có CV"
                body="Phỏng vấn dựa hoàn toàn vào vị trí ứng tuyển." />
              <CvSourceCard active={cvSource === "paste"} onClick={() => pickCvSource("paste")} icon="content_paste" title="Dán văn bản"
                body={`Plain text tối đa ${MAX_CV_CHARS.toLocaleString("vi-VN")} ký tự.`} />
              <CvSourceCard active={cvSource === "pdf"} onClick={() => pickCvSource("pdf")} icon="picture_as_pdf" title="Tải file PDF"
                body={`Trích xuất text tại server (pdf-parse). Tối đa ${(MAX_PDF_BYTES / 1024 / 1024).toFixed(0)} MB.`} />
            </div>

            {cvSource === "paste" ? (
              <div className="flex flex-col gap-space-xs">
                <textarea
                  className="input min-h-[200px] resize-y"
                  placeholder="Dán nội dung CV vào đây…"
                  value={cvText}
                  onChange={(e) => setCvText(e.target.value)}
                />
                <div className="flex justify-between text-on-surface-variant label-code-sm">
                  <span>
                    {cvText.length.toLocaleString("vi-VN")} / {MAX_CV_CHARS.toLocaleString("vi-VN")} ký tự
                  </span>
                  <span>{Math.min(100, Math.round((cvText.length / MAX_CV_CHARS) * 100))}%</span>
                </div>
                {cvText.length > MAX_CV_CHARS ? (
                  <p className="font-body-sm text-body-sm text-error flex items-center gap-1.5" role="alert">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    Đã vượt quá giới hạn {MAX_CV_CHARS.toLocaleString("vi-VN")} ký tự — vui lòng rút gọn CV trước khi tiếp tục.
                  </p>
                ) : null}
                <Callout
                  tone="info"
                  title="Văn bản bạn dán vào"
                  body={`Văn bản dán vào sẽ được gửi tới AI provider dưới dạng một phần prompt kèm mỗi phiên (tối đa ${MAX_CV_CHARS.toLocaleString("vi-VN")} ký tự; prompt chỉ thấy ${MAX_PROMPT_CV_CHARS.toLocaleString("vi-VN")} ký tự đầu). Không upload file nào cả; chỉ plain text đi trong request body.`}
                  icon="content_paste"
                />
              </div>
            ) : null}

            {cvSource === "pdf" ? (
              <div className="flex flex-col gap-space-sm">
                <div
                  className="card-elevated p-space-md flex flex-col gap-space-sm cursor-pointer"
                  onClick={() => fileRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-space-sm">
                      <div className="w-10 h-10 rounded-lg bg-surface-overlay flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined text-[22px]">picture_as_pdf</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-headline-sm text-headline-sm text-on-surface">
                          {cvFilename ?? "Chọn file PDF…"}
                        </span>
                        <span className="label-code-sm text-on-surface-variant">
                          {pdfMeta
                            ? `${(pdfMeta.size / 1024).toFixed(1)} KB · tối đa ${(MAX_PDF_BYTES / 1024 / 1024).toFixed(0)} MB`
                            : `Tối đa ${(MAX_PDF_BYTES / 1024 / 1024).toFixed(0)} MB · xử lý tại server`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-space-xs">
                      {cvFilename ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onRepickPdf(); }}
                          className="px-2 py-1 rounded bg-surface-overlay hover:bg-surface-elevated text-on-surface-variant label-code-sm flex items-center gap-1"
                          aria-label="Chọn lại file PDF"
                        >
                          <span className="material-symbols-outlined text-[14px]">refresh</span> Chọn lại
                        </button>
                      ) : null}
                      <span className="material-symbols-outlined text-on-surface-variant">upload_file</span>
                    </div>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onPickPdf(file);
                      // Reset so selecting the same file twice still triggers onChange.
                      e.target.value = "";
                    }}
                  />
                </div>

                {/* Inline preview status */}
                {pdfLoading ? (
                  <div
                    className="card p-space-md flex items-center gap-space-sm"
                    aria-live="polite"
                  >
                    <span className="material-symbols-outlined text-[20px] text-primary animate-spin">progress_activity</span>
                    <span className="font-body-md text-body-md text-on-surface">
                      Đang trích xuất PDF…
                    </span>
                  </div>
                ) : null}

                {pdfPreview ? (
                  <div className="card p-space-md flex flex-col gap-space-sm" aria-live="polite">
                    <div className="flex items-center justify-between gap-space-sm flex-wrap">
                      <div className="flex items-center gap-space-sm">
                        <span className="material-symbols-outlined text-[20px] text-tertiary">preview</span>
                        <span className="font-headline-sm text-headline-sm text-on-surface">Preview trích xuất</span>
                        {pdfPreview.truncated ? (
                          <Chip tone="amber" dot={false}>bị cắt tại {MAX_CV_CHARS.toLocaleString("vi-VN")}</Chip>
                        ) : null}
                        {pdfPreview.promptTruncated ? (
                          <Chip tone="amber" dot={false}>prompt chỉ thấy {MAX_PROMPT_CV_CHARS.toLocaleString("vi-VN")} ký tự đầu</Chip>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (editing) {
                            // Reverting exits edit mode and restores server-supplied text/digest.
                            setEditableText(pdfPreview.text);
                            setEditing(false);
                          } else {
                            setEditing(true);
                          }
                        }}
                        className="px-2 py-1 rounded bg-surface-overlay hover:bg-surface-elevated text-on-surface-variant label-code-sm flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {editing ? "close" : "edit"}
                        </span>
                        {editing ? "Huỷ sửa" : "Chỉnh sửa"}
                      </button>
                    </div>

                    {editing ? (
                      <div className="flex flex-col gap-space-xs">
                        <textarea
                          className="input min-h-[180px] resize-y"
                          value={editableText}
                          onChange={(e) => setEditableText(e.target.value)}
                          aria-label="Chỉnh sửa text PDF đã trích xuất"
                        />
                        <div className="flex justify-between text-on-surface-variant label-code-sm">
                          <span>
                            {editableText.length.toLocaleString("vi-VN")} / {MAX_CV_CHARS.toLocaleString("vi-VN")} ký tự
                          </span>
                          <span>{Math.min(100, Math.round((editableText.length / MAX_CV_CHARS) * 100))}%</span>
                        </div>
                        {editableText.length > MAX_CV_CHARS ? (
                          <p className="font-body-sm text-body-sm text-error flex items-center gap-1.5" role="alert">
                            <span className="material-symbols-outlined text-[16px]">error</span>
                            Đã vượt quá giới hạn {MAX_CV_CHARS.toLocaleString("vi-VN")} ký tự — vui lòng rút gọn CV trước khi tiếp tục.
                          </p>
                        ) : (
                          <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px] text-warning">warning</span>
                            Máy chủ là nguồn sự thật: bất kỳ chỉnh sửa nào cũng có thể khiến digest lệch và server sẽ từ chối (HTTP 409).
                          </p>
                        )}
                      </div>
                    ) : (
                      <pre
                        className="whitespace-pre-wrap break-words font-body-sm text-body-sm text-on-surface bg-surface-container-lowest p-space-sm rounded border max-h-[260px] overflow-y-auto"
                        aria-label="Text PDF đã trích xuất"
                      >
                        {pdfPreview.text || <span className="text-on-surface-variant">(trống)</span>}
                      </pre>
                    )}

                    {/* Footer status row: digest + character counts */}
                    <div className="flex flex-wrap items-center justify-between gap-space-sm pt-1">
                      <div className="flex flex-wrap items-center gap-space-sm">
                        <span className="label-caps uppercase text-on-surface-variant">Đếm ký tự</span>
                        <span className="label-code-sm text-on-surface">
                          {pdfPreview.charCount.toLocaleString("vi-VN")} / {MAX_CV_CHARS.toLocaleString("vi-VN")}
                        </span>
                        <span className="text-on-surface-variant">·</span>
                        <span className="label-code-sm text-on-surface">
                          {pdfPreview.promptCharCount.toLocaleString("vi-VN")} / {MAX_PROMPT_CV_CHARS.toLocaleString("vi-VN")} trong prompt
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5" title={previewDigest ?? ""}>
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">tag</span>
                        <span className="label-code-sm text-on-surface-variant">digest</span>
                        <span className="label-code-sm text-on-surface">
                          {previewDigest ? `${previewDigest.slice(0, 12)}…` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                <Callout
                  tone="info"
                  title="PDF xử lý tại server"
                  body={`PDF xử lý tại server, chỉ text kết quả (≤ ${MAX_CV_CHARS.toLocaleString("vi-VN")} ký tự, prompt chỉ thấy ${MAX_PROMPT_CV_CHARS.toLocaleString("vi-VN")} ký tự đầu) mới được gửi tới AI provider kèm mỗi phiên. File PDF gốc không được lưu trong SQLite hay backup.`}
                  icon="picture_as_pdf"
                />
              </div>
            ) : null}
          </StepCard>

          {error ? (
            <div className="card p-space-md flex items-center gap-space-sm" style={{ borderColor: "rgba(244,63,94,0.4)" }}>
              <span className="material-symbols-outlined text-error">error</span>
              <span className="font-body-md text-body-md text-error">{error}</span>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-space-md py-space-sm">
            <a href="/" className="btn btn-ghost w-full sm:w-auto">
              <span className="material-symbols-outlined text-[18px]">arrow_back</span> Quay lại cấu hình
            </a>
            <button
              onClick={submit}
              disabled={submitDisabled}
              className="btn btn-primary w-full sm:w-auto"
            >
              {submitting ? (
                <>
                  <span className="material-symbols-outlined text-[20px] animate-spin">refresh</span>
                  Đang khởi tạo phiên…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">play_circle</span>
                  Bắt đầu phỏng vấn
                </>
              )}
            </button>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-space-md">
          <RightSummary
            role={role}
            lang={lang}
            mode={mode}
            rounds={rounds}
            cvSource={cvSource}
            cvChars={cvText.length}
            pdfMeta={pdfMeta}
            pdfPreviewChars={pdfPreview ? pdfPreview.charCount : null}
            pdfPromptChars={pdfPreview ? pdfPreview.promptCharCount : null}
          />
          <Callout
            tone="warning"
            title="Khuyến cáo NFR-2 & NFR-10"
            body="API Key của bạn chỉ được gửi kèm mỗi request, xử lý trong RAM server, tuyệt đối KHÔNG được ghi vào SQLite hay log hệ thống."
            icon="shield"
          />
          <Callout
            tone="info"
            title="Phục hồi phiên (FR-11)"
            body="Tải lại trang / khởi động lại server không làm mất transcript — toàn bộ lịch sử đã lưu tại SQLite."
            icon="history"
          />
        </div>
      </div>
    </div>
  );
}

function Breadcrumb({ provider, model }: { provider: string; model: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-space-sm">
      <div className="flex items-center gap-space-xs label-code-sm text-on-surface-variant">
        <span className="flex items-center gap-1.5 text-tertiary">
          <span className="w-2 h-2 rounded-full bg-tertiary" /> 1. Cấu hình AI
        </span>
        <span className="text-on-surface-variant">/</span>
        <span className="text-primary font-headline-sm text-headline-sm">2. Khởi tạo phiên phỏng vấn</span>
        <span className="text-on-surface-variant">/</span>
        <span className="text-on-surface-variant">3. Phỏng vấn trực tiếp</span>
        <span className="text-on-surface-variant">/</span>
        <span className="text-on-surface-variant">4. Báo cáo</span>
      </div>
      <div className="flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-elevated text-on-surface">
        <span className="w-2 h-2 rounded-full bg-tertiary pulse-dot" />
        <span className="label-caps text-on-surface-variant uppercase">Active Model:</span>
        <span className="label-code-sm text-primary">{provider} · {model || "—"}</span>
        <span className="label-caps text-tertiary bg-surface-container-lowest px-1.5 py-0.5 rounded">BYOK Loaded</span>
      </div>
    </div>
  );
}

function HeaderBlock() {
  return (
    <div className="card p-space-lg relative overflow-hidden">
      <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="flex flex-wrap items-center gap-space-xs label-caps uppercase tracking-wider text-tertiary">
        <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-tertiary">FR-1 CỐT LÕI</span>
        <span className="text-on-surface-variant">•</span>
        <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-on-surface-variant">FR-2/FR-3/FR-4 NGUỒN CV</span>
        <span className="text-on-surface-variant">•</span>
        <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-on-surface-variant">SQLITE WAL STORAGE</span>
      </div>
      <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight mt-space-sm">Khởi tạo phiên phỏng vấn mới</h1>
      <p className="font-body-lg text-body-lg text-on-surface-variant max-w-4xl mt-space-xs">
        Thiết lập đúng 5 thông số cốt lõi để AI cá nhân hóa câu hỏi phỏng vấn kỹ thuật và kiến trúc theo vị trí của bạn. Mọi thay đổi cấu hình được ánh xạ tự động vào schema SQLite server-side.
      </p>
    </div>
  );
}

function StepCard({ step, label, title, right, children }: { step: string; label: string; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-space-md sm:p-space-lg flex flex-col gap-space-md">
      <div className="flex items-center justify-between gap-space-sm flex-wrap">
        <div className="flex items-center gap-space-sm">
          <span className="w-6 h-6 rounded-full bg-primary text-on-primary label-code-sm flex items-center justify-center font-bold">{step}</span>
          <div>
            <span className="label-caps uppercase text-primary">{label}</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
          </div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function LangCard({ active, onClick, icon, title, body, foot }: { active: boolean; onClick: () => void; icon: string; title: string; body: string; foot: string }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`relative flex flex-col gap-space-xs p-space-md rounded-xl text-left transition-all ${
        active ? "bg-primary/15 text-on-surface" : "bg-surface-container-lowest hover:bg-surface-elevated text-on-surface-variant hover:text-on-surface"
      }`}
      style={{ boxShadow: active ? "0 0 0 2px var(--primary)" : "none" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined text-[22px] ${active ? "text-primary" : "text-on-surface-variant"}`}>{icon}</span>
          <span className="font-headline-sm text-headline-sm font-semibold">{title}</span>
        </div>
        <span className={`w-4 h-4 rounded-full flex items-center justify-center ${active ? "bg-primary" : "bg-surface-elevated"}`}>
          {active ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
        </span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">{body}</p>
      <span className={`label-caps uppercase mt-1 ${active ? "text-tertiary" : "text-on-surface-variant"}`}>{foot}</span>
    </button>
  );
}

function ModeCard({ active, onClick, icon, title, body, foot, footIcon, footTone, tag }: {
  active: boolean; onClick: () => void; icon: string; title: string; body: string;
  foot: string; footIcon: string; footTone: "muted" | "primary"; tag: string;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`relative flex flex-col justify-between gap-space-sm p-space-md rounded-xl text-left transition-all ${
        active ? "bg-primary/15 text-on-surface" : "bg-surface-container-lowest hover:bg-surface-elevated text-on-surface"
      }`}
      style={{ boxShadow: active ? "0 0 0 2px var(--primary)" : "none" }}
    >
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
          <span className={`label-caps uppercase px-2 py-0.5 rounded ${active ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-elevated text-on-surface-variant"}`}>{tag}</span>
          <span className={`w-4 h-4 rounded-full flex items-center justify-center ${active ? "bg-primary" : "bg-surface-elevated"}`}>
            {active ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`material-symbols-outlined text-[22px] ${active ? "text-primary" : "text-on-surface-variant"}`}>{icon}</span>
          <span className="font-headline-sm text-headline-sm font-semibold">{title}</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{body}</p>
      </div>
      <div className={`label-code-sm text-label-code-sm flex items-center gap-1 pt-2 ${footTone === "primary" ? "text-tertiary" : "text-on-surface-variant"}`}>
        <span className="material-symbols-outlined text-[16px]">{footIcon}</span> {foot}
      </div>
    </button>
  );
}

function CvSourceCard({ active, onClick, icon, title, body }: { active: boolean; onClick: () => void; icon: string; title: string; body: string }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`text-left p-space-md rounded-xl flex flex-col gap-space-sm transition-all ${
        active ? "bg-surface-elevated" : "bg-surface-container-lowest hover:bg-surface-elevated"
      }`}
      style={{ boxShadow: active ? "0 0 0 2px var(--primary)" : "none" }}
    >
      <div className="flex items-center gap-2">
        <span className={`material-symbols-outlined text-[22px] ${active ? "text-primary" : "text-on-surface-variant"}`}>{icon}</span>
        <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">{title}</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">{body}</p>
    </button>
  );
}

function RightSummary({
  role, lang, mode, rounds, cvSource, cvChars, pdfMeta, pdfPreviewChars, pdfPromptChars,
}: {
  role: string; lang: string; mode: string; rounds: number; cvSource: string;
  cvChars: number; pdfMeta: { size: number } | null;
  pdfPreviewChars: number | null; pdfPromptChars: number | null;
}) {
  return (
    <div className="card p-space-md flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
        <span className="label-caps text-tertiary uppercase">Tóm tắt phiên</span>
        <Chip tone="indigo">FR-1 Snapshot</Chip>
      </div>
      <Row k="Vị trí" v={role || "—"} />
      <Row k="Ngôn ngữ" v={lang === "vi" ? "Tiếng Việt" : "English"} />
      <Row k="Chế độ" v={mode === "coaching" ? "Coaching" : "Strict"} />
      <Row k="Số câu hỏi" v={String(rounds)} />
      <Row
        k="CV"
        v={
          cvSource === "none" ? "Không có" :
          cvSource === "paste" ? `Dán văn bản · ${cvChars.toLocaleString("vi-VN")} ký tự` :
          (
            pdfMeta
              ? (
                  pdfPreviewChars != null
                    ? `PDF · ${(pdfMeta.size / 1024).toFixed(1)} KB · ${pdfPreviewChars.toLocaleString("vi-VN")} ký tự (prompt ${pdfPromptChars?.toLocaleString("vi-VN") ?? 0})`
                    : `PDF · ${(pdfMeta.size / 1024).toFixed(1)} KB · đang trích xuất…`
                )
              : "PDF · chưa chọn"
          )
        }
      />
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

function Callout({ tone, title, body, icon }: { tone: "warning" | "info"; title: string; body: string; icon: string }) {
  const cls = tone === "warning"
    ? "bg-warning/10 border-warning/40 text-warning"
    : "bg-primary/10 border-primary/40 text-primary";
  return (
    <div className={`p-space-md rounded-xl border ${cls} flex items-start gap-space-sm`}>
      <span className="material-symbols-outlined text-[20px] flex-shrink-0">{icon}</span>
      <div className="flex flex-col">
        <span className="font-headline-sm text-headline-sm text-on-surface">{title}</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">{body}</span>
      </div>
    </div>
  );
}
