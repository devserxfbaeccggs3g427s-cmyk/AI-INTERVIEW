import "./globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TopBar } from "@/components/TopBar";
import { FooterBar } from "@/components/FooterBar";
import { ByokProvider } from "@/components/ByokConfigContext";
import { ThemeProvider } from "@/components/ThemeProvider";

/**
 * Next/font/google only ships fonts that Google has officially published.
 * We use Inter (UI body) + JetBrains Mono (code) as a stable baseline.
 * Swap to `Geist` (Vercel's family) by editing the imports once the project
 * upgrades to a Next version that exposes it.
 */
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "AI Mock Interview Studio",
  description: "BYOK · Local SQLite · Mock technical interviews with AI",
};

// Runs before paint; the client provider takes over after hydration.
const themeBootstrap = `(function(){try{var p=localStorage.getItem('ui.theme');var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light');document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){var d=matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.add(d?'dark':'light');document.documentElement.style.colorScheme=d?'dark':'light'}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --font-geist: var(--font-sans);
            --font-jbmono: var(--font-mono);
          }
        `}</style>
      </head>
      <body className="bg-canvas min-h-screen flex flex-col antialiased">
        <ThemeProvider>
          <ByokProvider>
            <TopBar />
            <main className="w-full pt-16 flex-1">
              {children}
            </main>
            <FooterBar />
          </ByokProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
