/**
 * Mock cho package `server-only` — chỉ dùng trong môi trường test.
 *
 * Package `server-only` cố ý ném lỗi khi được import từ ngoài RSC:
 *   ```js
 *   throw new Error("This module cannot be imported from a Client Component module...")
 *   ```
 * Vitest chạy test bằng Node thuần (không có RSC bundler) nên package này
 * luôn ném lỗi → mọi test import `@/lib/db` (có `import "server-only"`) đều
 * fail trước khi chạy được assertion nào.
 *
 * → `vitest.config.ts` alias `server-only` → file này (module rỗng).
 *   `next build` vẫn dùng package thật — alias chỉ có trong Vitest.
 */

export {};
