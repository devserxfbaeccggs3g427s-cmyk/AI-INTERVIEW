"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";

/**
 * Quản lý dữ liệu (S15 — FR-SC-24..27).
 *
 * ⚠️ FR-SC-25 — xoá trắng cần xác nhận **2 bước**:
 *   1. Mở hộp thoại cảnh báo.
 *   2. Gõ đúng `XOA` để mở khóa nút xoá.
 *
 * ⚠️ FR-SC-24 — xuất JSON chứa toàn bộ bảng + metadata.
 * ⚠️ FR-SC-26 — hiện dung lượng DB + số bản ghi từng bảng.
 * ⚠️ FR-SC-27 — nhật ký "dữ liệu nào đã gửi lên".
 */

export interface DataPanelProps {
  initialStats: {
    dbSizeBytes: number;
    tables: Array<{ name: string; rows: number }>;
  };
  initialPrivacyLog: Array<{
    id: string;
    createdAt: string;
    feature: string;
    model: string;
    dataKinds: string[];
    dataPreview: string | null;
    estimatedCost: number;
  }>;
}

const FEATURE_LABELS: Record<string, string> = {
  daily_plan: "Sinh kế hoạch",
  grading: "Chấm điểm",
  journal_feedback: "Phản hồi nhật ký",
  weekly_review: "Review tuần",
  classify: "Phân loại",
  roleplay: "Hội thoại",
  mock_interview: "Phỏng vấn",
  language_test: "Bài thi",
};

export function DataPanel({ initialStats, initialPrivacyLog }: DataPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [wiping, setWiping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ⚠️ FR-SC-25 — phải gõ đúng "XOA" mới mở khoá.
  const unlocked = confirmation.trim() === "XOA";

  async function wipe() {
    if (!unlocked) return;

    setWiping(true);
    setError(null);

    try {
      const res = await fetch("/api/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không xoá được");
        return;
      }

      const total = Object.values(payload.data.deleted as Record<string, number>)
        .reduce((sum, n) => sum + n, 0);

      setMessage(`Đã xoá ${total} bản ghi`);
      setConfirmOpen(false);
      setConfirmation("");
    } catch {
      setError("Không kết nối được");
    } finally {
      setWiping(false);
    }
  }

  return (
    <div className="space-y-gutter-md">
      {/* FR-SC-26 — dung lượng + số bản ghi */}
      <section className="rounded-xl bg-surface-container p-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Dung lượng dữ liệu
        </h2>

        <p className="mt-space-sm font-headline-sm text-headline-sm text-primary tabular">
          {(initialStats.dbSizeBytes / 1024).toFixed(1)} KB
        </p>

        <ul className="mt-space-md space-y-space-xs">
          {initialStats.tables.map((table) => (
            <li
              key={table.name}
              className="flex items-baseline justify-between gap-space-sm border-b border-outline-variant/40 py-1"
            >
              <span className="font-code-md text-code-md text-on-surface">
                {table.name}
              </span>
              <span className="font-code-md text-code-md text-on-surface tabular">
                {table.rows.toLocaleString("vi-VN")} bản ghi
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* FR-SC-24 — xuất JSON */}
      <section className="rounded-xl bg-surface-container p-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Xuất dữ liệu
        </h2>
        <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
          1 file JSON chứa toàn bộ bảng + hồ sơ + metadata (schemaVersion,
          exportedAt, appVersion).
        </p>

        <a
          href="/api/data/export"
          download
          className="mt-space-md inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="download" size={16} />
          Xuất toàn bộ dữ liệu (JSON)
        </a>
      </section>

      {/* FR-SC-27 — nhật ký dữ liệu đã gửi lên */}
      <section className="rounded-xl bg-surface-container p-space-lg">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Dữ liệu đã gửi lên API
          </h2>
          <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-outline">
            <Icon name="lock" size={12} />
            Minh bạch — bạn thấy đúng những gì đã rời máy
          </span>
        </div>

        {initialPrivacyLog.length === 0 ? (
          <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
            Chưa có dữ liệu nào được gửi lên.
          </p>
        ) : (
          <ul className="mt-space-md space-y-space-sm">
            {initialPrivacyLog.map((item) => (
              <li
                key={item.id}
                className="rounded-lg bg-surface-container-low p-space-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-space-sm">
                  <span className="font-code-md text-code-md text-on-surface">
                    {FEATURE_LABELS[item.feature] ?? item.feature}
                    <span className="ml-2 text-outline">{item.model}</span>
                  </span>
                  <span className="font-code-md text-code-md text-outline tabular">
                    {new Date(item.createdAt).toLocaleString("vi-VN")}
                  </span>
                </div>

                <p className="mt-space-xs font-label-sm text-label-sm text-outline">
                  Loại dữ liệu:{" "}
                  {item.dataKinds.length > 0
                    ? item.dataKinds.join(", ")
                    : "— (chỉ gửi metadata)"}
                </p>

                {item.dataPreview && (
                  <p className="mt-space-xs line-clamp-2 font-body-sm text-body-sm text-on-surface-variant">
                    {item.dataPreview}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* FR-SC-25 — xoá trắng, xác nhận 2 bước */}
      <section className="rounded-xl bg-surface-container p-space-lg">
        <h2 className="font-headline-md text-headline-md text-error">
          Xoá trắng dữ liệu
        </h2>
        <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
          Xoá toàn bộ hoạt động, bằng chứng, kế hoạch, nhật ký, chỉ số và lịch
          sử gọi AI. Cây kỹ năng và bộ thẻ gốc được giữ nguyên.
        </p>

        {!confirmOpen ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="mt-space-md rounded-lg bg-error/15 px-4 py-2 font-label-md text-label-md font-semibold text-error transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Xoá trắng dữ liệu
          </button>
        ) : (
          <div className="mt-space-md rounded-lg bg-error/10 p-space-md">
            {/* Bước 1 — cảnh báo */}
            <p className="font-label-md text-label-md text-error">
              Bước 1/2 — Xác nhận
            </p>
            <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
              Hành động này KHÔNG thể hoàn tác. Toàn bộ tiến độ đo được sẽ
              mất. Hãy xuất JSON trước nếu cần sao lưu.
            </p>

            {/* Bước 2 — gõ "XOA" */}
            <label
              htmlFor="wipe-confirm"
              className="mt-space-md block font-label-sm text-label-sm uppercase tracking-wider text-outline"
            >
              Bước 2/2 — Gõ đúng <code className="font-code-md text-code-md">XOA</code>{" "}
              để mở khoá
            </label>
            <input
              id="wipe-confirm"
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              className="mt-space-xs w-full rounded-lg bg-surface-container-low p-space-sm font-code-md text-code-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />

            <div className="mt-space-md flex flex-wrap gap-space-sm">
              <button
                type="button"
                onClick={() => void wipe()}
                disabled={!unlocked || wiping}
                className="rounded-lg bg-error px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {wiping ? "Đang xoá…" : "Xoá vĩnh viễn"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmation("");
                }}
                className="rounded-lg bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Huỷ
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-space-sm font-label-sm text-label-sm text-error">
                {error}
              </p>
            )}
          </div>
        )}

        {message && (
          <p
            role="status"
            aria-live="polite"
            className="mt-space-sm font-label-sm text-label-sm text-primary"
          >
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
