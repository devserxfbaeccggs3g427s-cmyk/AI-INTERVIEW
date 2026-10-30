/**
 * Test utility ngày giờ — `src/lib/dates.ts` (tasks.md 1.10).
 *
 * ⚠️ **Bất biến theo múi giờ** là yêu cầu quan trọng nhất của file này.
 * Vì `src/lib/dates.ts` chuẩn hoá theo **giờ local** (cố ý không dùng
 * `toISOString()`), nên test cũng phải dựng Date theo **giờ local**.
 *
 *   ❌ `new Date("2026-10-29T23:30:00Z")` — ở múi giờ UTC+7 đây là 06:30
 *      ngày 30/10 → sai ngày so với mong đợi.
 *   ✅ `new Date(2026, 9, 29, 23, 30, 0)` — luôn là 23:30 ngày 29/10 local.
 *
 * Cách dựng `new Date(y, m, d, ...)` dùng tháng 0-based: `9` = tháng 10.
 */

import { describe, expect, it } from "vitest";
import {
  addDays,
  currentWeek,
  dateKey,
  daysBetween,
  formatVnDate,
  formatVnDateLong,
  isSameDay,
  lastNWeekdays,
  relativeTime,
  startOfDay,
  startOfWeek,
  todayKey,
  weekdayShort,
  WEEKDAY_SHORT_VI,
} from "@/lib/dates";

/** 29/10/2026 12:00 giờ local — Thứ Năm. */
const REF = new Date(2026, 9, 29, 12, 0, 0);
/** 29/10/2026 23:30 giờ local — vẫn phải ra ngày 29/10. */
const REF_LATE = new Date(2026, 9, 29, 23, 30, 0);
/** 26/10/2026 12:00 giờ local — Thứ Hai (đầu tuần ISO). */
const MONDAY = new Date(2026, 9, 26, 12, 0, 0);
/** 25/10/2026 12:00 giờ local — Chủ Nhật (cuối tuần ISO). */
const SUNDAY = new Date(2026, 9, 25, 12, 0, 0);

describe("startOfDay", () => {
  it("đặt giờ về 00:00:00.000 giờ local", () => {
    const d = startOfDay(REF);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(29);
  });

  it("không lệch ngày khi input là 23:30 giờ local", () => {
    const d = startOfDay(REF_LATE);
    expect(d.getDate()).toBe(29);
    expect(d.getMonth()).toBe(9);
    expect(dateKey(d)).toBe("2026-10-29");
  });

  it("không mutate Date input (tạo bản sao)", () => {
    const input = new Date(2026, 9, 29, 15, 45, 30);
    const before = input.getTime();
    startOfDay(input);
    expect(input.getTime()).toBe(before);
  });

  it("chuẩn hoá được cả string ISO lẫn số timestamp", () => {
    expect(dateKey(startOfDay("2026-10-29T08:00:00.000Z"))).toBe(
      dateKey(startOfDay(REF)),
    );
    expect(dateKey(startOfDay(REF.getTime()))).toBe("2026-10-29");
  });
});

describe("todayKey", () => {
  it("trả về 00:00 local của ngày được truyền vào", () => {
    const d = todayKey(REF);
    expect(d.getHours()).toBe(0);
    expect(dateKey(d)).toBe("2026-10-29");
  });

  it("mặc định lấy hôm nay và vẫn là 00:00 local", () => {
    const d = todayKey();
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(dateKey(d)).toBe(dateKey(new Date()));
  });
});

