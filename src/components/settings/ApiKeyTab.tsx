"use client";

/**
 * S15 — Tab 2 "Khóa API Anthropic & Kết nối" (tasks.md 9.3 / 9.4 / 9.5).
 *
 * ⚠️ AC-16 — 4 điều khoá hiển thị trong card "NGUYÊN TẮC BẢO MẬT P6 STRICT":
 *   1. Key lưu local (chỉ trong `.env.local` trên máy người dùng).
 *   2. Không commit (`.env.local` nằm trong `.gitignore`).
 *   3. Không hiển thị đầy đủ trong UI (chỉ `sk-ant-••••••••`).
 *   4. Nhật ký / dữ liệu cá nhân không rời máy.
 *
 * Ô nhập là `type="password"` và **không** bao giờ nhận giá trị key thật từ server
 * — server chỉ trả về chuỗi đã che.
 *
 * Xem design.md §4.15 · requirements.md AC-16 · tech.md rule 6.
 */

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, StatusDot } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useEffect, useState } from "react";

/** Trạng thái của nút ping — 3 mỗc UI theo design.md §4.15. */
type PingState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "ok"; latencyMs: number; detail: string }
  | { phase: "error"; message: string };

/** 4 điều khoá P6 STRICT — nội dung bắt buộc của card bảo mật (task 9.5). */
const P6_LOCKS = [
  {
    icon: "lock",
    title: "Khóa lưu local",
    detail: "Chỉ nằm trong file `.env.local` ở thư mục gốc project trên máy bạn.",
  },
  {
    icon: "do_not_disturb_on",
    title: "Không bao giờ commit",
    detail: "`.env.local` nằm trong `.gitignore` — không thể bị đẩy lên git.",
  },
  {
    icon: "visibility_off",
    title: "Không hiển thị đầy đủ",
    detail: "UI chỉ hiện `sk-ant-••••••••`; server không bao giờ trả key đầy đủ.",
  },
  {
    icon: "phonelink_lock",
    title: "Nhật ký không rời máy",
    detail: "Dữ liệu sinh trắc và nhật ký chỉ lưu SQLite cục bộ, không đồng bộ đám mây.",
  },
] as const;

