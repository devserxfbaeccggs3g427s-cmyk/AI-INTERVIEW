"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useByok, detectedProviderFromKey, type ByokConfig, type ProviderId } from "@/components/ByokConfigContext";
import { Chip } from "@/components/Chip";
import { ProviderIcon } from "@/components/ProviderIcon";

const PROVIDERS: { id: ProviderId; title: string; subtitle: string; tags: { label: string; tone: "emerald" | "neutral" | "indigo" | "amber" }[] }[] = [
  { id: "anthropic", title: "Anthropic",         subtitle: "Claude 3.5 Sonnet / 3.5 Haiku",  tags: [{ label: "Direct PDF", tone: "emerald" }, { label: "Streaming", tone: "indigo" }] },
  { id: "openai",    title: "OpenAI",            subtitle: "GPT-4o / GPT-4o mini / o1",     tags: [{ label: "Direct PDF", tone: "emerald" }, { label: "JSON Schema", tone: "emerald" }, { label: "Streaming", tone: "indigo" }] },
  { id: "gemini",    title: "Google Gemini",     subtitle: "Gemini 1.5 Pro / Flash",         tags: [{ label: "Direct PDF", tone: "emerald" }, { label: "Multi-modal", tone: "neutral" }, { label: "Streaming", tone: "indigo" }] },
  { id: "custom",    title: "Tùy chỉnh (Self-Hosted)", subtitle: "Ollama / vLLM / Groq proxy", tags: [{ label: "No PDF OCR", tone: "neutral" }, { label: "OpenAI compat", tone: "neutral" }, { label: "Streaming", tone: "indigo" }] },
];

interface ModelRow { id: string; label?: string }

