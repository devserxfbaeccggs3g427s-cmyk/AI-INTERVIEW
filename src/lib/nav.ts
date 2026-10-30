/**
 * NAV_ITEMS — nguồn duy nhất cho sidebar.
 *
 * Quy tắc bất di bất dịch (structure.md + design.md §2.3):
 *   KHÔNG copy-paste nav giữa 21 màn hình. Sidebar đọc từ đây.
 *   Đúng **9 mục**, `href` thật, có `icon` (Material Symbols Outlined) + `label`.
 *   Mục 8 có nhãn "Báo cáo tuần & tiến độ".
 *
 * Xem tasks.md 3.2.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Mô tả phụ hiển thị dưới nhãn ở trạng thái active (tuỳ chọn). */
  hint?: string;
  /**
   * Các **tiền tố route** thuộc phân hệ của mục nav này.
   *
   * Ví dụ mục "Hôm nay" có `sections: ["/plan", "/log", "/state"]` vì S02
   * (sinh kế hoạch), S05 (quick-log) và S12 (đánh giá chính) đều là thao tác
   * trong ngày — không có mục nav riêng cho chúng.
   */
  sections?: readonly string[];
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Hôm nay",
    icon: "dashboard",
    hint: "Daily Loop",
    // S02 sinh kế hoạch · S05 quick-log · S12 đánh giá chính.
    sections: ["/plan", "/log", "/state"],
  },
  { href: "/skills", label: "Cây kỹ năng", icon: "account_tree", sections: ["/skills"] },
  {
    href: "/language",
    label: "Ôn tập ngoại ngữ",
    icon: "translate",
    hint: "SRS",
    sections: ["/language"],
  },
  {
    href: "/speak/write",
    label: "Luyện giao tiếp",
    icon: "record_voice_over",
    // S07 viết + S08 nói — cùng một phân hệ.
    sections: ["/speak"],
  },
  { href: "/journal", label: "Nhật ký & AI", icon: "menu_book", sections: ["/journal"] },
  {
    href: "/interview/setup",
    label: "Mock Interview",
    icon: "forum",
    // S16 cấu hình + S17 phiên + S18 kết quả (`/interview/[id]` ở Phase 1).
    sections: ["/interview"],
  },
  {
    href: "/test",
    label: "Bài kiểm tra",
    icon: "assignment",
    // S19 danh sách + S20 làm bài + S21 kết quả (`/test/[id]` ở Phase 1).
    sections: ["/test", "/test/session"],
  },
  {
    href: "/review",
    label: "Báo cáo tuần & tiến độ",
    icon: "insights",
    // S13 báo cáo tuần + S14 báo cáo tiến bộ.
    sections: ["/review", "/progress"],
  },
  { href: "/settings", label: "Cài đặt", icon: "settings", sections: ["/settings"] },
];

/**
 * So khớp **prefix** — dùng cho cả `href` lẫn `sections`.
 *
 * `"/skills/abc"` khớp `"/skills"`; `"/skills-abc"` **không** khớp (ranh giới
 * bằng dấu gạch chéo) để tránh nuốt nhầm route khác.
 */
function matchesPrefix(pathname: string, prefix: string): boolean {
  if (pathname === prefix) return true;
  return pathname.startsWith(`${prefix}/`);
}

/**
 * Active state dùng so khớp **prefix** của pathname — không dùng `data-path`.
 *
 * Thứ tự ưu tiên:
 *   1. Khớp chính xác `href` của một mục nav.
 *   2. Khớp tiền tố `sections` (dài nhất trước) — xử lý các route nằm trong
 *      phân hệ nhưng không phải `href` của mục nav nào.
 *   3. Không khớp gì → không mục nào active.
 *
 * Ngoại lệ: `"/"` chỉ active khi pathname đúng bằng `"/"`.
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return matchesPrefix(pathname, href);
}

/**
 * Danh sách tiền tố `sections` đã sắp xếp theo độ dài giảm dần.
 *
 * Sắp xếp để khi hai tiền tố lồng nhau, tiền tố dài hơn thắng — ví dụ
 * `/test/session` nếu sau này có `/test` và `/test/session` cùng tồn tại.
 */
const SORTED_SECTIONS: ReadonlyArray<readonly [string, string]> = NAV_ITEMS.flatMap((item) =>
  (item.sections ?? []).map((prefix): readonly [string, string] => [prefix, item.href]),
).sort((a, b) => b[0].length - a[0].length);

/**
 * Tra cứu mục nav "chủ" của một pathname.
 *
 * Luôn trả về đúng **1** mục cho mọi route trong bảng 21 màn hình (AC-15 +
 * task 3.5). Trả `null` khi route không thuộc phân hệ nào.
 */
export function navHrefForPathname(pathname: string): string | null {
  // 1) Khớp chính xác.
  const exact = NAV_ITEMS.find((item) => item.href === pathname);
  if (exact) return exact.href;

  // 2) Khớp tiền tố `sections` (dài nhất trước).
  for (const [prefix, href] of SORTED_SECTIONS) {
    if (matchesPrefix(pathname, prefix)) return href;
  }

  // 3) Prefix trên `href` — `/skills/abc` → `/skills`.
  const prefixMatch = NAV_ITEMS.find((item) => isNavActive(pathname, item.href));
  return prefixMatch?.href ?? null;
}

/**
 * Tìm mục nav active cho pathname hiện tại.
 *
 * Dùng `navHrefForPathname` nên **luôn** trả về đúng 1 mục cho mọi route
 * trong bảng 21 màn hình (AC-15) — kể cả các route cần alias.
 */
export function activeNavItem(pathname: string): NavItem | undefined {
  const href = navHrefForPathname(pathname);
  if (!href) return undefined;
  return NAV_ITEMS.find((item) => item.href === href);
}
