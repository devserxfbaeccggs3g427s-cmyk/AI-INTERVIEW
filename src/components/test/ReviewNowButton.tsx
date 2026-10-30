"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * `ReviewNowButton` — nút "Ôn ngay" mở S10 ôn những thẻ vừa sai (task 14.16).
 *
 * Điều hướng tới `/language/session?reviewCard=<cardId>` — S10 đọc param này
 * để mở đúng batch thẻ cần ôn.
 *
 * Xem tasks.md 14.16 · design.md §4.19.
 */

export function ReviewNowButton({
  cardId,
  variant = "ghost",
  size = "sm",
  label = "Ôn ngay",
}: {
  cardId: string;
  variant?: "primary" | "secondary" | "ghost" | "ai" | "danger";
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const router = useRouter();

  return (
    <Button
      variant={variant}
      size={size}
      icon="school"
      onClick={() => router.push(`/language/session?reviewCard=${cardId}`)}
    >
      {label}
    </Button>
  );
}
