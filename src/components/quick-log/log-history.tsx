"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { LogDomain, LogEntry } from "@/lib/log";

/**
 * Lịch sử quick-log (FR-QL-10) — theo ngày + lọc domain.
 */
export interface LogHistoryProps {
  /** Ngày đang xem (yyyy-MM-dd). */
  date: string;
  initialItems: LogEntry[];
  initialTotal: number;
}

const DOMAIN_FILTERS: Array<{ key: LogDomain | "all"; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "professional", label: "Chuyên môn" },
  { key: "communication", label: "Giao tiếp" },
  { key: "language", label: "Ngoại ngữ" },
  { key: "personal", label: "Cá nhân" },
];

const LANGUAGE_LABELS: Record<string, string> = {
  en: "EN",
  zh: "中文",
  vi: "VI",
};

export function LogHistory({ date, initialItems, initialTotal }: LogHistoryProps) {
  const router = useRouter();
  const [items] = useState(initialItems);
  const [filter, setFilter] = useState<LogDomain | "all">("all");
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [deleting, setDeleting] = useState<LogEntry | null>(null);

  const visible = filter === "all" ? items : items.filter((i) => i.domain === filter);

  async function remove(id: string) {
    await fetch(`/api/log/${id}`, { method: "DELETE" });
    setDeleting(null);
    router.refresh();
  }

  async function saveEdit(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/log/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="space-y-gutter-md">
      {/* Lọc domain (FR-QL-10) */}
      <div className="flex flex-wrap gap-space-xs">
        {DOMAIN_FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            aria-pressed={filter === option.key}
            className={cn(
              "rounded-lg px-3 py-1.5 font-label-md text-label-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              filter === option.key
                ? "bg-primary-container text-on-primary"
                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="font-label-sm text-label-sm text-outline">
        {visible.length} / {initialTotal} mục · {date}
      </p>

      {visible.length === 0 ? (
        <p className="rounded-xl bg-surface-container-low p-space-lg text-body-md text-body-md text-on-surface-variant">
          Chưa có hoạt động nào.{" "}
          <a href="/log" className="text-primary underline">
            Ghi nhanh ngay
          </a>
        </p>
      ) : (
        <ul className="space-y-space-sm">
          {visible.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-space-sm rounded-xl bg-surface-container-low p-space-md"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body-md text-body-md text-on-surface">{item.title}</p>

                <p className="mt-space-xs flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-outline">
                  <span className="rounded bg-surface-container px-1.5 py-0.5">
                    {item.domain}
                  </span>
                  <span>{item.minutes} phút</span>
                  {item.language && (
                    <span className="rounded bg-surface-container px-1.5 py-0.5">
                      {LANGUAGE_LABELS[item.language] ?? item.language}
                    </span>
                  )}
                  {item.skillName && <span>· {item.skillName}</span>}
                  {item.hasEvidence && (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Icon name="verified" size={12} />
                      Có bằng chứng
                    </span>
                  )}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  aria-label={`Sửa ${item.title}`}
                  className="rounded-lg p-1.5 text-outline transition hover:bg-surface-container-highest hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Icon name="edit" size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(item)}
                  aria-label={`Xoá ${item.title}`}
                  className="rounded-lg p-1.5 text-outline transition hover:bg-surface-container-highest hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Icon name="delete" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <LogEditDialog
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => void saveEdit(editing.id, patch)}
        />
      )}

      {deleting && (
        <LogDeleteDialog
          entry={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => void remove(deleting.id)}
        />
      )}
    </div>
  );
}

/** Dialog sửa 1 mục (FR-QL-11). */
function LogEditDialog({
  entry,
  onClose,
  onSave,
}: {
  entry: LogEntry;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(entry.title);
  const [minutes, setMinutes] = useState(entry.minutes);
  const [difficulty, setDifficulty] = useState(entry.difficulty ?? 2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-container-lowest/80 p-margin backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-edit-title"
        className="w-full max-w-md rounded-xl bg-surface-container-high p-space-lg shadow-md"
      >
        <h2 id="log-edit-title" className="font-headline-md text-headline-md text-on-surface">
          Sửa mục đã ghi
        </h2>

        <div className="mt-space-md space-y-space-md">
          <label className="flex flex-col gap-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
              Mô tả
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg bg-surface-container px-2 py-1.5 text-body-sm text-body-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
              Thời lượng (phút)
            </span>
            <input
              type="number"
              min={1}
              max={240}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
              className="w-full rounded-lg bg-surface-container px-2 py-1.5 font-code-md text-code-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
              Mức độ khó (1–4)
            </span>
            <input
              type="number"
              min={1}
              max={4}
              value={difficulty}
              onChange={(event) => setDifficulty(Number(event.target.value))}
              className="w-full rounded-lg bg-surface-container px-2 py-1.5 font-code-md text-code-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
        </div>

        <div className="mt-space-lg flex justify-end gap-space-sm">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-container px-3 py-1.5 font-label-md text-label-md text-on-surface-variant transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => onSave({ text: title, minutes, difficulty })}
            className="rounded-lg bg-primary-container px-4 py-1.5 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

/** Dialog xoá 1 mục (FR-QL-12). */
function LogDeleteDialog({
  entry,
  onClose,
  onConfirm,
}: {
  entry: LogEntry;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-container-lowest/80 p-margin backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-delete-title"
        className="w-full max-w-sm rounded-xl bg-surface-container-high p-space-lg shadow-md"
      >
        <h2 id="log-delete-title" className="font-headline-md text-headline-md text-on-surface">
          Xoá mục này?
        </h2>

        <p className="mt-space-sm text-body-sm text-body-sm text-on-surface-variant">
          “{entry.title}” — bằng chứng gắn với mục này cũng bị xoá, và level kỹ
          năng được tính lại.
        </p>

        <div className="mt-space-lg flex justify-end gap-space-sm">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-container px-3 py-1.5 font-label-md text-label-md text-on-surface-variant transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-error-container px-4 py-1.5 font-label-md text-label-md font-semibold text-on-error-container transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Xoá
          </button>
        </div>
      </div>
    </div>
  );
}
