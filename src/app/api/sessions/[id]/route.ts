import { getRepository } from "@/lib/db/repository";
import { errorResponse } from "@/lib/errors";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const session = await (await getRepository()).load(id);
    if (!session) return Response.json({ error: "Không tìm thấy phiên" }, { status: 404 });
    return Response.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const deleted = await (await getRepository()).delete(id);
    if (!deleted) return Response.json({ error: "Không tìm thấy phiên" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
