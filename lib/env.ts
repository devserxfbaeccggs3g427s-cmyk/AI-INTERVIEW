/**
 * Server-only env access.
 * Centralised here so route handlers never read process.env directly.
 */
import "server-only";

function read(key: string, fallback?: string): string {
  const v = process.env[key];
  if (!v || !v.trim()) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env: ${key}`);
  }
  return v;
}

function readBool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (!v) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

export const env = {
  INTERVIEW_DB_PATH: read("INTERVIEW_DB_PATH", "./data/interview_sessions.db"),
  ALLOW_PRIVATE_BASE_URL: readBool("ALLOW_PRIVATE_BASE_URL", false),
};
