import { revalidatePath } from "next/cache";

/**
 * Xoá cache của các route đọc kế hoạch — an toàn khi gọi ngoài request.
 *
 * ⚠️ `revalidatePath` từ `next/cache` ném
 * `Invariant: static generation store missing` khi được gọi **ngoài** request
 * context của Next.js (ví dụ: unit/integration test gọi route handler trực
 * tiếp). Lỗi này không phải lỗi logic — chỉ là cache không tồn tại.
 *
 * ⇒ Bọc trong try/catch và bỏ qua. Cache vẫn được xoá đúng khi chạy thật.
 */
export function revalidatePlanPaths(): void {
  try {
    revalidatePath("/");
    revalidatePath("/plan");
  } catch {
    // Ngoài request context (test) — không có cache store để xoá.
  }
}
