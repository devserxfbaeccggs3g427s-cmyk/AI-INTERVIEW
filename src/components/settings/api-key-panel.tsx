"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Quản lý API key (S15 — FR-SC-08..14).
 *
 * ⚠️ FR-SC-11 — key chỉ hiện dạng che `sk-ant-…abcd` (4 ký tự cuối).
 * Nút mắt chỉ bật/tắt hiển thị, KHÔNG bao giờ hiện key đầy đủ.
 *
 * ⚠️ FR-SC-12 — sau khi lưu key mới phải hiện cảnh báo "cần khởi động lại
 * dev server" kèm bước kiểm tra.
 */

export interface ApiKeyPanelProps {
  initialHasKey: boolean;
  initialMaskedKey: string | null;
}

type KeyStatus = "none" | "valid" | "invalid" | "rate_limited" | "error";

export function ApiKeyPanel({ initialHasKey, initialMaskedKey }: ApiKeyPanelProps) {
  const [hasKey, setHasKey] = useState(initialHasKey);
  const [maskedKey, setMaskedKey] = useState(initialMaskedKey);
  const [apiKey, setApiKey] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [status, setStatus] = useState<KeyStatus>(
    initialHasKey ? "valid" : "none",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function save() {
    if (apiKey.trim().length === 0) return;

    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/settings/key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setStatus("invalid");
        setStatusMessage(payload.message ?? "Không lưu được key");
        return;
      }

      setHasKey(true);
      setMaskedKey(payload.data.maskedKey);
      setApiKey("");
      setShowInput(false);
      // ⚠️ FR-SC-12 — cần restart dev server.
      setNeedsRestart(true);
      setStatusMessage("Đã lưu key");
    } catch {
      setStatus("error");
      setStatusMessage("Không kết nối được");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/settings/key/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });

      const payload = await res.json();
      if (payload.ok) {
        setStatus("valid");
        setStatusMessage("Key hợp lệ — kết nối được tới Anthropic");
        return;
      }

      const message = payload.message ?? "Không kiểm tra được";
      if (message.includes("401") || message.includes("không hợp lệ")) {
        setStatus("invalid");
      } else if (message.includes("429")) {
        setStatus("rate_limited");
      } else {
        setStatus("error");
      }
      setStatusMessage(message);
    } catch {
      setStatus("error");
      setStatusMessage("Không kết nối được");
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/key", { method: "DELETE" });
      const payload = await res.json();
      if (!payload.ok) {
        setStatusMessage(payload.message ?? "Không xoá được key");
        return;
      }

      setHasKey(false);
      setMaskedKey(null);
      setStatus("none");
      setNeedsRestart(true);
      setStatusMessage("Đã xoá key — app chuyển sang offline mode");
    } catch {
      setStatusMessage("Không kết nối được");
    } finally {
      setSaving(false);
    }
  }

  const statusChip = {
    none: { label: "Chưa có key", className: "bg-outline/15 text-outline" },
    valid: { label: "Hợp lệ", className: "bg-primary/10 text-primary" },
    invalid: { label: "Sai key", className: "bg-error/15 text-error" },
    rate_limited: {
      label: "Bị giới hạn tần suất",
      className: "bg-tertiary/20 text-tertiary",
    },
    error: { label: "Lỗi kết nối", className: "bg-error/15 text-error" },
  }[status];

  return (
    <section className="rounded-xl bg-surface-container p-space-lg">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          API key Anthropic
        </h2>

        {/* FR-SC-09 — chip trạng thái kết nối */}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-label-sm text-label-sm",
            statusChip.className,
          )}
        >
          {statusChip.label}
        </span>
      </div>

      {/* Key hiện tại — FR-SC-11 */}
      <div className="mt-space-md">
        {hasKey ? (
          <div className="flex flex-wrap items-center gap-space-sm">
            <code className="rounded-lg bg-surface-container-low px-3 py-2 font-code-md text-code-md text-on-surface">
              {maskedKey}
            </code>
            <span className="font-label-sm text-label-sm text-outline">
              Key chỉ hiện dạng che — không thể xem đầy đủ.
            </span>
          </div>
        ) : (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Chưa có API key. Tính năng AI sẽ báo &quot;cần API key&quot; thay vì gọi
            API.
          </p>
        )}
      </div>

      {/* Nhập key mới */}
      <div className="mt-space-md space-y-space-sm">
        <label
          htmlFor="api-key"
          className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
        >
          {hasKey ? "Thay thế key" : "Nhập key"}
        </label>

        <div className="flex flex-wrap gap-space-sm">
          <div className="relative min-w-0 flex-1">
            <input
              id="api-key"
              type={showInput ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
              className="w-full rounded-lg bg-surface-container-low p-space-sm font-code-md text-code-md text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {/* FR-SC-11 — nút mắt chỉ bật/tắt hiển thị ô nhập. */}
            <button
              type="button"
              onClick={() => setShowInput((current) => !current)}
              aria-label={showInput ? "Ẩn key" : "Hiện key"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-outline transition hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon name={showInput ? "visibility_off" : "visibility"} size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || apiKey.trim().length === 0}
            className="rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {saving ? "Đang lưu…" : "Lưu key"}
          </button>
        </div>
      </div>

      {/* Test + xoá */}
      <div className="mt-space-md flex flex-wrap gap-space-sm">
        {/* FR-SC-10 — ping 1 request tối thiểu */}
        <button
          type="button"
          onClick={() => void test()}
          disabled={testing || (!hasKey && apiKey.trim().length === 0)}
          className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="wifi" size={16} />
          {testing ? "Đang kiểm tra…" : "Chạy kiểm tra Ping Anthropic Endpoint"}
        </button>

        {hasKey && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={saving}
            className="rounded-lg bg-surface-container-high px-3 py-2 font-label-md text-label-md text-error transition hover:bg-surface-container-highest disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Xoá key
          </button>
        )}
      </div>

      {statusMessage && (
        <p
          role={status === "valid" ? "status" : "alert"}
          className={cn(
            "mt-space-sm font-label-sm text-label-sm",
            status === "valid" ? "text-primary" : "text-error",
          )}
        >
          {statusMessage}
        </p>
      )}

      {/* FR-SC-12 — cảnh báo cần restart */}
      {needsRestart && (
        <div
          role="alert"
          className="mt-space-md rounded-lg bg-tertiary/10 p-space-md"
        >
          <p className="font-label-md text-label-md text-tertiary">
            Cần khởi động lại dev server để có hiệu lực
          </p>
          <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
            Biến môi trường được nạp lúc khởi động. Bước kiểm tra: dừng
            server (Ctrl+C), chạy lại <code className="font-code-md text-code-md">npm run dev</code>,
            rồi mở trang Cài đặt — chip trạng thái sẽ cập nhật.
          </p>
        </div>
      )}
    </section>
  );
}
