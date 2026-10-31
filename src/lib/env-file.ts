import { chmod, copyFile, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Đọc/ghi `.env.local` an toàn (FR-SC-08).
 *
 * ⚠️ Bảo mật:
 * - File luôn có quyền `0o600`.
 * - Ghi **atomic**: file tạm `<file>.<uuid>.tmp` → `rename`. Nếu `rename` lỗi
 *   (cross-device) ⇒ fallback `copyFile` + `rm(tmp)`.
 * - Chỉ thay **đúng dòng** `NAME=` — không đụng biến khác, không mất comment.
 * - KHÔNG BAO GIỜ log giá trị key.
 */

export interface EnvFile {
  path: string;
  lines: string[];
}

/** Đường dẫn file env local. */
export function envLocalPath(): string {
  return path.join(process.cwd(), ".env.local");
}

/**
 * Đọc file env local.
 *
 * ⚠️ `ENOENT` (file chưa tồn tại) ⇒ trả `{ path, lines: [] }`, KHÔNG throw.
 */
export async function readEnvLocal(): Promise<EnvFile> {
  const file = envLocalPath();

  try {
    const raw = await readFile(file, "utf8");
    return { path: file, lines: raw.split("\n") };
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return { path: file, lines: [] };
    }
    throw error;
  }
}

/**
 * Ghi file env — atomic + `chmod 600`.
 *
 * Nếu `writeFile` throw ⇒ dọn file tạm rác rồi ném lại lỗi.
 */
export async function writeEnvFile(lines: string[]): Promise<string> {
  const file = envLocalPath();
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;

  try {
    await writeFile(tmp, lines.join("\n"), { encoding: "utf8", mode: 0o600 });
    await chmod(tmp, 0o600);
  } catch (error) {
    // Dọn file tạm rác.
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }

  try {
    await rename(tmp, file);
  } catch (error) {
    if (isErrno(error, "EXDEV")) {
      // Khác filesystem ⇒ copy + xoá tmp.
      try {
        await copyFile(tmp, file);
        await chmod(file, 0o600);
      } finally {
        await rm(tmp, { force: true }).catch(() => undefined);
      }
    } else {
      await rm(tmp, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  await chmod(file, 0o600);
  return file;
}

/**
 * Thêm hoặc thay 1 biến trong file env.
 *
 * - Nếu dòng `NAME=` đã tồn tại ⇒ thay **đúng dòng đó**.
 * - Nếu chưa có ⇒ append vào cuối.
 * - Comment và biến khác được giữ nguyên.
 */
export async function upsertEnvVar(name: string, value: string): Promise<string> {
  const file = await readEnvLocal();
  const prefix = `${name}=`;
  const newLine = `${prefix}${value}`;

  const index = file.lines.findIndex((line) => line.startsWith(prefix));

  const lines = [...file.lines];
  if (index >= 0) {
    lines[index] = newLine;
  } else {
    // Append, tách dòng an toàn.
    if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
      lines.push(newLine);
    } else {
      // File kết thúc bằng dòng trống (newline cuối) ⇒ thay dòng trống đó.
      lines[lines.length - 1] = newLine;
    }
  }

  return writeEnvFile(lines);
}

/**
 * Xoá 1 biến khỏi file env — giữ nguyên phần còn lại.
 */
export async function removeEnvVar(name: string): Promise<string> {
  const file = await readEnvLocal();
  const prefix = `${name}=`;

  const lines = file.lines.filter((line) => !line.startsWith(prefix));

  return writeEnvFile(lines);
}

/**
 * Đọc trạng thái key (FR-SC-09).
 *
 * Ưu tiên `.env.local` (nơi UI ghi), fallback `process.env`.
 */
export async function getKeyStatus(): Promise<{
  configured: boolean;
  masked: string | null;
  source: "env_file" | "process_env" | null;
}> {
  const file = await readEnvLocal();
  const fromFile = file.lines.find((line) => line.startsWith("ANTHROPIC_API_KEY="));

  if (fromFile) {
    const value = fromFile.slice("ANTHROPIC_API_KEY=".length).trim();
    if (value.length > 0) {
      return { configured: true, masked: maskEnvKey(value), source: "env_file" };
    }
  }

  const fromProcess = process.env.ANTHROPIC_API_KEY;
  if (fromProcess) {
    return {
      configured: true,
      masked: maskEnvKey(fromProcess),
      source: "process_env",
    };
  }

  return { configured: false, masked: null, source: null };
}

/** Che key — 7 ký tự đầu + 4 ký tự cuối. */
function maskEnvKey(key: string): string {
  if (key.length < 8) return "••••";
  return `${key.slice(0, 7)}••••••••${key.slice(-4)}`;
}

/** Kiểm tra lỗi Node có mã errno không. */
function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

/**
 * Quyền file hiện tại (kiểm tra bằng test).
 */
export async function envFileMode(): Promise<number | null> {
  try {
    const info = await stat(envLocalPath());
    return info.mode & 0o777;
  } catch {
    return null;
  }
}
