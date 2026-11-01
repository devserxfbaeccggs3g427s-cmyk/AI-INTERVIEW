"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import {
  TEST_TOPIC_GROUP_LABELS,
  type Lang,
} from "@/lib/test-topics";
import type { ItemType } from "@/lib/test";

export interface TestHubSession {
  id: string;
  testType: string;
  topic: string | null;
  score: number;
  maxScore: number;
  level: string | null;
  label: string;
  date: string;
}

export interface TestHubData {
  lang: Lang;
  profile: { level: string; hasApiKey: boolean };
  placements: TestHubSession[];
  topics: TestHubSession[];
  benchmarks: TestHubSession[];
  benchmarkTrend: Array<{ id: string; label: string; rate: number; level: string | null; date: string }>;
  byItemType: Array<{ itemType: ItemType; correct: number; total: number; rate: number }>;
  topWrongWords: Array<{ cardId: string; front: string; frontAlt: string | null; back: string; wrongCount: number }>;
  pushedCards: { count: number };
}

export interface TestHubProps {
  initialLang: Lang;
  data: TestHubData;
  topicGroups: readonly string[];
}

/**
 * S19 — Danh sách bài kiểm tra.
 *
 * ⚠️ NFR-LT-02: không có API key ⇒ ẩn nút sinh đề AI, hiện hướng dẫn thêm key.
 * ⚠️ P7: mọi số liệu đến từ `data` (query DB) — không có số hardcode.
 */
