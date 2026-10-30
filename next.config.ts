import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Không tắt Strict Mode — phát hiện lỗi vòng render sớm (FR-AF-04).
  reactStrictMode: true,

  experimental: {
    // Next 15: serverActions chuyển sang dạng object (bodySizeLimit, allowedOrigins).
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },

  // @anthropic-ai/sdk là server-only — không được đóng gói vào client bundle.
  serverExternalPackages: ["@anthropic-ai/sdk", "ts-fsrs"],
};

export default nextConfig;
