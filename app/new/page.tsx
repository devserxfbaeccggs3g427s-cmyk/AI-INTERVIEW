"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useByok } from "@/components/ByokConfigContext";
import { Chip } from "@/components/Chip";
import { ProviderIcon } from "@/components/ProviderIcon";

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

export default function StartInterviewPage() {
  const router = useRouter();
  const { cfg, hydrated } = useByok();

  const [role, setRole] = useState("Senior Fullstack Engineer (React / Node.js / System Design)");
  const [lang, setLang] = useState<Lang>("vi");
  const [mode, setMode] = useState<Mode>("coaching");
  const [rounds, setRounds] = useState<Rounds>(8);
  const [cvSource, setCvSource] = useState<CvSource>("none");
  const [cvText, setCvText] = useState("");
  const [cvFilename, setCvFilename] = useState<string | null>(null);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfMeta, setPdfMeta] = useState<{ size: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Block submit if no BYOK config
  useEffect(() => {
    if (hydrated && (!cfg.model || (cfg.provider !== "custom" && !cfg.apiKey))) {
      // Soft warning — don't force redirect; show inline.
    }
  }, [hydrated, cfg]);

  const onPickPdf = async (file: File) => {
    if (file.type !== "application/pdf") {
      setError("Chỉ chấp nhận file PDF");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("PDF tối đa 20MB");
      return;
    }
    setError(null);
    setCvFilename(file.name);
    setPdfMeta({ size: file.size });
    const reader = new FileReader();
    reader.onload = () => setPdfDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    setError(null);
    if (role.trim().length < 2) { setError("Vui lòng nhập vị trí ứng tuyển (≥ 2 ký tự)"); return; }
    if (cvSource === "paste" && cvText.length > MAX_CV_CHARS) { setError(`CV vượt quá ${MAX_CV_CHARS} ký tự`); return; }
    if (cvSource === "pdf" && !pdfDataUrl) { setError("Vui lòng chọn file PDF"); return; }
    if (!cfg.model) { setError("Bạn chưa cấu hình Model ở màn 1"); router.push("/"); return; }
    if (cfg.provider !== "custom" && !cfg.apiKey) { setError("Bạn chưa nhập API Key ở màn 1"); router.push("/"); return; }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        provider: cfg.provider,
        model: cfg.model,
        baseUrl: cfg.baseUrl || undefined,
        apiKey: cfg.apiKey || undefined,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        topP: cfg.topP,
        role: role.trim(),
        language: lang,
        mode,
        plannedRounds: rounds,
        cvSource,
      };
      if (cvSource === "paste") { body.cvText = cvText; body.cvFilename = cvFilename ?? "pasted-cv.txt"; }
      if (cvSource === "pdf") { body.cvDataUrl = pdfDataUrl; body.cvFilename = cvFilename ?? "cv.pdf"; }

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
              <CvSourceCard active={cvSource === "none"} onClick={() => setCvSource("none")} icon="block" title="Không có CV"
                body="Phỏng vấn dựa hoàn toàn vào vị trí ứng tuyển." />
              <CvSourceCard active={cvSource === "paste"} onClick={() => setCvSource("paste")} icon="content_paste" title="Dán văn bản"
                body={`Plain text tối đa ${MAX_CV_CHARS.toLocaleString("vi-VN")} ký tự.`} />
              <CvSourceCard active={cvSource === "pdf"} onClick={() => setCvSource("pdf")} icon="picture_as_pdf" title="Tải file PDF"
                body="Trích xuất text phía server (pdf-parse), không upload lên cloud." />
            </div>

            {cvSource === "paste" ? (
              <div className="flex flex-col gap-space-xs">
                <textarea
                  className="input min-h-[200px] resize-y"
                  placeholder="Dán nội dung CV vào đây…"
                  value={cvText}
                  onChange={(e) => setCvText(e.target.value.slice(0, MAX_CV_CHARS))}
                  maxLength={MAX_CV_CHARS}
                />
                <div className="flex justify-between text-on-surface-variant label-code-sm">
                  <span>{cvText.length.toLocaleString("vi-VN")} / {MAX_CV_CHARS.toLocaleString("vi-VN")} ký tự</span>
                  <span>{Math.round((cvText.length / MAX_CV_CHARS) * 100)}%</span>
                </div>
              </div>
            ) : null}

            {cvSource === "pdf" ? (
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
                        {pdfMeta ? `${(pdfMeta.size / 1024).toFixed(1)} KB` : "Tối đa 20MB · xử lý local"}
                      </span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">upload_file</span>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onPickPdf(e.target.files[0])}
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
              disabled={submitting}
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
          <RightSummary role={role} lang={lang} mode={mode} rounds={rounds} cvSource={cvSource} cvChars={cvText.length} pdfMeta={pdfMeta} />
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
          <span className="w-6 h-6 rounded-full bg-primary text-white label-code-sm flex items-center justify-center font-bold">{step}</span>
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

function RightSummary({ role, lang, mode, rounds, cvSource, cvChars, pdfMeta }: {
  role: string; lang: string; mode: string; rounds: number; cvSource: string; cvChars: number; pdfMeta: { size: number } | null;
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
          `PDF · ${pdfMeta ? (pdfMeta.size / 1024).toFixed(1) + " KB" : "chưa chọn"}`
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
