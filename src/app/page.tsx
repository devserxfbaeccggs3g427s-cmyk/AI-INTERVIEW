import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Trang chủ placeholder — Phase -1 (app-foundation).
 *
 * ⚠️ KHÔNG implement logic S01 ở đây. Mục đích duy nhất là kiểm chứng:
 *   - design token render đúng (màu, font, typography)
 *   - layout shell + bottom nav 4 mục + menu 5 mục
 *   - app không crash khi thiếu API key hoặc chưa migrate DB
 */

interface Health {
  db: boolean;
  dbError?: string;
  ai: "configured" | "offline";
}

async function checkHealth(): Promise<Health> {
  const ai: Health["ai"] = env.isOffline ? "offline" : "configured";

  try {
    await prisma.$queryRaw`SELECT 1`;
    return { db: true, ai };
  } catch (error) {
    return {
      db: false,
      dbError: error instanceof Error ? error.message : String(error),
      ai,
    };
  }
}

export default async function HomePage() {
  const health = await checkHealth();

  return (
    <div className="space-y-gutter-lg">
      {/* Top analytical status strip — placeholder, sẽ thay bằng S01 */}
      <section
        aria-label="Thanh trạng thái"
        className="grid grid-cols-1 gap-gutter-md xl:grid-cols-12"
      >
        <div className="rounded-xl bg-surface-container p-space-lg shadow-md xl:col-span-8">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Trọng tâm hôm nay
          </span>
          <p className="mt-space-sm font-headline-md text-headline-md text-on-surface">
            Daily Loop OS
          </p>
          <p className="mt-space-sm text-body-sm text-body-sm text-on-surface-variant">
            Khung dự án đã dựng xong. Nội dung S01 (Daily Loop) sẽ thay thế khối này ở
            feature <code className="font-code-md text-code-md text-secondary">daily-loop-core</code>.
          </p>
        </div>

        <div className="flex flex-col justify-between rounded-xl bg-surface-container-low p-space-lg shadow-md xl:col-span-4">
          <div>
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
              Hệ thống
            </span>
            <dl className="mt-space-sm space-y-space-xs">
              <div className="flex items-center justify-between">
                <dt className="text-body-sm text-body-sm text-on-surface-variant">Database</dt>
                <dd
                  className={`font-label-md text-label-md ${
                    health.db ? "text-primary" : "text-tertiary"
                  }`}
                >
                  {health.db ? "đã kết nối" : "chưa sẵn sàng"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-body-sm text-body-sm text-on-surface-variant">AI</dt>
                <dd
                  className={`font-label-md text-label-md ${
                    health.ai === "configured" ? "text-secondary" : "text-outline"
                  }`}
                >
                  {health.ai === "configured" ? "đã cấu hình" : "offline mode"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Banner hướng dẫn */}
      {!health.db && (
        <div
          role="status"
          className="rounded-xl border border-tertiary/30 bg-tertiary/10 p-space-lg"
        >
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-tertiary">
            Cần thiết lập
          </span>
          <p className="mt-space-sm text-body-md text-body-md text-on-surface">
            Database chưa sẵn sàng. Chạy lệnh sau rồi tải lại trang:
          </p>
          <code className="mt-space-sm block rounded-lg bg-surface-container-lowest p-space-md font-code-md text-code-md text-primary">
            npm run db:migrate &amp;&amp; npm run db:seed
          </code>
        </div>
      )}

      {health.ai === "offline" && (
        <div
          role="status"
          className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-space-lg"
        >
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Offline mode
          </span>
          <p className="mt-space-sm text-body-md text-body-md text-on-surface-variant">
            Đang chạy offline mode — chưa có <code className="font-code-md text-code-md">ANTHROPIC_API_KEY</code>.
            Mọi tính năng AI sẽ hiện &ldquo;cần API key&rdquo; thay vì gọi API. Thêm key trong{" "}
            <code className="font-code-md text-code-md">.env.local</code> rồi khởi động lại server.
          </p>
        </div>
      )}

      {/* Placeholder chính */}
      <section className="rounded-xl bg-surface-container p-space-lg shadow-md">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
          Phase -1 · Khung dự án
        </span>
        <h1 className="mt-space-sm font-headline-lg text-headline-lg text-on-surface">
          Token, layout shell và dữ liệu seed đã sẵn sàng
        </h1>
        <ul className="mt-space-lg space-y-space-sm text-body-md text-body-md text-on-surface-variant">
          <li>· Design token: màu, typography, spacing, shape — theo design-system.md</li>
          <li>· Layout shell: top strip + main module + bottom nav 4 mục</li>
          <li>· Prisma: 19 model của SPEC §4, đã migrate</li>
          <li>· Seed: 53 node kỹ năng + 140 thẻ ngoại ngữ (không gọi AI)</li>
        </ul>
      </section>
    </div>
  );
}
