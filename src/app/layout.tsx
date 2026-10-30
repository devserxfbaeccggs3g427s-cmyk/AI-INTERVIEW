import { QuickLogSheet } from "@/components/quick-log/QuickLogSheet";
import { QuickLogProvider } from "@/components/quick-log/QuickLogProvider";
import { AppShell } from "@/components/shell/AppShell";
import { ToastProvider } from "@/components/ui/Toaster";
import { getShellData } from "@/lib/shell";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Loop OS",
  description: "Hệ điều hành lặp ngày — ghi nhanh, kế hoạch AI, cây kỹ năng.",
};

export const viewport: Viewport = {
  themeColor: "#0f131c",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shell = await getShellData();

  return (
    <html lang="vi" className="dark">
      <head>
        {/* 1 <link> duy nhất cho font + Material Symbols — không nhân bản ở page con */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-surface font-body-md antialiased">
        <ToastProvider>
          <QuickLogProvider>
            <AppShell
              streak={shell.streak}
              weekEnergy={shell.weekEnergy}
              aiChip={shell.aiChip}
              aiIsLocal={shell.aiIsLocal}
            >
              {children}
            </AppShell>
            <QuickLogSheet />
          </QuickLogProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
