"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { SrsLang, SrsProgressDTO } from "@/lib/srs-types";

/**
 * Bảng thẻ ngôn ngữ (S08) — AC-LG-6, AC-LG-11, AC-LG-12.
 *
 * ⚠️ P3 — tiến độ là **bằng chứng**: đếm số thẻ đã thuộc / đang học / chưa
 * học. KHÔNG hiển thị % hoàn thành mơ hồ (P7).
 */

export interface DeckCard {
  id: string;
  front: string;
  frontAlt: string | null;
  back: string;
  note: string | null;
  example: string | null;
  group: string | null;
  mode: string;
  due: string;
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
}

export interface LanguageDeckProps {
  lang: SrsLang;
  progress: SrsProgressDTO;
  cards: DeckCard[];
}

const PAGE_SIZE = 20;

export function LanguageDeck({ lang, progress, cards }: LanguageDeckProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter(
      (card) =>
        card.front.toLowerCase().includes(needle) ||
        card.back.toLowerCase().includes(needle) ||
        (card.group ?? "").toLowerCase().includes(needle),
    );
  }, [cards, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function addCard() {
    if (newFront.trim().length === 0 || newBack.trim().length === 0) return;

    setError(null);

    try {
      const res = await fetch("/api/srs/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          front: newFront.trim(),
          back: newBack.trim(),
        }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không thêm được thẻ");
        return;
      }

      setNewFront("");
      setNewBack("");
      setAdding(false);
      setToast("Đã thêm thẻ");
      window.location.reload();
    } catch {
      setError("Không kết nối được");
    }
  }

  return (
    <div className="space-y-gutter-md">
      <header className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Thẻ ngôn ngữ
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          {lang === "zh" ? "Tiếng Trung" : "Tiếng Anh"} ·{" "}
          {progress.total} thẻ trong bộ
        </p>
      </header>

      {/* Chuyển ngôn ngữ */}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Ngôn ngữ">
        {(
          [
            { value: "zh" as const, label: "Tiếng Trung", href: "/language?lang=zh" },
            { value: "en" as const, label: "Tiếng Anh", href: "/language?lang=en" },
          ]
        ).map((option) => (
          <Link
            key={option.value}
            href={option.href}
            aria-current={lang === option.value ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 font-label-md text-label-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              lang === option.value
                ? "bg-primary-container text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-highest",
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {/* Tiến độ — bằng chứng cụ thể */}
      <section className="rounded-xl bg-surface-container p-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Tiến độ ôn tập
        </h2>

        <div className="mt-space-md grid grid-cols-2 gap-gutter-md sm:grid-cols-4">
          <StatBox label="Đã thuộc" value={progress.mastered} />
          <StatBox label="Đang học" value={progress.learning} />
          <StatBox label="Chưa học" value={progress.fresh} />
          <StatBox label="Đến hạn hôm nay" value={progress.dueToday} />
        </div>

        <p className="mt-space-md font-label-sm text-label-sm text-outline tabular">
          Chuỗi ôn: {progress.streak} ngày · retrievability trung bình{" "}
          {Math.round(progress.avgRetrievability * 100)}%
        </p>

        <div className="mt-space-md flex flex-wrap gap-space-sm">
          <Link
            href={`/srs/review?lang=${lang}`}
            className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="play_arrow" size={16} />
            Bắt đầu ôn
          </Link>

          {/* AC-LG-12 — xuất deck JSON */}
          <a
            href={`/api/srs/cards?lang=${lang}`}
            download
            className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="download" size={16} />
            Xuất deck
          </a>
        </div>
      </section>

      {/* AC-LG-11 — thêm thẻ thủ công */}
      <section className="rounded-xl bg-surface-container-low p-space-lg">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Thẻ của tôi
          </h2>

          <button
            type="button"
            onClick={() => setAdding((current) => !current)}
            className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="add" size={16} />
            {adding ? "Đóng" : "Thêm thẻ"}
          </button>
        </div>

        {adding && (
          <div className="mt-space-md space-y-space-sm">
            <div>
              <label
                htmlFor="new-front"
                className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
              >
                Mặt trước
              </label>
              <input
                id="new-front"
                type="text"
                value={newFront}
                onChange={(event) => setNewFront(event.target.value)}
                placeholder={lang === "zh" ? "pinyin" : "word"}
                className="mt-space-xs w-full rounded-lg bg-surface-container-lowest p-space-sm text-body-md text-body-md text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            <div>
              <label
                htmlFor="new-back"
                className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
              >
                Mặt sau
              </label>
              <input
                id="new-back"
                type="text"
                value={newBack}
                onChange={(event) => setNewBack(event.target.value)}
                placeholder="nghĩa"
                className="mt-space-xs w-full rounded-lg bg-surface-container-lowest p-space-sm text-body-md text-body-md text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            <button
              type="button"
              onClick={() => void addCard()}
              disabled={newFront.trim().length === 0 || newBack.trim().length === 0}
              className="rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Lưu thẻ
            </button>

            {error && (
              <p role="alert" className="font-label-sm text-label-sm text-error">
                {error}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Tìm kiếm */}
      <div>
        <label htmlFor="deck-search" className="sr-only">
          Tìm thẻ
        </label>
        <input
          id="deck-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          placeholder="Tìm thẻ…"
          className="w-full rounded-lg bg-surface-container-low p-space-sm text-body-md text-body-md text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      {/* Bảng thẻ */}
      {visible.length === 0 ? (
        <p className="font-body-md text-body-md text-on-surface-variant">
          Không có thẻ nào khớp.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-surface-container-low">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Danh sách thẻ ngôn ngữ</caption>
            <thead>
              <tr className="border-b border-outline-variant">
                <th scope="col" className="px-space-md py-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Mặt trước
                </th>
                <th scope="col" className="px-space-md py-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Mặt sau
                </th>
                <th scope="col" className="px-space-md py-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Lượt ôn
                </th>
                <th scope="col" className="px-space-md py-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Stability
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((card) => (
                <tr key={card.id} className="border-b border-outline-variant/40">
                  <td className="px-space-md py-2 font-code-md text-code-md text-on-surface">
                    {card.front}
                    {card.frontAlt && (
                      <span className="ml-2 text-outline">{card.frontAlt}</span>
                    )}
                  </td>
                  <td className="px-space-md py-2 text-body-sm text-body-sm text-on-surface-variant">
                    {card.back}
                  </td>
                  <td className="px-space-md py-2 font-code-md text-code-md text-on-surface tabular">
                    {card.reps}
                    {card.lapses > 0 && (
                      <span className="ml-1 text-error">({card.lapses} quên)</span>
                    )}
                  </td>
                  <td className="px-space-md py-2 font-code-md text-code-md text-on-surface tabular">
                    {card.stability.toFixed(1)} ngày
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Phân trang */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-space-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Trước
          </button>
          <span className="font-label-sm text-label-sm text-outline tabular">
            Trang {page + 1}/{totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Sau
          </button>
        </div>
      )}

      {toast && (
        <p role="status" aria-live="polite" className="font-label-sm text-label-sm text-primary">
          {toast}
        </p>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-container p-space-md">
      <div className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
        {label}
      </div>
      <div className="mt-space-xs font-headline-sm text-headline-sm text-on-surface tabular">
        {value}
      </div>
    </div>
  );
}
