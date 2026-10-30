"use client";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { useState } from "react";

/**
 * `FromContentModal` — tạo đề kiểm tra từ nội dung văn bản (task 14.20).
 *
 * - Provider: `local qwen2.5:7b` (task 14.20).
 * - Chấp nhận văn bản UTF-8 không giới hạn độ dài.
 * - Gọi POST /api/test/from-content → trả về testId.
 * - Dùng toast thông báo thành công/thất bại.
 *
 * Props:
 *  - lang: ngôn ngữ mặc định (zh/en).
 *
 * Xem tasks.md 14.20 · design.md §4.19 / S19.
 */

export interface FromContentModalProps {
  lang: "zh" | "en";
  className?: string;
}

export function FromContentModal({ lang, className }: FromContentModalProps) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast({ title: "Vui lòng nhập nội dung", tone: "error" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/test/from-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          text: content,
        }),
      });

      const result = await res.json();

      if (!result.ok) {
        toast({
          title: "Không thể tạo đề",
          description: result.error?.message ?? "Lỗi không xác định",
          tone: "error",
        });
        return;
      }

      toast({
        title: "Đề đã được tạo",
        description: `Đã tạo bài kiểm tra ${result.data.items?.length ?? 0} câu.`,
        tone: "success",
      });

      // Reset form
      setContent("");
      setOpen(false);

      // Chuyển hướng đến trang làm bài (S20)
      window.location.href = `/test/session?testId=${result.data.testId}`;
    } catch (err) {
      const error = err as Error;
      toast({
        title: "Lỗi kết nối",
        description: error.message,
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        id="from-content-trigger"
        variant="secondary"
        icon="article"
        onClick={() => setOpen(true)}
        className={className}
      >
        Tạo đề từ nội dung
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tạo đề từ nội dung"
        subtitle="Dán đoạn văn bản, chúng tôi sẽ sinh câu hỏi kiểm tra."
        icon="article"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              icon="auto_awesome"
              onClick={handleSubmit}
              loading={loading}
            >
              Tạo đề
            </Button>
          </div>
        }
      >
        <Textarea
          placeholder="Dán nội dung tại đây... (hỗ trợ UTF-8 không giới hạn độ dài)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={loading}
          className="min-h-32"
        />
        <p className="mt-2 font-label-sm text-on-surface-variant">
          Ngôn ngữ: {lang === "zh" ? "Tiếng Trung" : "Tiếng Anh"} · Provider: qwen2.5:7b
        </p>
      </Modal>
    </>
  );
}

// Re-export để tránh lỗi unused cn nếu không dùng trong tương lai
void cn;