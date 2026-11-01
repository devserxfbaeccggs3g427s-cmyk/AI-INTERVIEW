"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { AbilityRadar } from "@/components/test/ability-radar";
import { ItemTypeBreakdown } from "@/components/test/item-type-breakdown";
import { cn } from "@/lib/cn";
import type { ErrorGroups, ItemType, ItemTypeStat, RubricScores } from "@/lib/test";

export interface PushedCardView {
  cardId: string;
  front: string;
  frontAlt: string | null;
  back: string;
  due: string;
  lapses: number;
  stability: number;
  difficulty: number;
  retrievability: number;
  reason: string;
}

export interface WrongItemView {
  index: number;
  itemType: ItemType;
  prompt: string;
  audioText: string | null;
  userAnswer: string | null;
  answer: string | null;
  notes: string | null;
  explanation: string | null;
  cardId: string | null;
  flagged: boolean;
  scored: boolean;
  rubric: RubricScores | null;
  errorGroups: ErrorGroups | null;
  seconds: number | null;
}

export interface TestResultViewProps {
  session: {
    id: string;
    lang: "zh" | "en";
    testType: string;
    topic: string | null;
    status: string;
    score: number;
    maxScore: number;
    durationSec: number;
    level: string;
    levelLabel: string;
    hsk: string;
    standard: string;
    createdAt: string;
  };
  byItemType: ItemTypeStat[];
  wrongItems: WrongItemView[];
  pushedCards: PushedCardView[];
  comparison: {
    prevScore: number;
    prevMaxScore: number;
    deltaCorrect: number;
    prevDate: string;
    prevId: string;
  } | null;
  comparisonUnavailableReason: string | null;
  suggestedGroup: {
    group: string;
    groupLabel: string;
    firstTask: { title: string; minutes: number; href: string };
  } | null;
  levelSource: string;
  bottleneck: ItemType | null;
  activityId: string | null;
  evidenceId: string | null;
}

const RUBRIC_LABELS: Array<{ key: keyof RubricScores; label: string }> = [
  { key: "grammar", label: "Ngữ pháp" },
  { key: "vocab", label: "Từ vựng" },
  { key: "expression", label: "Cách diễn đạt" },
  { key: "context", label: "Ngữ cảnh" },
];

/**
 * S21 — Kết quả bài kiểm tra.
 *
 * ⚠️ AC-11: `pushedCards.length === 0` ⇒ hiện đúng "0 thẻ bị đẩy về ôn sớm",
 * không giả lập số liệu.
 * ⚠️ P7: mọi số liệu đến từ props (query DB) — không hardcode.
 */
