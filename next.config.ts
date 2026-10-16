import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bật Cache Components vì đây là hướng mặc định của Next 16.
  // Hệ quả bắt buộc: `dynamic`, `dynamicParams`, `revalidate`, `fetchCache`
  // bị gỡ khỏi route handler — đừng khai báo chúng trong `route.ts`.
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