export default function ByokConfigPage() {
  const { cfg, setCfg, reset, hydrated } = useByok();

  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState<string>("");
  const [models, setModels] = useState<ModelRow[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelNote, setModelNote] = useState<string>("");

  const detected = useMemo(() => detectedProviderFromKey(cfg.apiKey), [cfg.apiKey]);

  // Whenever provider / key / base changes, try to fetch models.
  const fetchModels = useCallback(async () => {
    setFetchingModels(true); setModelNote("");
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey }),
      });
      const json = await res.json();
      if (Array.isArray(json.models) && json.models.length) {
        setModels(json.models);
        if (!json.models.find((m: ModelRow) => m.id === cfg.model)) {
          setCfg({ model: json.models[0].id });
        }
        if (json.warning) setModelNote(json.warning);
      } else {
        setModelNote("Không lấy được danh sách — nhập Model ID thủ công.");
      }
    } catch (e) {
      setModelNote(`Lỗi mạng: ${(e as Error).message}`);
    } finally {
      setFetchingModels(false);
    }
  }, [cfg.provider, cfg.model, cfg.baseUrl, cfg.apiKey, setCfg]);

  useEffect(() => {
    if (cfg.provider === "custom" && !cfg.baseUrl) return;
    // Debounce
    const t = setTimeout(() => { void fetchModels(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.provider, cfg.baseUrl, cfg.apiKey]);

  const testKey = useCallback(async () => {
    setTestState("testing"); setTestMsg("");
    try {
      const res = await fetch("/api/test-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: cfg.provider,
          model: cfg.model,
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          temperature: cfg.temperature,
          maxTokens: cfg.maxTokens,
          topP: cfg.topP,
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setTestState("ok");
        setTestMsg(`${json.detail ?? "Kết nối thành công"} · ${json.latencyMs ?? "—"}ms`);
      } else {
        setTestState("fail");
        setTestMsg(json.detail ?? json.error ?? "Không kết nối được");
      }
    } catch (e) {
      setTestState("fail");
      setTestMsg((e as Error).message);
    }
  }, [cfg]);

  const isCustom = cfg.provider === "custom";
  const canTest = cfg.apiKey.length > 0 || isCustom;

  return (
    <div className="w-full px-gutter py-space-lg flex flex-col gap-space-xl max-w-7xl mx-auto">
      <PageHeader />

      <SecurityAdvisory
        sessionOnly={cfg.sessionOnly}
        onToggle={(v) => setCfg({ sessionOnly: v })}
        hydrated={hydrated}
      />

      <Section step="Bước 1" title="Lựa chọn AI Provider tương thích" right={<span className="label-code-sm text-on-surface-variant">Hỗ trợ 4 cơ chế runtime</span>}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
          {PROVIDERS.map((p) => {
            const active = cfg.provider === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setCfg({ provider: p.id })}
                className={`text-left p-space-md rounded-xl transition-all flex flex-col justify-between gap-space-md ${
                  active
                    ? "bg-surface-elevated glow-active"
                    : "bg-surface-subtle hover:bg-surface-elevated"
                }`}
                style={{ border: `1px solid ${active ? "var(--border-focus)" : "var(--border-hairline)"}` }}
              >
                <div className="flex flex-col gap-space-sm">
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        p.id === "openai" ? "bg-primary text-on-primary" : "bg-surface-overlay text-primary"
                      }`}
                    >
                      <ProviderIcon provider={p.id} className="text-[24px]" />
                    </div>
                    {active ? <span className="material-symbols-outlined text-[20px] text-tertiary">check_circle</span> : null}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-headline-sm text-headline-sm text-on-surface">{p.title}</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">{p.subtitle}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.tags.map((t, i) => <Chip key={i} tone={t.tone}>{t.label}</Chip>)}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        <div className="lg:col-span-8 flex flex-col gap-space-lg">
          {isCustom ? (
            <CustomEndpointBox
              value={cfg.baseUrl}
              onChange={(v) => setCfg({ baseUrl: v })}
            />
          ) : null}

          <ApiKeyCard
            value={cfg.apiKey}
            show={showKey}
            onShowToggle={() => setShowKey((s) => !s)}
            onChange={(v) => setCfg({ apiKey: v })}
            onClear={() => setCfg({ apiKey: "" })}
            onTest={testKey}
            testState={testState}
            testMsg={testMsg}
            canTest={canTest}
            detectedLabel={
              isCustom
                ? "Tùy biến (OpenAI Compatible)"
                : detected
                  ? detected === "anthropic" ? "Định dạng: sk-ant-…"
                  : detected === "openai" ? "Định dạng: sk-proj-…"
                  : "Định dạng: AIzaSy…"
                  : "Chưa nhập key — chỉ dùng để test kết nối"
            }
          />

          <ModelCard
            cfg={cfg}
            setCfg={setCfg}
            models={models}
            fetching={fetchingModels}
            onFetch={fetchModels}
            note={modelNote}
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-space-md py-space-sm">
            <button
              onClick={() => { if (confirm("Xóa toàn bộ API Key + cấu hình trong trình duyệt?")) reset(); }}
              className="btn btn-destructive w-full sm:w-auto"
            >
              <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
              Xóa toàn bộ cấu hình cục bộ
            </button>
            <a href="/new" className="btn btn-primary w-full sm:w-auto">
              <span className="material-symbols-outlined text-[20px]">task_alt</span>
              Lưu & Sẵn sàng phỏng vấn
            </a>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-space-md">
          <TelemetryCard />
          <CapabilityCard />
          <SecurityNote />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- sub-components ----------------------------- */

function PageHeader() {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
      <div className="flex flex-col gap-space-xs max-w-3xl">
        <div className="flex items-center gap-space-xs">
          <span className="px-space-xs py-0.5 rounded bg-surface-elevated label-caps text-tertiary">BYOK Protocol · Client-Side Security</span>
          <span className="label-caps text-on-surface-variant">FR-12 · FR-16</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Cấu hình AI Provider & Khóa API (BYOK)</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Không yêu cầu đăng ký tài khoản. Bạn tự cấp API Key — mọi request chỉ tồn tại trong RAM server xử lý,
          không bao giờ chạm vào SQLite hay log hệ thống (NFR-2 / NFR-10).
        </p>
      </div>
      <div className="flex items-center gap-space-sm bg-surface-subtle p-space-sm rounded-xl">
        <div className="w-8 h-8 rounded-lg bg-tertiary-container flex items-center justify-center text-on-tertiary-container">
          <span className="material-symbols-outlined text-[18px]">lock</span>
        </div>
        <div className="flex flex-col">
          <span className="label-caps text-on-surface uppercase">Trạng thái bảo mật</span>
          <span className="label-code-sm text-tertiary">Bộ nhớ RAM / Session Active</span>
        </div>
      </div>
    </div>
  );
}

function SecurityAdvisory({ sessionOnly, onToggle, hydrated }: { sessionOnly: boolean; onToggle: (v: boolean) => void; hydrated: boolean }) {
  return (
    <div className="card-elevated p-space-md flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
      <div className="flex items-start gap-space-md flex-1">
        <div className="w-10 h-10 rounded-lg bg-surface-overlay flex-shrink-0 flex items-center justify-center text-error">
          <span className="material-symbols-outlined text-[24px]">shield_with_heart</span>
        </div>
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-sm flex-wrap">
            <span className="font-headline-sm text-headline-sm text-on-surface">Cảnh báo an toàn: Cơ chế lưu trữ khóa trên thiết bị</span>
            <span className="px-space-xs py-0.5 rounded bg-error-container text-on-error-container label-caps uppercase">Khuyến cáo NFR-2</span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            Mặc định ở chế độ <strong className="text-tertiary">Session-only</strong>: key chỉ nằm trong
            <code className="label-code-sm text-primary px-1.5 py-0.5 rounded bg-surface-overlay mx-1">sessionStorage</code>
            và tự hủy khi đóng tab. Bật tùy chọn bên dưới sẽ ghi xuống <code className="label-code-sm text-primary px-1.5 py-0.5 rounded bg-surface-overlay mx-1">localStorage</code> (plain text) — bất kỳ extension nào cũng đọc được.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-space-sm bg-surface-subtle p-space-sm rounded-lg flex-shrink-0">
        <div className="flex flex-col text-right">
          <span className="font-headline-sm text-headline-sm text-on-surface">Chỉ lưu trong phiên</span>
          <span className={`label-caps uppercase ${sessionOnly ? "text-tertiary" : "text-error"}`}>
            {hydrated ? (sessionOnly ? "Không ghi xuống đĩa cứng" : "Cảnh báo: localStorage plain text") : "…"}
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={sessionOnly}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <div className="w-11 h-6 bg-surface-overlay rounded-full peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
        </label>
      </div>
    </div>
  );
}

function Section({ step, title, right, children }: { step: string; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <span className="label-caps text-tertiary uppercase">{step}</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function CustomEndpointBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="card p-space-md flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
        <label className="label-caps text-on-surface uppercase flex items-center gap-space-xs" htmlFor="customBaseUrl">
          <span>Endpoint Base URL (HTTPS bắt buộc)</span>
          <span className="px-space-xs py-0.5 rounded bg-surface-elevated text-primary label-code-sm">NFR-8 Validated</span>
        </label>
        <span className="label-caps text-on-surface-variant">OpenAI Compatible Path</span>
      </div>
      <div className="relative flex items-center">
        <span className="absolute left-3 text-on-surface-variant material-symbols-outlined text-[18px]">dns</span>
        <input
          id="customBaseUrl"
          type="text"
          className="input input-mono pl-10"
          placeholder="https://api.groq.com/openai/v1"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
        />
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant flex items-start gap-space-xs">
        <span className="material-symbols-outlined text-[16px] text-tertiary flex-shrink-0 mt-0.5">verified_user</span>
        <span>
          Hệ thống áp dụng sandbox chặn toàn bộ IP nội bộ (localhost, 127.0.0.1, 10.0.0.0/8, 192.168.0.0/16, 169.254.0.0/16)
          để chống SSRF. Custom endpoint thường không hỗ trợ phân tích PDF trực tiếp hay structured JSON.
        </span>
      </p>
    </div>
  );
}

function ApiKeyCard({
  value, show, onShowToggle, onChange, onClear, onTest, testState, testMsg, canTest, detectedLabel,
}: {
  value: string;
  show: boolean;
  onShowToggle: () => void;
  onChange: (v: string) => void;
  onClear: () => void;
  onTest: () => void;
  testState: "idle" | "testing" | "ok" | "fail";
  testMsg: string;
  canTest: boolean;
  detectedLabel: string;
}) {
  return (
    <div className="card p-space-lg flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <span className="label-caps text-tertiary uppercase">Bước 2</span>
          <label className="font-headline-sm text-headline-sm text-on-surface" htmlFor="apiKeyField">API Key của Provider</label>
        </div>
        <div className="flex items-center gap-space-xs label-code-sm text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-tertiary pulse-dot" />
          <span>{detectedLabel}</span>
        </div>
      </div>

      <div className="relative flex items-center">
        <input
          id="apiKeyField"
          type={show ? "text" : "password"}
          className="input input-mono pr-28 tracking-wider"
          placeholder="Nhập chuỗi khóa bí mật (sk-…)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="absolute right-2 flex items-center gap-1">
          <button onClick={onShowToggle} title="Hiện/Ẩn Key" className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-elevated">
            <span className="material-symbols-outlined text-[18px]">{show ? "visibility_off" : "visibility"}</span>
          </button>
          <button onClick={onClear} title="Xóa Key" className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-surface-elevated">
            <span className="material-symbols-outlined text-[18px]">backspace</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-space-sm pt-space-xs">
        <div className="flex items-center gap-space-xs text-on-surface-variant label-code-sm">
          <span className="material-symbols-outlined text-[16px] text-tertiary">memory</span>
          <span>Chỉ lưu trong trình duyệt (mặc định sessionStorage)</span>
        </div>
        <button
          onClick={onTest}
          disabled={!canTest || testState === "testing"}
          className="flex items-center justify-center gap-space-xs px-space-md py-space-xs rounded-lg bg-surface-elevated text-on-surface hover:bg-surface-overlay font-label-code-lg text-label-code-lg disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-[18px] ${testState === "testing" ? "animate-spin" : "text-tertiary"}`}>
            {testState === "testing" ? "refresh" : "network_check"}
          </span>
          <span>{testState === "testing" ? "Đang kiểm tra…" : "Kiểm tra kết nối (Test Key)"}</span>
        </button>
      </div>

      {testState !== "idle" ? (
        <div
          className={`p-space-sm rounded-lg flex items-center justify-between gap-space-sm ${
            testState === "ok" ? "bg-surface-subtle" : testState === "fail" ? "bg-error-container/20" : "bg-surface-subtle"
          }`}
          style={{ border: `1px solid ${testState === "ok" ? "var(--border-t2)" : "rgba(244,63,94,0.3)"}` }}
        >
          <div className="flex items-center gap-space-sm">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                testState === "ok" ? "bg-tertiary-container text-on-tertiary-container" : "bg-error-container text-on-error-container"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {testState === "ok" ? "check" : testState === "fail" ? "close" : "hourglass_empty"}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="label-code-sm text-on-surface font-medium">
                {testState === "ok" ? "Kết nối thành công" : testState === "fail" ? "Kết nối thất bại" : "Đang kiểm tra…"}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">{testMsg || "—"}</span>
            </div>
          </div>
          <span className="label-caps text-on-surface-variant uppercase">Handshake</span>
        </div>
      ) : null}
    </div>
  );
}

function ModelCard({
  cfg, setCfg, models, fetching, onFetch, note,
}: {
  cfg: ByokConfig; setCfg: (n: Partial<ByokConfig>) => void;
  models: ModelRow[]; fetching: boolean; onFetch: () => void; note: string;
}) {
  return (
    <div className="card p-space-lg flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <span className="label-caps text-tertiary uppercase">Bước 3</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Lựa chọn & Tùy chỉnh Model (Model ID)</h2>
        </div>
        <button
          onClick={onFetch}
          className="flex items-center gap-space-xs px-space-sm py-1 rounded bg-surface-elevated text-primary hover:text-on-surface hover:bg-primary font-label-caps text-label-caps uppercase"
        >
          <span className={`material-symbols-outlined text-[14px] ${fetching ? "animate-spin" : ""}`}>sync</span>
          <span>{fetching ? "Đang tải…" : "Fetch Models"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
        <div className="flex flex-col gap-space-xs">
          <label className="label-caps text-on-surface uppercase">Danh mục phát hiện tự động</label>
          <div className="relative">
            <select
              className="input input-mono pr-10 appearance-none cursor-pointer"
              value={cfg.model}
              onChange={(e) => setCfg({ model: e.target.value })}
            >
              {models.length === 0 ? <option value={cfg.model}>(rỗng — nhập tay bên cạnh)</option> : null}
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label ? `${m.id} — ${m.label}` : m.id}</option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-2.5 text-on-surface-variant pointer-events-none text-[20px]">expand_more</span>
          </div>
        </div>
        <div className="flex flex-col gap-space-xs">
          <label className="label-caps text-on-surface uppercase">Hoặc nhập Model ID thủ công</label>
          <input
            type="text"
            className="input input-mono"
            placeholder="Ví dụ: gpt-4o-2024-11-20 hoặc mistral-large"
            value={cfg.model}
            onChange={(e) => setCfg({ model: e.target.value.trim() })}
          />
        </div>
      </div>
      {note ? <p className="font-body-sm text-body-sm text-warning">{note}</p> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md pt-space-xs">
        <Slider label="Temperature" min={0} max={1} step={0.05} value={cfg.temperature}
                onChange={(v) => setCfg({ temperature: v })} hint="Độ chính xác cao, ít bịa đặt" />
        <Slider label="Max Output Tokens" min={1024} max={8192} step={512} value={cfg.maxTokens}
                onChange={(v) => setCfg({ maxTokens: v })} hint="Đủ cho code diff + rubric" />
        <Slider label="Top P" min={0.1} max={1} step={0.05} value={cfg.topP}
                onChange={(v) => setCfg({ topP: v })} hint="Nucleus sampling tiêu chuẩn" />
      </div>
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange, hint }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div className="flex flex-col gap-space-xs bg-surface-container-lowest p-space-sm rounded-lg">
      <div className="flex justify-between items-center">
        <span className="label-caps text-on-surface uppercase">{label}</span>
        <span className="label-code-sm text-tertiary">{value.toFixed(2).replace(/\.00$/, "")}{max >= 1000 ? "" : ""}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary cursor-pointer"
      />
      {hint ? <span className="font-body-sm text-body-sm text-on-surface-variant">{hint}</span> : null}
    </div>
  );
}

function TelemetryCard() {
  const points = "0,48 24,42 48,46 72,32 96,38 120,24 144,30 168,18 192,26 216,14 240,20";
  return (
    <div className="card p-space-md flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
        <span className="label-caps text-tertiary uppercase">Session Telemetry</span>
        <span className="px-space-xs py-0.5 rounded bg-surface-elevated label-code-sm text-on-surface-variant">Local Only</span>
      </div>
      <div className="flex flex-col gap-space-sm">
        {[
          ["Active Architecture", "Client-to-LLM Mesh"],
          ["SQLite Server Sync", "Zero-Key Retention (WAL)"],
          ["Client Sandbox", "Strict CSP Enabled"],
          ["Estimated Token Fee", "0.00$ (Direct BYOK)"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between items-center py-1">
            <span className="font-body-sm text-body-sm text-on-surface-variant">{k}</span>
            <span className={`label-code-sm ${v === "0.00$ (Direct BYOK)" ? "text-primary" : "text-on-surface"}`}>{v}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-space-xs pt-space-xs">
        <div className="flex justify-between items-center">
          <span className="label-caps text-on-surface-variant uppercase">Độ trễ phản hồi (ms)</span>
          <span className="label-code-sm text-tertiary">Min 38 · Avg 46</span>
        </div>
        <div className="w-full h-16 bg-surface-container-lowest rounded-lg p-space-xs flex items-end">
          <svg className="w-full h-full text-tertiary overflow-visible" preserveAspectRatio="none" viewBox="0 0 240 60">
            <polyline fill="none" points={points} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            <circle cx="216" cy="14" r="3" className="fill-current text-tertiary" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function CapabilityCard() {
  const items = [
    "Stream phỏng vấn thời gian thực",
    "Chấm điểm Rubric định dạng JSON",
    "Trực tiếp đọc CV PDF kỹ thuật",
    "Không phụ thuộc máy chủ trung gian",
  ];
  return (
    <div className="card p-space-md flex flex-col gap-space-sm">
      <span className="label-caps text-on-surface uppercase">Khả năng đáp ứng yêu cầu</span>
      <div className="flex flex-col gap-space-xs pt-space-xs">
        {items.map((it) => (
          <div key={it} className="flex items-center gap-space-sm p-space-xs rounded bg-surface-container-lowest">
            <span className="material-symbols-outlined text-[16px] text-tertiary">check_circle</span>
            <span className="font-body-sm text-body-sm text-on-surface">{it}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecurityNote() {
  return (
    <div className="bg-surface-subtle p-space-md rounded-xl flex items-start gap-space-sm">
      <span className="material-symbols-outlined text-[20px] text-primary flex-shrink-0">info</span>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Khi chuyển đổi giữa các Provider, hệ thống tự động cập nhật schema prompt phỏng vấn tương ứng nhằm
        tối ưu hóa chất lượng câu hỏi phân cấp L3-Junior → L5-Senior → Staff.
      </p>
    </div>
  );
}
