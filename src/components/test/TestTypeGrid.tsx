"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TestTypeCard, type TestType } from "@/components/test/TestTypeCard";
import { useToast } from "@/components/ui/Toaster";
import { ITEM_TYPES, type ItemType } from "@/lib/test-types";

/**
 * `TestTypeGrid` — lưới 4 thẻ chọn loại bài kiểm tra (task 14.1).
 *
 * Client Component: bấm thẻ → gọi `POST /api/test/blueprint` (task 14.4, AI-free)
 * → nhận `testId` → chuyển tới S20 làm bài.
 *
 * Props:
 *  - configs: cấu hình 4 thẻ.
 *  - lang: ngôn ngữ đề (zh/en).
 *  - level: trình độ hiện tại.
 *
 * Xem tasks.md 14.1 / 14.4 · design.md §4.19 / S19.
 */

export interface TestTypeGridConfig {
  type: TestType;
  label: string;
  description: string;
  questionCount: number;
  hasTimer: boolean;
  icon: string;
}

export function TestTypeGrid({
  configs,
  lang,
  level,
}: {
  configs: TestTypeGridConfig[];
  lang: "zh" | "en";
  level: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loadingType, setLoadingType] = useState<TestType | null>(null);

  const handleStart = async (config: TestTypeGridConfig) => {
    // from_content đi qua modal riêng (cần dán nội dung).
    if (config.type === "from_content") {
      document.getElementById("from-content-trigger")?.click();
      return;
    }

    setLoadingType(config.type);
    try {
      const itemTypes: ItemType[] = ITEM_TYPES.filter((t) => t !== "translation");
      const res = await fetch("/api/test/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          level,
          itemTypes,
          count: config.questionCount,
          ...(config.type === "topic" ? { topic: "chung" } : {}),
        }),
      });
      const result = await res.json();

      if (!result.ok) {
        throw new Error(result.error?.message ?? "Không thể tạo đề");
      }

      router.push(`/test/session?testId=${result.data.testId}`);
    } catch (err) {
      const error = err as Error;
      toast({ title: "Không thể tạo đề", description: error.message, tone: "error" });
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
      {configs.map((config) => (
        <TestTypeCard
          key={config.type}
          type={config.type}
          label={config.label}
          description={config.description}
          questionCount={config.questionCount}
          hasTimer={config.hasTimer}
          icon={config.icon}
          onClick={() => void handleStart(config)}
        />
      ))}
    </div>
  );
}
