/**
 * Đăng ký bộ nối import cho probe.
 *
 * Tệp này phải là `.mjs`: Node nạp nó trước khi bật `--experimental-strip-types`
 * cho mã của ứng dụng, nên nó không được là TypeScript.
 *
 * Dùng: node --experimental-strip-types --import ./scripts/register-ts.mjs probe.ts
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-resolver.ts", pathToFileURL(`${import.meta.dirname}/`));