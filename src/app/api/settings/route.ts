import { getRepository } from "@/lib/db/repository";
import { settingsSchema } from "@/lib/db/validation";
import { errorResponse, readJson } from "@/lib/errors";

export async function GET() {
  try {
    return Response.json(await (await getRepository()).getSettings(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const settings = settingsSchema.parse(await readJson(request));
    await (await getRepository()).saveSettings(settings);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
