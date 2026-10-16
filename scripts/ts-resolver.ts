/**
 * Nối import có đuôi file cho các specifier không đuôi.
 *
 * App viết `from "./capabilities"` — đúng, vì `moduleResolution: "bundler"` để
 * bundler lo phần này. `node --experimental-strip-types` thì không: nó nối theo
 * đường dẫn thật. Probe cần nạp **đúng module của app** chứ không sao chép logic,
 * nên phải nối được thay vì viết lại logic trong probe.
 *
 * Đây là nối riêng cho probe, chạy qua `scripts/register-ts.mjs`. Không sửa
 * `tsconfig.json` của app: bật `allowImportingTsExtensions` ở đó sẽ đổi cách
 * bundler xử lý mọi import trong sản phẩm.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function resolve(specifier: string, context: unknown, nextResolve: (...args: unknown[]) => unknown) {
  // Chỉ can thiệp với specifier tương đối, không đuôi file.
  if (!/^\.{1,2}\//.test(specifier) || /\.[cm]?[jt]sx?$/.test(specifier)) {
    return nextResolve(specifier, context);
  }
  const parent = (context as { parentURL?: string } | undefined)?.parentURL;
  if (!parent) return nextResolve(specifier, context);

  const base = new URL(specifier, parent);
  for (const candidate of [`${base.href}.ts`, `${base.href}.tsx`, `${base.href.replace(/\/$/, "")}/index.ts`]) {
    if (existsSync(fileURLToPath(candidate))) {
      return nextResolve(candidate, context);
    }
  }
  return nextResolve(specifier, context);
}