import { cn } from "@/lib/cn";
import { prisma } from "@/lib/db";

/**
 * `DbStatus` — card trạng thái DB (SQLite / Vector).
 *
 * Dùng ở footer của sidebar (dải "SQLite / Vector · Local DB Active") và ở
 * S15 Cài đặt (chip trạng thái hệ thống).
 *
 * **Đọc trạng thái THẬT** — không hardcode "Local DB Active" (design.md §9.4
 * mục 5: số liệu mockup phải lấy từ DB thật). Ba thứ được kiểm tra:
 *   1. Kết nối SQLite còn sống không (`SELECT 1`).
 *   2. Phiên bản SQLite thật (`sqlite_version()`).
 *   3. Tổng số bản ghi của các bảng chính.
 *
 * ⚠️ Nhãn "Vector" là **nhãn thiết kế** của hệ thống (design.md §2.3). SQLite
 * dựng sẵn không có extension vector, nên phần "vector" ở đây báo trạng thái
 * engine tìm kiếm cục bộ (FTS5) — có bật hay không — chứ KHÔNG phải vector DB.
 * Nhờ vậy nhãn khớp mockup mà thông tin vẫn thật.
 *
 * **Server Component** (không có directive): đọc Prisma ở server rồi trả
 * markup tĩnh — không gửi code DB xuống client.
 *
 * Xem design.md §2.3 (sidebar footer) · §4.15 (S15) · tasks.md 3.3.
 */

export type DbStatusInfo = {
  /** Kết nối SQLite còn sống không. */
  connected: boolean;
  /** Phiên bản SQLite thật, ví dụ "3.46.0". */
  version: string | null;
  /** Tổng số bản ghi của các bảng chính. */
  records: number;
  /** Có extension FTS5 (engine tìm kiếm cục bộ) không. */
  ftsAvailable: boolean;
  /** Thông báo lỗi nếu không kết nối được. */
  error: string | null;
};

/** Các bảng được tính vào con số "records" (task 9.x — chip S15). */
const COUNTED_MODELS = [
  "activity",
  "skill",
  "card",
  "planItem",
  "dailyState",
  "aiCall",
  "evidence",
  "reflection",
] as const;

/**
 * Đọc trạng thái DB thật.
 *
 * Bọc trong try/catch vì DB có thể chưa migrate (`.next` build lúc DB hỏng vẫn
 * phải render được sidebar — AC-8 "mọi lỗi đều không làm trang crash").
 */
export async function readDbStatus(): Promise<DbStatusInfo> {
  try {
    // `SELECT 1` — kiểm tra kết nối sống.
    await prisma.$queryRawUnsafe("SELECT 1;");

    const versionRows = await prisma.$queryRawUnsafe<Array<{ sqlite_version: string }>>(
      "SELECT sqlite_version() AS sqlite_version;",
    );
    const version = versionRows[0]?.sqlite_version ?? null;

    // Kiểm tra FTS5 — chỉ đọc `pragma_module_list`, không thay đổi DB.
    let ftsAvailable = false;
    try {
      const moduleRows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        "SELECT name FROM pragma_module_list WHERE name = 'fts5';",
      );
      ftsAvailable = moduleRows.length > 0;
    } catch {
      ftsAvailable = false;
    }

    // `prisma[model]` là union của các delegate Prisma khác nhau → TypeScript
    // không tìm được signature chung để gọi `count()`. Ép kiểu **delegate** về
    // interface tối thiểu để vẫn gọi được trong vòng lặp trên danh sách model.
    type Countable = { count: () => Promise<number> };
    const counts = await Promise.all(
      COUNTED_MODELS.map(
        (model) => (prisma[model] as unknown as Countable).count(),
      ),
    );
    const total = counts.reduce((sum: number, value: number) => sum + value, 0);

    return {
      connected: true,
      version,
      records: total,
      ftsAvailable,
      error: null,
    };
  } catch (error) {
    return {
      connected: false,
      version: null,
      records: 0,
      ftsAvailable: false,
      error: error instanceof Error ? error.message : "Không đọc được trạng thái DB",
    };
  }
}

export type DbStatusProps = {
  /** Dữ liệu trạng thái đã đọc sẵn từ server. */
  status: DbStatusInfo;
  /** Biến thể hiển thị: `compact` cho footer sidebar, `full` cho trang Cài đặt. */
  variant?: "compact" | "full";
  className?: string;
};

export function DbStatus({ status, variant = "compact", className }: DbStatusProps) {
  const { connected, version, records, ftsAvailable } = status;

  // Dòng phụ hiển thị — nói rõ đang hoạt động hay không, không bịa số liệu.
  const detail = connected
    ? `Local DB Active${version ? ` · v${version}` : ""}`
    : "DB Không phản hồi";

  if (variant === "full") {
    return (
      <div
        className={cn(
          "flex items-center gap-space-md rounded-lg border border-outline-variant/30",
          "bg-surface-container-low px-gutter py-space-md",
          className,
        )}
        data-testid="db-status"
      >
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-[9999px]",
            connected ? "bg-primary animate-pulse" : "bg-error",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-label-md text-on-surface">
            SQLite{version ? ` v${version}` : ""} {connected ? "Connected" : "Disconnected"}
          </div>
          <div className="truncate font-label-sm text-outline">
            {records.toLocaleString("vi-VN")} records ·{" "}
            {ftsAvailable ? "FTS5 Available" : "FTS5 Unavailable"} · Không đồng bộ đám mây (P6
            Strict Sandboxing)
          </div>
        </div>
        <span className="material-symbols-outlined shrink-0 text-outline" aria-hidden>
          database
        </span>
      </div>
    );
  }

  // Bản compact — dải footer của sidebar (mockup S01: `SQLite / Vector` +
  // `Local DB Active` + icon `database`).
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-space-md rounded-lg border border-outline-variant/20",
        "bg-surface-container-low px-space-md py-space-sm",
        className,
      )}
      data-testid="db-status"
    >
      <div className="flex items-center gap-space-md">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-[9999px]",
            connected ? "bg-primary animate-pulse" : "bg-error",
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <div className="truncate font-label-md font-semibold text-on-surface">
            SQLite / Vector
          </div>
          <div className="truncate font-label-sm text-outline">{detail}</div>
        </div>
      </div>
      <span className="material-symbols-outlined shrink-0 text-outline" aria-hidden>
        database
      </span>
    </div>
  );
}
