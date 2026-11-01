import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { AppShell } from "@/components/shell/app-shell";

import "./globals.css";

/**
 * Material Symbols Outlined — font icon duy nhất của app (design-system §8).
 *
 * Nạp từ Google Fonts CDN: font icon là tài nguyên tĩnh, không mang dữ liệu
 * người dùng ra ngoài (P6 local-first vẫn giữ được). Nếu offline, icon không
 * hiện — nhưng mọi nút đều có `aria-label` nên vẫn dùng được (a11y không đổi).
 */
const MATERIAL_SYMBOLS_HREF =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap";

/**
 * Font tự host trong `public/fonts/` qua `next/font/local`.
 *
 * ⚠️ Vì sao không dùng `next/font/google`: hàm đó **tải font lúc build**, nên
 * máy offline (hoặc mạng chập chờn) là build fail với `TypeError: a[d] is not
 * a function` — app local-first mà không build được thì vô dụng. Tự host còn
 * giữ đúng lý do đã ghi: không FOUT, không CSP issue, không rò request ra ngoài.
 *
 * ⚠️ Phải khai báo **cả 2 subset** (`latin` + `vietnamese`) cho Space Grotesk
 * và Be Vietnam Pro — thiếu `vietnamese` thì dấu tiếng Việt mất glyph.
 * JetBrains Mono chỉ có subset `latin` (font mono không có bộ ký tự Việt).
 */
const spaceGrotesk = localFont({
  variable: "--font-space-grotesk",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  src: [
    {
      path: "../../public/fonts/space-grotesk-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/space-grotesk-600.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/space-grotesk-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
});

const beVietnamPro = localFont({
  variable: "--font-be-vietnam-pro",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  src: [
    {
      path: "../../public/fonts/be-vietnam-pro-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/be-vietnam-pro-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/be-vietnam-pro-600.woff2",
      weight: "600",
      style: "normal",
    },
  ],
});

const jetbrainsMono = localFont({
  variable: "--font-jetbrains-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
  src: [
    {
      path: "../../public/fonts/jetbrains-mono-latin-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/jetbrains-mono-latin-500.woff2",
      weight: "500",
      style: "normal",
    },
  ],
});

export const metadata: Metadata = {
  title: {
    default: "Daily Loop OS",
    template: "%s · Daily Loop OS",
  },
  description:
    "Hệ thống phát triển bản thân: chuyên môn · giao tiếp · ngoại ngữ · cá nhân.",
};

export const viewport: Viewport = {
  themeColor: "#0f131c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      className={`${spaceGrotesk.variable} ${beVietnamPro.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link rel="stylesheet" href={MATERIAL_SYMBOLS_HREF} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
