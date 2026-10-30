"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toaster";
import type { Domain } from "@/lib/types";
import { useState } from "react";
import type { PracticeSuggestion } from "@/lib/skills-data";

/**
 * "Đề xuất bài tập thực chiến" (task 7.12).
 *
 * Đề xuất được sinh bằng **rule cục bộ** từ lỗ hổng bằng chứng
 * (`buildPracticeSuggestion` trong `src/lib/skills-data.ts`) — cố tình KHÔNG gọi
 * AI để tính năng luôn khả dụng kể cả khi offline.
 *
 * Nút "Tạo slot ngày mai" → `POST /api/plan/tomorrow` → tạo `PlanItem` cho
 * **ngày mai** (slot 0, domain = domain của skill).
 *
 * Xem tasks.md 7.12 · design.md §4.4.
 */

export function AiSuggestionCard({
  skillId,
  skillName,
  domain,
  suggestion,
  className,
}: {
  /** Skill mà đề xuất nhắm tới. */
  skillId: string;
  skillName: string;
  /** Domain của skill — slot ngày mai sẽ mang domain này. */
  domain: Domain;
  /** Đề xuất do rule cục bộ dựng sẵn ở server. */
  suggestion: PracticeSuggestion;
  className?: string;
}) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const handleCreateTomorrow = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/plan/tomorrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId,
          action: suggestion.title,
          detail: suggestion.requirement,
          minutes: suggestion.minutes,
          domain,
          slot: 0,
        }),
      });
      const data = (await res.json()) as
        | { ok: true; data: { id: string; date: string; slot: number } }
        | { ok: false; error: { code: string; message: string } };
      if (!data.ok) {
        toast({ tone: "error", title: "Không tạo được slot", description: data.error.message });
        return;
      }
      toast({
        tone: "success",
        title: "Đã tạo slot cho ngày mai",
        description: `Slot ${data.data.slot + 1} · ${suggestion.minutes} phút.`,
      });
    } catch {
      toast({ tone: "error", title: "Không tạo được slot", description: "Thử lại sau." });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card tone="base" className={className} data-testid="ai-suggestion-card">
      <CardHeader
        title="Đề xuất bài tập thực chiến"
        subtitle={`Dựa trên lỗ hổng bằng chứng của "${skillName}".`}
        icon="smart_toy"
        action={<Badge tone="secondary">Rule cục bộ</Badge>}
      />

      <div className="space-y-space-md">
        <div className="rounded-lg border border-tertiary/30 bg-tertiary-container/10 p-gutter">
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="material-symbols-outlined text-tertiary" aria-hidden>
              priority_high
            </span>
            <Label>Lỗ hổng phân tích được</Label>
          </div>
          <p className="mt-space-xs text-body-md text-on-surface">
            Chưa có bằng chứng loại <strong>{suggestion.gapLabel}</strong> — đây là lỗ hổng
            lớn nhất so với mục tiêu level.
          </p>
        </div>

        <div>
          <Label>Bài tập khắc phục (dự kiến {suggestion.minutes} phút)</Label>
          <p className="mt-space-xs text-body-md text-on-surface">{suggestion.title}</p>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            Yêu cầu: {suggestion.requirement}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-space-sm">
          <Badge tone="primary">+1 Bằng chứng khi hoàn thành</Badge>
          {suggestion.missing > 0 ? (
            <Badge tone="tertiary">Còn thiếu {suggestion.missing} bằng chứng</Badge>
          ) : null}
        </div>

        <Button
          variant="primary"
          icon="event"
          onClick={handleCreateTomorrow}
          loading={creating}
          className="w-full"
          data-testid="create-tomorrow-slot"
        >
          Tạo slot ngày mai
        </Button>
      </div>
    </Card>
  );
}