export function TestResultView(props: TestResultViewProps) {
  const { session, byItemType, wrongItems, pushedCards } = props;
  const [filter, setFilter] = useState<ItemType | "all">("all");

  const scorePct =
    session.maxScore > 0 ? Math.round((session.score / session.maxScore) * 100) : 0;

  const filteredWrong = useMemo(
    () =>
      filter === "all"
        ? wrongItems
        : wrongItems.filter((item) => item.itemType === filter),
    [wrongItems, filter],
  );

  const rubricItems = useMemo(
    () => wrongItems.filter((item) => item.rubric !== null),
    [wrongItems],
  );

  const filterOptions = useMemo(() => {
    const counts = new Map<ItemType, number>();
    for (const item of wrongItems) {
      counts.set(item.itemType, (counts.get(item.itemType) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [wrongItems]);

  const srsHref =
    pushedCards.length > 0
      ? `/language?cards=${pushedCards.map((card) => card.cardId).join(",")}`
      : "/language";

  return (
    <div className="space-y-gutter-lg">
      {/* ── Banner ghi nhận hệ thống ──────────────────────────────────── */}
      <p className="bg-surface-container-low text-body-sm text-on-surface-variant rounded-xl p-space-md">
        <Icon name="verified" size={16} className="mr-1 text-primary" />
        Tự động ghi nhận hệ thống:{" "}
        <span className="text-on-surface">
          {props.activityId ? "1 Activity + Evidence đã đồng bộ" : "Chưa có Activity"}
        </span>
        {" · "}
        Mã phiên: <span className="font-code-md text-code-md">{session.id}</span>
      </p>

      {session.status === "expired" && (
        <p
          role="status"
          className="bg-tertiary/10 text-tertiary rounded-lg p-space-md font-body-sm text-body-sm"
        >
          Hết thời gian — đã nộp tự động
        </p>
      )}

      {/* ── Bento điểm / thời lượng / level ───────────────────────────── */}
      <header className="space-y-space-md">
        <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">
          Kết quả kiểm tra năng lực{" "}
          {session.lang === "zh" ? "Tiếng Trung" : "Tiếng Anh"}
        </h1>

        <section className="grid grid-cols-1 gap-gutter-md md:grid-cols-3">
          <div className="bg-surface-container-low rounded-lg p-space-lg">
            <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
              Điểm tổng
            </p>
            <p className="font-display text-display font-bold text-on-surface tabular">
              {session.score.toFixed(1)}
            </p>
            <p className="font-code-md text-code-md text-outline tabular">
              /{session.maxScore} · {scorePct}%
            </p>
            {props.comparison ? (
              <p className="mt-space-xs font-label-sm text-label-sm text-primary">
                ▲ so với kỳ trước ({props.comparison.prevScore.toFixed(1)}/
                {props.comparison.prevMaxScore})
              </p>
            ) : props.comparisonUnavailableReason ? (
              <p className="mt-space-xs font-label-sm text-label-sm text-outline">
                {props.comparisonUnavailableReason}
              </p>
            ) : (
              <p className="mt-space-xs font-label-sm text-label-sm text-outline">
                Chưa có kỳ thi trước để so sánh
              </p>
            )}
          </div>

          <div className="bg-surface-container-low rounded-lg p-space-lg">
            <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
              Thời lượng
            </p>
            <p className="font-headline-lg text-headline-lg font-bold text-on-surface tabular">
              {formatClock(session.durationSec)}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {byItemType.length} dạng câu ·{" "}
              {byItemType.reduce((sum, stat) => sum + stat.total, 0)} câu
            </p>
          </div>

          <div className="bg-surface-container-low rounded-lg p-space-lg">
            <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
              Mức trình độ
            </p>
            <p className="font-headline-lg text-headline-lg font-bold text-secondary">
              {session.level}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {session.levelLabel}
              {session.lang === "zh" ? ` · ${session.hsk}` : ""}
            </p>
            <p className="mt-space-xs inline-block rounded bg-secondary/10 px-2 py-1 font-label-sm text-label-sm text-secondary">
              {props.levelSource === "ai" ? "AI ước lượng" : "Ước lượng cục bộ"}
            </p>
            {props.bottleneck && (
              <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                Điểm yếu: <span className="font-code-md text-code-md">{props.bottleneck}</span>
              </p>
            )}
          </div>
        </section>
      </header>

      {/* ── Radar + panel đẩy thẻ ─────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-gutter-md lg:grid-cols-2">
        <div className="bg-surface-container p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Radar năng lực
          </h2>
          <div className="mt-space-md">
            <AbilityRadar stats={byItemType} />
          </div>
        </div>

        {/* FR-LT-06 — vòng đóng SRS */}
        <div className="bg-surface-container-high p-space-lg rounded-xl">
          <div className="flex items-center gap-space-sm">
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              {pushedCards.length} thẻ từ vựng bị sai đã được tự động đẩy về ôn tập
              hôm nay
            </h2>
            <span className="rounded bg-primary-container px-2 py-1 font-label-sm text-label-sm text-on-primary">
              FR-LT-06
            </span>
          </div>

          {pushedCards.length === 0 ? (
            <p className="mt-space-md font-body-md text-body-md text-on-surface-variant">
              0 thẻ bị đẩy về ôn sớm — không có câu sai nào gắn thẻ.
            </p>
          ) : (
            <>
              <ul className="mt-space-md space-y-space-sm">
                {pushedCards.map((card) => (
                  <li
                    key={card.cardId}
                    className="bg-surface-container-low rounded-lg p-space-md"
                  >
                    <div className="flex flex-wrap items-baseline gap-space-sm">
                      <span className="font-display text-[2rem] font-bold text-on-surface">
                        {card.front}
                      </span>
                      {card.frontAlt && (
                        <span className="font-code-md text-code-md text-primary">
                          {card.frontAlt}
                        </span>
                      )}
                      <span className="rounded bg-error/15 px-2 py-0.5 font-label-sm text-label-sm text-error">
                        lapse {card.lapses}
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {card.back} · {card.reason}
                    </p>
                    <p className="mt-1 font-label-sm text-label-sm text-outline tabular">
                      Retrievability: {Math.round(card.retrievability * 100)}% · đến hạn{" "}
                      {card.due}
                    </p>
                  </li>
                ))}
              </ul>

              <Link
                href={srsHref}
                className="mt-space-md inline-flex rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Ôn ngay {pushedCards.length} thẻ này trong SRS
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ── Thống kê theo dạng câu ─────────────────────────────────────── */}
      <section className="bg-surface-container p-space-lg rounded-xl">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Thống kê chi tiết theo dạng câu (itemType)
        </h2>
        <div className="mt-space-md">
          <ItemTypeBreakdown stats={byItemType} />
        </div>
      </section>

      {/* ── Panel rubric AI ───────────────────────────────────────────── */}
      {rubricItems.length > 0 && (
        <section className="bg-surface-container-low p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Chấm điểm tự luận AI (4 nhóm lỗi sư phạm)
          </h2>
          <ul className="mt-space-md space-y-space-sm">
            {rubricItems.map((item) => (
              <li key={item.index} className="bg-surface-container rounded-lg p-space-md">
                <p className="font-label-sm text-label-sm text-outline">
                  Câu {String(item.index + 1).padStart(2, "0")} · {item.itemType}
                </p>
                {item.rubric && (
                  <ul className="mt-space-sm flex flex-wrap gap-space-sm">
                    {RUBRIC_LABELS.map(({ key, label }) => {
                      const score = item.rubric?.[key] ?? 0;
                      return (
                        <li
                          key={key}
                          className="rounded bg-secondary/10 px-2 py-1 font-label-md text-label-md text-secondary tabular"
                        >
                          {label}: {score}/10
                        </li>
                      );
                    })}
                  </ul>
                )}
                {item.notes && (
                  <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
                    {item.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Phân tích sai sót ─────────────────────────────────────────── */}
      <section className="bg-surface-container p-space-lg rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Phân tích sai sót & lời giải chi tiết
          </h2>

          {filterOptions.length > 0 && (
            <div className="flex flex-wrap gap-space-xs">
              <button
                type="button"
                onClick={() => setFilter("all")}
                aria-pressed={filter === "all"}
                className={cn(
                  "rounded px-2 py-1 font-label-sm text-label-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  filter === "all"
                    ? "bg-primary-container text-on-primary"
                    : "bg-surface-container-high text-on-surface-variant",
                )}
              >
                Tất cả ({wrongItems.length})
              </button>
              {filterOptions.map(([itemType, count]) => (
                <button
                  key={itemType}
                  type="button"
                  onClick={() => setFilter(itemType)}
                  aria-pressed={filter === itemType}
                  className={cn(
                    "rounded px-2 py-1 font-label-sm text-label-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    filter === itemType
                      ? "bg-primary-container text-on-primary"
                      : "bg-surface-container-high text-on-surface-variant",
                  )}
                >
                  {itemType} ({count})
                </button>
              ))}
            </div>
          )}
        </div>

        {wrongItems.length === 0 ? (
          <p className="mt-space-md font-body-md text-body-md text-on-surface-variant">
            Không có câu sai — đạt 100%
          </p>
        ) : filteredWrong.length === 0 ? (
          <p className="mt-space-md font-body-md text-body-md text-on-surface-variant">
            Không có câu sai thuộc dạng đang lọc.
          </p>
        ) : (
          <ul className="mt-space-md space-y-space-sm">
            {filteredWrong.map((item) => (
              <li
                key={item.index}
                className="bg-surface-container-low rounded-lg p-space-md"
              >
                <div className="flex flex-wrap items-center gap-space-sm">
                  <span className="rounded bg-error/15 px-2 py-0.5 font-label-sm text-label-sm text-error">
                    Sai
                  </span>
                  <span className="font-label-sm text-label-sm text-outline">
                    Câu {String(item.index + 1).padStart(2, "0")} · {item.itemType}
                  </span>
                  {item.flagged && (
                    <span className="rounded bg-tertiary-container/20 px-2 py-0.5 font-label-sm text-label-sm text-tertiary">
                      Đã gắn cờ
                    </span>
                  )}
                  {!item.scored && (
                    <span className="rounded bg-surface-container-highest px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">
                      Chưa chấm được — thử lại
                    </span>
                  )}
                </div>

                <p className="mt-space-sm font-body-md text-body-md text-on-surface">
                  {item.prompt}
                </p>

                <div className="mt-space-sm space-y-1">
                  <p className="font-body-sm text-body-sm text-error">
                    Bạn trả lời: {item.userAnswer || "(bỏ trống)"}
                  </p>
                  {item.answer && (
                    <p className="font-body-sm text-body-sm text-primary">
                      Đáp án đúng: {item.answer}
                    </p>
                  )}
                  {item.notes && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {item.notes}
                    </p>
                  )}
                </div>

                {item.audioText && (
                  <SpeakButton text={item.audioText} lang={session.lang} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Gợi ý nhóm từ cho placement ───────────────────────────────── */}
      {props.suggestedGroup && (
        <section className="bg-surface-container p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Gợi ý bắt đầu: nhóm từ “{props.suggestedGroup.groupLabel}”
          </h2>
          <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
            Bài tập đầu tiên: {props.suggestedGroup.firstTask.title} (
            {props.suggestedGroup.firstTask.minutes} phút)
          </p>
          <Link
            href={props.suggestedGroup.firstTask.href}
            className="mt-space-md inline-flex rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Ôn ngay nhóm từ này
          </Link>
        </section>
      )}

      {/* ── Dock hành động ────────────────────────────────────────────── */}
      <section className="bg-surface-container-low p-space-lg rounded-xl">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Tiếp tục Daily Loop hôm nay
        </h2>
        <div className="mt-space-md flex flex-wrap gap-space-sm">
          <Link
            href="/"
            className="rounded-lg bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Về Daily Loop
          </Link>
          <Link
            href="/review"
            className="rounded-lg bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Xem báo cáo tuần
          </Link>
          <Link
            href={srsHref}
            className="rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Bắt đầu ôn tập FSRS ngay
          </Link>
        </div>
      </section>
    </div>
  );
}

function SpeakButton({ text, lang }: { text: string; lang: "zh" | "en" }) {
  const speak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === "zh" ? "zh-CN" : "en-US";
    utterance.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <button
      type="button"
      onClick={speak}
      aria-label="Nghe lại âm thanh chuẩn"
      className="mt-space-sm rounded-lg bg-surface-container-high px-3 py-1 font-label-sm text-label-sm text-primary transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Icon name="volume_up" size={16} /> Nghe lại âm thanh chuẩn
    </button>
  );
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