export function TestHub({ initialLang, data, topicGroups }: TestHubProps) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>(initialLang);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [showSourceSheet, setShowSourceSheet] = useState(false);

  useEffect(() => {
    setError(null);
  }, [lang]);

  const hasApiKey = data.profile.hasApiKey;

  const startTest = useCallback(
    async (testType: string, topic?: string) => {
      setCreating(testType);
      setError(null);
      try {
        const res = await fetch("/api/test/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lang,
            testType,
            topic: topic ?? null,
          }),
        });
        const body = (await res.json()) as {
          ok: boolean;
          data?: { testId: string };
          error?: string;
          message?: string;
        };

        if (!body.ok || !body.data) {
          // 409 ⇒ đang có phiên active → đưa người dùng về phiên đó.
          if (body.error === "conflict") {
            const active = await findActiveTest(lang);
            if (active) {
              router.push(`/test/session?testId=${active}`);
              return;
            }
          }
          setError(body.message ?? "Không tạo được đề — thử lại.");
          return;
        }

        router.push(`/test/session?testId=${body.data.testId}`);
      } catch {
        setError("Không tạo được đề — thử lại.");
      } finally {
        setCreating(null);
      }
    },
    [lang, router],
  );

  const createFromContent = useCallback(async () => {
    if (!sourceText.trim()) {
      setError("Dán văn bản cần đọc hiểu trước khi tạo đề.");
      return;
    }
    setCreating("from_content");
    setError(null);
    try {
      const res = await fetch("/api/test/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          testType: "from_content",
          sourceText: sourceText.slice(0, 8000),
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { testId: string };
        error?: string;
        message?: string;
      };
      if (!body.ok || !body.data) {
        setError(body.message ?? "Không tạo được đề từ nội dung — thử lại.");
        return;
      }
      router.push(`/test/session?testId=${body.data.testId}`);
    } catch {
      setError("Không tạo được đề từ nội dung — thử lại.");
    } finally {
      setCreating(null);
    }
  }, [lang, router, sourceText]);

  const latestBenchmark = data.benchmarks[0] ?? null;
  const placementDone = data.placements.length > 0;
  const maxRate = useMemo(
    () => Math.max(...data.benchmarkTrend.map((point) => point.rate), 0.0001),
    [data.benchmarkTrend],
  );

  return (
    <div className="space-y-gutter-lg">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="space-y-space-md">
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className="rounded bg-surface-container px-2 py-1 font-label-sm text-label-sm text-outline">
            FR-LT-01 → FR-LT-12
          </span>
          <span className="rounded bg-primary/10 px-2 py-1 font-label-sm text-label-sm text-primary">
            <Icon name="sync" size={12} /> đồng bộ FSRS
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-space-md">
          <div>
            <h1 className="font-headline-lg text-headline-lg font-semibold text-on-surface">
              Bài kiểm tra ngoại ngữ
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Đo năng lực theo chuẩn CEFR/HSK — điểm sai chảy ngược về ôn tập SRS.
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="Chọn ngôn ngữ kiểm tra"
            className="flex rounded-lg bg-surface-container p-1"
          >
            {(["zh", "en"] as const).map((code) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={lang === code}
                onClick={() => setLang(code)}
                className={cn(
                  "rounded px-3 py-1 font-label-md text-label-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  lang === code
                    ? "bg-primary-container text-on-primary"
                    : "text-outline hover:text-on-surface",
                )}
              >
                {code === "zh" ? "Tiếng Trung" : "Tiếng Anh"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Banner level + đẩy thẻ ────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-gutter-md md:grid-cols-3">
        <div className="bg-surface-container p-space-lg rounded-xl">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Mức hiện tại · {lang === "zh" ? "Tiếng Trung" : "Tiếng Anh"}
          </p>
          <p className="font-headline-md text-headline-md font-semibold text-secondary">
            {data.profile.level}
          </p>
        </div>

        <div className="bg-surface-container p-space-lg rounded-xl">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Điểm chuẩn gần nhất
          </p>
          {latestBenchmark ? (
            <>
              <p className="font-headline-md text-headline-md font-semibold text-primary">
                {latestBenchmark.score.toFixed(1)}/{latestBenchmark.maxScore}
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {latestBenchmark.label} · {formatDate(latestBenchmark.date)}
              </p>
            </>
          ) : (
            <p className="font-body-md text-body-md text-on-surface-variant">
              Chưa có kỳ thi chuẩn nào — hãy làm đề đầu tiên
            </p>
          )}
        </div>

        <div className="bg-surface-container p-space-lg rounded-xl">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Thẻ sai đã đẩy về SRS hôm nay
          </p>
          <p className="font-headline-md text-headline-md font-semibold text-tertiary">
            {data.pushedCards.count} thẻ
          </p>
        </div>
      </section>

      {!hasApiKey && (
        <p
          role="status"
          className="bg-surface-container-low text-body-sm text-on-surface-variant rounded-lg p-space-md"
        >
          <Icon name="offline_bolt" size={16} className="mr-1 inline" />
          Bật sinh đề AI bằng cách thêm API key trong{" "}
          <Link href="/settings" className="text-primary underline">
            Cài đặt
          </Link>
          . Các bài đã lưu vẫn xem được.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="bg-error/10 text-error rounded-lg p-space-md font-body-sm text-body-sm"
        >
          {error}
        </p>
      )}

      {/* ── Card placement ─────────────────────────────────────────────── */}
      <section className="bg-surface-container p-space-lg rounded-xl">
        <div className="flex flex-wrap items-start justify-between gap-space-md">
          <div className="space-y-space-xs">
            <div className="flex items-center gap-space-sm">
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Bài Kiểm Tra Định Vị
              </h2>
              <span className="rounded bg-primary/10 px-2 py-1 font-label-sm text-label-sm text-primary">
                Đầu vào
              </span>
              <span className="rounded bg-surface-container-high px-2 py-1 font-label-sm text-label-sm text-on-surface-variant">
                Không timer
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              25 câu · 8 từ vựng · 7 ngữ pháp · 5 điền từ · 5 nghe — xác định level
              khởi đầu thật và gợi ý nhóm từ nên bắt đầu.
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {placementDone
                ? `Đã làm ${data.placements.length} lần — mức hiện tại ${data.profile.level}.`
                : "Chưa làm · Xác định level khởi đầu thật"}
            </p>
          </div>

          {hasApiKey ? (
            <button
              type="button"
              onClick={() => startTest("placement")}
              disabled={creating !== null}
              className="rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              {creating === "placement" ? "Đang soạn đề…" : "Bắt đầu"}
            </button>
          ) : (
            <span className="font-label-sm text-label-sm text-outline">
              Cần API key
            </span>
          )}
        </div>
      </section>

      {/* ── Card topic ─────────────────────────────────────────────────── */}
      <section className="bg-surface-container p-space-lg rounded-xl">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Bài Kiểm Tra Theo Chủ Đề
        </h2>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
          20 câu · luyện/skim 1 nhóm từ cụ thể — gồm 2 câu dịch + 2 câu viết, chấm
          bằng AI theo 4 nhóm lỗi.
        </p>

        <ul className="mt-space-md grid grid-cols-2 gap-space-sm md:grid-cols-3">
          {topicGroups.map((group) => {
            const done = data.topics.filter((t) => t.topic === group);
            const best = done.reduce(
              (max, session) =>
                session.maxScore > 0
                  ? Math.max(max, session.score / session.maxScore)
                  : max,
              0,
            );
            return (
              <li key={group}>
                <button
                  type="button"
                  disabled={!hasApiKey || creating !== null}
                  onClick={() => startTest("topic", group)}
                  className="w-full rounded-lg bg-surface-container-low p-space-md text-left transition hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                >
                  <span className="block font-label-md text-label-md text-on-surface">
                    {TEST_TOPIC_GROUP_LABELS[group] ?? group}
                  </span>
                  <span className="mt-1 block font-code-md text-code-md tabular text-outline">
                    {done.length > 0
                      ? `Tốt nhất ${(best * 100).toFixed(0)}% · ${done.length} lần`
                      : "Chưa làm"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Card benchmark (hero) ──────────────────────────────────────── */}
      <section className="bg-surface-container-high p-space-lg rounded-xl">
        <div className="flex flex-wrap items-start justify-between gap-space-md">
          <div className="space-y-space-xs">
            <div className="flex items-center gap-space-sm">
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Bài Kiểm Tra Chuẩn
              </h2>
              <span className="rounded bg-primary-container px-2 py-1 font-label-sm text-label-sm text-on-primary">
                Định kỳ 2–4 tuần
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              40 câu · timer 30:00 · cùng độ khó giữa các kỳ để điểm so sánh được.
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Câu sai tự động bị đẩy về ôn SRS hôm nay (FSRS rating Again).
            </p>
          </div>

          {hasApiKey ? (
            <button
              type="button"
              onClick={() => startTest("benchmark")}
              disabled={creating !== null}
              className="rounded-lg bg-primary px-4 py-2 font-label-md text-label-md font-bold text-on-primary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              {creating === "benchmark" ? "Đang soạn đề…" : "Bắt đầu đề chuẩn"}
            </button>
          ) : (
            <span className="font-label-sm text-label-sm text-outline">Cần API key</span>
          )}
        </div>

        {/* Biểu đồ level theo thời gian (FR-LT-08) */}
        <div className="mt-space-lg">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Tiến bộ kỳ thi chuẩn
          </p>
          {data.benchmarkTrend.length === 0 ? (
            <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
              Chưa có kỳ thi chuẩn nào — hãy làm đề đầu tiên
            </p>
          ) : (
            <ul className="mt-space-sm space-y-space-xs">
              {data.benchmarkTrend.map((point) => (
                <li key={point.id} className="flex items-center gap-space-sm">
                  <span className="w-16 shrink-0 font-code-md text-code-md tabular text-outline">
                    {point.label}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded bg-surface-container-highest">
                    <span
                      className="block h-full rounded bg-primary"
                      style={{ width: `${Math.min(100, (point.rate / maxRate) * 100)}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right font-code-md text-code-md tabular text-on-surface">
                    {(point.rate * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Card from_content ──────────────────────────────────────────── */}
      <section className="bg-surface-container p-space-lg rounded-xl">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Kiểm tra từ nội dung thực tế
        </h2>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
          10 câu · timer 15:00 · 9 câu đọc hiểu + 1 câu tóm tắt chấm bằng AI.
        </p>

        {showSourceSheet ? (
          <div className="mt-space-md space-y-space-sm">
            <label
              htmlFor="source-text"
              className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
            >
              Dán văn bản (tối đa 8.000 ký tự)
            </label>
            <textarea
              id="source-text"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              rows={6}
              maxLength={8000}
              placeholder="Dán bài báo hoặc đoạn sách bằng tiếng Trung / tiếng Anh…"
              className="w-full rounded-lg bg-surface-container-lowest p-space-md font-body-md text-body-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="flex gap-space-sm">
              <button
                type="button"
                onClick={createFromContent}
                disabled={!hasApiKey || creating !== null}
                className="rounded-lg bg-secondary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-secondary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
              >
                {creating === "from_content" ? "Đang soạn đề…" : "Tạo đề từ tài liệu"}
              </button>
              <button
                type="button"
                onClick={() => setShowSourceSheet(false)}
                className="rounded-lg bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface"
              >
                Huỷ
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSourceSheet(true)}
            disabled={!hasApiKey}
            className="mt-space-md rounded-lg bg-secondary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-secondary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            Tạo đề từ tài liệu mới
          </button>
        )}
      </section>

      {/* ── Panel năng lực ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-gutter-md lg:grid-cols-2">
        <div className="bg-surface-container p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Thống kê năng lực & phân tích tiến bộ khảo thí
          </h2>

          <h3 className="mt-space-md font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Tỷ lệ đúng theo dạng câu
          </h3>
          {data.byItemType.length === 0 ? (
            <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
              Chưa có dữ liệu — làm một bài kiểm tra để có số liệu.
            </p>
          ) : (
            <ul className="mt-space-sm space-y-space-xs">
              {data.byItemType.map((stat) => (
                <li key={stat.itemType} className="flex items-center gap-space-sm">
                  <span className="w-24 shrink-0 font-code-md text-code-md text-outline">
                    {stat.itemType}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded bg-surface-container-highest">
                    <span
                      className="block h-full rounded"
                      style={{
                        width: `${Math.round(stat.rate * 100)}%`,
                        backgroundColor:
                          stat.rate >= 0.75
                            ? "var(--color-primary)"
                            : stat.rate >= 0.6
                              ? "var(--color-secondary)"
                              : "var(--color-tertiary)",
                      }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right font-code-md text-code-md tabular text-on-surface">
                    {stat.correct}/{stat.total}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-space-lg font-label-sm text-label-sm uppercase tracking-wider text-outline">
            5 từ sai nhiều nhất
          </h3>
          {data.topWrongWords.length === 0 ? (
            <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
              Chưa có từ nào bị sai — ôn tập đang hiệu quả.
            </p>
          ) : (
            <ul className="mt-space-sm space-y-space-xs">
              {data.topWrongWords.map((word) => (
                <li
                  key={word.cardId}
                  className="flex items-baseline justify-between gap-space-sm"
                >
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    {word.front}
                  </span>
                  <span className="font-label-sm text-label-sm text-outline">
                    {word.frontAlt ?? word.back} · sai {word.wrongCount} lần
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-surface-container p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Kỷ luật đánh giá không thiên vị
          </h2>
          <ul className="mt-space-md space-y-space-sm font-body-sm text-body-sm text-on-surface-variant">
            <li>
              Mọi câu hỏi đều lấy từ thẻ của chính bạn — không có từ bịa.
            </li>
            <li>Đề chuẩn giữ nguyên độ khó giữa các kỳ để điểm so sánh được.</li>
            <li>Điểm sai luôn chảy về ôn tập SRS — không bao giờ rơi lãng phí.</li>
            <li>Mọi số liệu truy được về từng câu cụ thể trong SQLite.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

/** Tìm phiên `active` của ngôn ngữ (dùng khi API trả 409). */
async function findActiveTest(lang: Lang): Promise<string | null> {
  try {
    const res = await fetch(`/api/test?lang=${lang}&type=placement`, { cache: "no-store" });
    const body = (await res.json()) as { ok: boolean; data?: TestHubData };
    if (!body.ok || !body.data) return null;
    const all = [
      ...body.data.placements,
      ...body.data.topics,
      ...body.data.benchmarks,
    ];
    return all[0]?.id ?? null;
  } catch {
    return null;
  }
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}