export function ApiKeyTab({
  initialConfigured,
  initialMasked,
}: {
  /** Server đã đọc `.env.local` — key có tồn tại hay không. */
  initialConfigured: boolean;
  /** Key đã che (hoặc `null`). */
  initialMasked: string | null;
}) {
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(initialConfigured);
  const [masked, setMasked] = useState(initialMasked);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveOk, setSaveOk] = useState(true);
  const [ping, setPing] = useState<PingState>({ phase: "idle" });
  const [emergency, setEmergency] = useState(false);

  // Đồng bộ lại sau khi server render lại trang (sau khi lưu key).
  useEffect(() => {
    setConfigured(initialConfigured);
    setMasked(initialMasked);
  }, [initialConfigured, initialMasked]);

  /** Lưu khóa → `POST /api/settings/key` (server ghi `.env.local`). */
  const handleSave = async () => {
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch("/api/settings/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        data?: { masked: string };
        error?: { message: string };
      };
      if (body.ok && body.data) {
        setConfigured(true);
        setMasked(body.data.masked);
        setApiKey("");
        setSaveOk(true);
        setSaveMessage("Đã lưu khóa vào .env.local trên máy của bạn.");
      } else {
        setSaveOk(false);
        setSaveMessage(body.error?.message ?? "Không lưu được khóa.");
      }
    } catch {
      setSaveOk(false);
      setSaveMessage("Không kết nối được tới máy chủ cục bộ.");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Ping Anthropic → `POST /api/settings/key` với `{ action: "ping" }`.
   *
   * Request đi thẳng từ máy người dùng tới `api.anthropic.com` — key không đi
   * qua server trung gian nào.
   */
  const handlePing = async () => {
    setPing({ phase: "running" });
    try {
      const response = await fetch("/api/settings/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ping" }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        data?: { latencyMs: number; detail: string };
        error?: { message: string };
      };
      if (body.ok && body.data) {
        setPing({ phase: "ok", latencyMs: body.data.latencyMs, detail: body.data.detail });
      } else {
        setPing({ phase: "error", message: body.error?.message ?? "Không kết nối được." });
      }
    } catch {
      setPing({ phase: "error", message: "Không kết nối được." });
    }
  };

  return (
    <div className="grid gap-gutter-lg lg:grid-cols-12">
      {/* ── Cột trái: cấu hình khóa ─────────────────────────────────────── */}
      <div className="space-y-gutter-lg lg:col-span-7">
        <Card>
          <CardHeader
            title="Cấu Hình Khóa API"
            subtitle="ANTHROPIC CLOUD BRIDGE · ENV V1.1"
            icon="key"
            action={<Badge tone="primary">ENV V1.1</Badge>}
          />

          <div className="space-y-gutter">
            {/* Ô nhập key — type=password, không bao giờ prefill giá trị thật. */}
            <div className="space-y-space-xs">
              <label
                htmlFor="anthropic-api-key"
                className="block font-label-sm uppercase text-on-surface-variant"
              >
                ANTHROPIC_API_KEY
              </label>
              <Input
                id="anthropic-api-key"
                type="password"
                value={apiKey}
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-••••••••••••"
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-body-sm text-on-surface-variant">
                Key được ghi vào <code className="font-code-md text-primary">.env.local</code> trên
                máy này. Không gửi đi đâu.
              </p>
            </div>

            {/* Trạng thái hiện tại + hành động */}
            <div className="flex flex-wrap items-center justify-between gap-space-md">
              <span className="flex items-center gap-1.5 font-code-md text-primary">
                <StatusDot tone={configured ? "primary" : "outline"} />
                {configured ? `Đã cấu hình: ${masked ?? "sk-ant-••••••••"}` : "Chưa cấu hình API key"}
              </span>
              <Button
                variant="primary"
                loading={saving}
                disabled={apiKey.trim().length === 0}
                onClick={handleSave}
                icon="save"
              >
                Lưu khóa
              </Button>
            </div>

            {/* Thông báo sau khi lưu — aria-live polite (design.md §7.3). */}
            <p
              className={`text-body-sm ${saveOk ? "text-primary" : "text-error"}`}
              role="status"
              aria-live="polite"
            >
              {saveMessage}
            </p>

            {/* Nút ping — 3 trạng thái UI theo design.md §4.15 */}
            <div className="space-y-space-xs border-t border-outline-variant/30 pt-gutter">
              <Button
                variant="secondary"
                loading={ping.phase === "running"}
                onClick={handlePing}
                icon="sync"
                className="w-full"
              >
                Chạy kiểm tra Ping Anthropic Endpoint
              </Button>

              <p className="text-body-sm text-on-surface-variant" role="status" aria-live="polite">
                {ping.phase === "running" ? "Đang kiểm tra kết nối..." : null}
                {ping.phase === "ok"
                  ? `Hoàn tất: ${ping.latencyMs}ms (${ping.detail})`
                  : null}
                {ping.phase === "error" ? ping.message : null}
                {ping.phase === "idle" ? "1 request tối thiểu, đo độ trễ thực tế." : null}
              </p>

              {ping.phase === "ok" ? (
                <span className="font-code-md text-primary">
                  Đã kiểm tra: OK ({ping.latencyMs}ms)
                </span>
              ) : null}
            </div>
          </div>
        </Card>

        {/* Card P6 STRICT — 4 điều khoá (task 9.5) */}
        <Card tone="low">
          <div className="space-y-space-md">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-tertiary" aria-hidden>
                security
              </span>
              <span className="font-label-md font-semibold text-tertiary">
                NGUYÊN TẮC BẢO MẬT P6 STRICT
              </span>
            </div>

            <p className="text-body-sm leading-relaxed text-on-surface-variant">
              Key chỉ được lưu trữ an toàn trong file{" "}
              <code className="rounded bg-surface-container-highest px-1 py-0.5 font-code-md text-primary">
                .env.local
              </code>{" "}
              trên máy tính cá nhân của bạn, không bao giờ được gửi qua máy chủ trung gian hay dịch vụ
              lưu trữ đám mây.
            </p>

            <ul className="grid gap-space-md sm:grid-cols-2">
              {P6_LOCKS.map((lock) => (
                <li
                  key={lock.title}
                  className="rounded-lg border border-outline-variant/25 bg-surface-container p-space-md"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary" aria-hidden>
                      {lock.icon}
                    </span>
                    <span className="font-label-md text-on-surface">{lock.title}</span>
                  </div>
                  <p className="mt-1 text-body-sm text-on-surface-variant">{lock.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* ── Cột phải: chế độ khẩn cấp + trạng thái vault ─────────────────── */}
      <div className="space-y-gutter-lg lg:col-span-5">
        <Card>
          <CardHeader
            title="Chế độ khẩn cấp tiết kiệm"
            subtitle="Chỉ dùng Claude Haiku + rule cục bộ khi offline hoặc vượt 80% ngân sách"
            icon="energy_savings_leaf"
          />
          <div className="flex items-start justify-between gap-gutter">
            <p className="text-body-sm text-on-surface-variant">
              Bật → hệ thống ưu tiên model nhẹ và rule cục bộ. Phase 0 chỉ là công tắc giao diện —
              backend sẽ nối ở task 17.6.
            </p>
            <label className="relative inline-flex shrink-0 cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={emergency}
                onChange={(e) => setEmergency(e.target.checked)}
                aria-label="Bật chế độ khẩn cấp tiết kiệm"
              />
              <span className="h-6 w-11 rounded-full bg-surface-container-highest peer-focus:outline-none peer-checked:bg-primary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-[9999px] after:bg-on-surface after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:bg-on-primary-container" />
            </label>
          </div>
        </Card>

        <Card tone="low">
          <div className="space-y-space-md">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-outline" aria-hidden>
                shield_lock
              </span>
              <span className="font-label-sm uppercase tracking-widest text-outline">Local Vault</span>
            </div>
            <p className="font-headline-sm text-on-surface">Sealed</p>
            <p className="text-body-sm text-on-surface-variant">
              Kho lưu trữ cục bộ đang đóng. File <code className="font-code-md text-primary">.env.local</code>{" "}
              nằm ngoài thư mục <code className="font-code-md text-primary">public/</code> nên không bao giờ
              được phục vụ qua HTTP.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
