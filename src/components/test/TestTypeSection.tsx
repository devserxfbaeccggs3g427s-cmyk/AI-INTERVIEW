"use client";

import { useState } from "react";
import { LevelSwitcher } from "@/components/test/LevelSwitcher";
import { TestTypeGrid, type TestTypeGridConfig } from "@/components/test/TestTypeGrid";

/**
 * `TestTypeSection` — vùng chọn ngôn ngữ + loại bài kiểm tra (task 14.1, 14.2).
 *
 * Client Component giữ state ngôn ngữ đang chọn → truyền xuống `TestTypeGrid`
 * để dựng đề đúng ngôn ngữ / trình độ.
 *
 * Xem tasks.md 14.1 / 14.2 · design.md §4.19 / S19.
 */

export function TestTypeSection({
  configs,
  zhLevel,
  enLevel,
}: {
  configs: TestTypeGridConfig[];
  zhLevel: string;
  enLevel: string;
}) {
  const [lang, setLang] = useState<"zh" | "en">("zh");

  const level = lang === "zh" ? zhLevel : enLevel;

  return (
    <div className="space-y-gutter">
      <LevelSwitcher
        zhLevel={zhLevel}
        enLevel={enLevel}
        onLangChange={setLang}
      />
      <TestTypeGrid configs={configs} lang={lang} level={level} />
    </div>
  );
}
