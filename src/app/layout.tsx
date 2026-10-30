import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono, Space_Grotesk } from "next/font/google";

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
 * Font tải qua `next/font/google` — không dùng CDN <link>.
 * Lý do: tự host, không FOUT, không CSP issue, không rò request ra ngoài (P6 local-first).
 *
 * `subsets: ["vietnamese"]` là BẮT BUỘC — thiếu nó thì dấu tiếng Việt có thể mất glyph.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
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
