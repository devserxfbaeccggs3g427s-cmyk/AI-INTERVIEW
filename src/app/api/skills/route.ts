import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { createSkill, getSkillTree } from "@/lib/skills";

export const dynamic = "force-dynamic";

/**
 * GET /api/skills — cây kỹ năng 3 tầng (FR-SK-01, FR-SK-07).
 *
 * NFR-SK-04 — không N+1: 1 query skill + 1 query evidence + 1 query activity.
 */
export async function GET(): Promise<Response> {
  try {
    const tree = await getSkillTree();
    return toResponse(ok(tree));
  } catch (error) {
    return toResponse(
      fail("db_error", error instanceof Error ? error.message : "Không đọc được cây kỹ năng"),
    );
  }
}

const CreateSkillSchema = z.object({
  name: z.string().min(1).max(80),
  domain: z.enum(["professional", "communication", "language", "personal"]),
  parentId: z.string().nullable(),
  targetLevel: z.number().int().min(1).max(5).default(3),
  nameZh: z.string().max(80).nullable().optional(),
});

/**
 * POST /api/skills — tạo node mới (FR-SK-04).
 *
 * Giới hạn: tối đa tầng 3, `domain` phải khớp node cha.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = CreateSkillSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  try {
    const id = await createSkill(parsed.data);
    return toResponse(ok({ id }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không tạo được node";

    if (message === "parent_not_found") {
      return toResponse(fail("not_found", "parent_not_found: node cha không tồn tại"));
    }
    if (message === "max_depth_exceeded") {
      return toResponse(fail("invalid_input", "max_depth_exceeded: cây chỉ có 3 tầng"));
    }
    if (message === "domain_mismatch") {
      return toResponse(fail("invalid_input", "domain_mismatch: domain phải khớp node cha"));
    }

    throw error;
  }
}
