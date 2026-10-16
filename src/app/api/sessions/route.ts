import { getRepository } from "@/lib/db/repository";
import { createSessionSchema } from "@/lib/db/validation";
import { errorResponse, readJson } from "@/lib/errors";

export async function GET() {
  try {
    const sessions = await (await getRepository()).list(100);
    return Response.json(sessions, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = createSessionSchema.parse(await readJson(request));
    const created = await (await getRepository()).create(input);
    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
