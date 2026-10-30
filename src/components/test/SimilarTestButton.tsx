"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";

/**
 * `SimilarTestButton` — nút "Làm bài tương tự" (task 14.17, FR-LT-12).
 *
 * Gọi `POST /api/test/similar` → nhận testId mới → chuyển tới S20 làm bài.
 * Đề mới có **cùng chủ đề + cùng trình độ** như bài gốc → độ khó ngang nhau.
 *
 * Xem tasks.md 14.17 · design.md §4.19 · FR-LT-12.
 */

export function SimilarTestButton({ testId }: { testId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/test/similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId }),
      });
      const result = await res.json();

      if (!result.ok) {
        toast({
          title: "Không thể tạo đề tương tự",
          description: result.error?.message ?? "Lỗi không xác định",
          tone: "error",
        });
        return;
      }

      router.push(`/test/session?testId=${result.data.testId}`);
    } catch (err) {
      const error = err as Error;
      toast({ title: "Lỗi kết nối", description: error.message, tone: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="primary" icon="refresh" onClick={handleClick} loading={loading}>
      Làm bài tương tự
    </Button>
  );
}
