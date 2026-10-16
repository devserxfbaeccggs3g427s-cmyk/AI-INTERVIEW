import { getRepository } from "@/lib/db/repository";
import { errorResponse } from "@/lib/errors";

export async function POST() {
  try {
    return Response.json({ deleted: await (await getRepository()).purge() });
  } catch (error) {
    return errorResponse(error);
  }
}