describe("dateKey", () => {
  it("trả về chuỗi YYYY-MM-DD theo giờ local", () => {
    expect(dateKey(REF)).toBe("2026-10-29");
  });

  it("giữ nguyên ngày với giờ 23:30 local", () => {
    expect(dateKey(REF_LATE)).toBe("2026-10-29");
  });

  it("tự thêm số 0 ở tháng và ngày < 10", () => {
    expect(dateKey(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
    expect(dateKey(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});

describe("addDays", () => {
  it("cộng ngày giữ trong tháng", () => {
    const d = addDays(REF, 3);
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(10); // tháng 11
  });

  it("lùi ngày khi trừ", () => {
    const d = addDays(REF, -1);
    expect(d.getDate()).toBe(28);
  });

  it("xử lý chuyển năm (31/12 → 01/01)", () => {
    const d = addDays(new Date(2026, 11, 31, 12), 1);
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it("không mutate Date input", () => {
    const input = new Date(2026, 9, 29, 12);
    const before = input.getTime();
    addDays(input, 10);
    expect(input.getTime()).toBe(before);
  });
});

describe("startOfWeek", () => {
  it("trả về 00:00 Thứ Hai của tuần chứa input", () => {
    const d = startOfWeek(REF);
    expect(d.getDay()).toBe(1); // Thứ Hai
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(26);
    expect(d.getMonth()).toBe(9);
  });

  it("Chủ Nhật vẫn thuộc tuần bắt đầu từ Thứ Hai trước đó", () => {
    const d = startOfWeek(SUNDAY);
    expect(d.getDay()).toBe(1);
    expect(d.getDate()).toBe(19);
    expect(d.getMonth()).toBe(9);
  });

  it("Thứ Hai là đầu tuần → trả về chính nó", () => {
    const d = startOfWeek(MONDAY);
    expect(d.getDate()).toBe(26);
    expect(d.getHours()).toBe(0);
  });

  it("Chủ Nhật của tuần kế tiếp lùi 6 ngày về Thứ Hai", () => {
    const sundayNext = new Date(2026, 9, 25, 12);
    const d = startOfWeek(sundayNext);
    expect(d.getDate()).toBe(19);
  });
});

describe("currentWeek", () => {
  it("trả về { start, end } là tuần ISO hiện tại", () => {
    const { start, end } = currentWeek(REF);
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(26);
    expect(end.getDay()).toBe(0); // Chủ Nhật
    expect(end.getDate()).toBe(1);
    expect(end.getMonth()).toBe(10); // tháng 11
  });

  it("end là 23:59:59.999 của Chủ Nhật", () => {
    const { end } = currentWeek(REF);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("start luôn <= end", () => {
    const { start, end } = currentWeek(REF);
    expect(start.getTime()).toBeLessThan(end.getTime());
  });
});

describe("formatVnDate", () => {
  it("dựng nhãn 'Thứ Năm 29/10'", () => {
    expect(formatVnDate(REF)).toBe("Thứ Năm 29/10");
  });

  it("giữ đúng ngày khi input là 23:30 local", () => {
    expect(formatVnDate(REF_LATE)).toBe("Thứ Năm 29/10");
  });

  it("dùng tên thứ đầy đủ tiếng Việt", () => {
    expect(formatVnDate(MONDAY)).toBe("Thứ Hai 26/10");
    expect(formatVnDate(SUNDAY)).toBe("Chủ Nhật 25/10");
  });
});

describe("formatVnDateLong", () => {
  it("dựng nhãn dài có năm", () => {
    expect(formatVnDateLong(REF)).toBe("Thứ Năm, 29 tháng 10, 2026");
  });
});

describe("weekdayShort", () => {
  it("trả nhãn 2 chữ theo thứ", () => {
    expect(weekdayShort(SUNDAY)).toBe("CN");
    expect(weekdayShort(MONDAY)).toBe("T2");
    expect(weekdayShort(REF)).toBe("T5");
  });

  it("bảng nhãn có đúng 7 thứ, bắt đầu bằng CN", () => {
    expect(WEEKDAY_SHORT_VI).toHaveLength(7);
    expect(WEEKDAY_SHORT_VI[0]).toBe("CN");
    expect(WEEKDAY_SHORT_VI[6]).toBe("T7");
  });
});

describe("lastNWeekdays", () => {
  it("trả 7 ngày theo thứ tự T2 → CN của tuần chứa end", () => {
    const days = lastNWeekdays(REF, 7);
    expect(days).toHaveLength(7);
    expect(days[0]?.getDay()).toBe(1);
    expect(days[6]?.getDay()).toBe(0);
    expect(days[0]?.getDate()).toBe(26);
    expect(days[6]?.getDate()).toBe(1);
    expect(days[6]?.getMonth()).toBe(10);
  });

  it("mọi ngày đều là 00:00 local", () => {
    for (const d of lastNWeekdays(REF, 7)) {
      expect(d.getHours()).toBe(0);
    }
  });

  it("giữ đúng thứ tự liên tiếp 7 ngày", () => {
    const days = lastNWeekdays(REF, 7);
    for (let i = 1; i < days.length; i += 1) {
      const prev = days[i - 1];
      const cur = days[i];
      expect(prev).toBeDefined();
      expect(cur).toBeDefined();
      if (prev && cur) {
        expect(cur.getTime() - prev.getTime()).toBe(86_400_000);
      }
    }
  });

  it("hỗ trợ n khác 7", () => {
    expect(lastNWeekdays(REF, 3)).toHaveLength(3);
  });
});

describe("relativeTime", () => {
  const NOW = new Date(2026, 9, 29, 12, 0, 0);

  it("'vừa xong' khi chênh lệch < 1 phút", () => {
    expect(relativeTime(new Date(2026, 9, 29, 11, 59, 30), NOW)).toBe("vừa xong");
  });

  it("đếm phút khi < 1 giờ", () => {
    expect(relativeTime(new Date(2026, 9, 29, 11, 15, 0), NOW)).toBe("45 phút trước");
    expect(relativeTime(new Date(2026, 9, 29, 11, 30, 0), NOW)).toBe("30 phút trước");
  });

  it("chuyển sang giờ khi đạt đúng 60 phút", () => {
    expect(relativeTime(new Date(2026, 9, 29, 11, 0, 0), NOW)).toBe("1 giờ trước");
    expect(relativeTime(new Date(2026, 9, 29, 9, 0, 0), NOW)).toBe("3 giờ trước");
  });

  it("đếm giờ khi < 24 giờ", () => {
    expect(relativeTime(new Date(2026, 9, 29, 0, 0, 0), NOW)).toBe("12 giờ trước");
  });

  it("đếm ngày khi < 30 ngày", () => {
    expect(relativeTime(new Date(2026, 9, 26, 12, 0, 0), NOW)).toBe("3 ngày trước");
  });

  it("đếm tháng khi >= 30 ngày", () => {
    expect(relativeTime(new Date(2026, 7, 29, 12, 0, 0), NOW)).toBe("2 tháng trước");
  });

  it("nhận cả Date lẫn string", () => {
    expect(relativeTime(new Date(2026, 9, 29, 11, 30, 0).toISOString(), NOW)).toBe(
      "30 phút trước",
    );
  });
});

describe("daysBetween & isSameDay", () => {
  it("đếm số ngày lịch giữa 2 mốc", () => {
    expect(daysBetween(MONDAY, REF)).toBe(3);
    expect(daysBetween(REF, MONDAY)).toBe(-3);
    expect(daysBetween(REF, REF)).toBe(0);
  });

  it("bỏ qua giờ trong ngày (chỉ so ngày lịch)", () => {
    expect(daysBetween(new Date(2026, 9, 26, 0, 0, 0), new Date(2026, 9, 26, 23, 59))).toBe(0);
  });

  it("isSameDay so sánh theo ngày lịch local", () => {
    expect(isSameDay(REF, REF_LATE)).toBe(true);
    expect(isSameDay(REF, MONDAY)).toBe(false);
  });
});
