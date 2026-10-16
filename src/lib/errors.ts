import { ZodError } from "zod";

// Không phản chiếu message/stack của lỗi DB hay đầu vào người dùng vào log/response.
export function redact(_error: unknown): string {
  return "Yêu cầu không thể hoàn tất. Vui lòng thử lại.";
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return Response.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  return Response.json({ error: redact(error) }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  const size = Number(request.headers.get("content-length"));
  if (!Number.isFinite(size) || size > 100_000) throw new SyntaxError("Payload quá lớn");
  const body = await request.text();
  if (body.length > 100_000) throw new SyntaxError("Payload quá lớn");
  return JSON.parse(body) as unknown;
}
