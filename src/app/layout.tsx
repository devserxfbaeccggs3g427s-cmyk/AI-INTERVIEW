import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luyện phỏng vấn AI",
  description: "Luyện trả lời phỏng vấn và nhận đánh giá theo từng câu.",
};

// Dùng ReactNode thuần, không dùng kiểu `LayoutProps<"/">` mà Next 16 sinh ra:
// kiểu đó chỉ tồn tại trong `.next/types/` sau khi build, khiến `npm run typecheck`
// lỗi trên bản sao mới. Xem CLAUDE.md.
export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}