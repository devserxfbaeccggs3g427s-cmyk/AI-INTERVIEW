import { compareSessions } from "@/lib/compare";
import { privateJson } from "@/lib/origin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.getAll("a").length !== 1 || url.searchParams.getAll("b").length !== 1) {
    return privateJson({ ok: false, error: "Chọn đúng hai phiên khác nhau (A và B)." }, { status: 400 });
  }
  const result = compareSessions(url.searchParams.get("a"), url.searchParams.get("b"));
  if (!result.ok) return privateJson({ ok: false, error: result.error }, { status: result.status });
  return privateJson(result);
}
