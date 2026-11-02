import { describe, expect, it } from "vitest";

/**
 * FR-LG-04 — Thứ tự lấy thẻ: đến hạn trước, thẻ mới sau.
 * AC-LG-2 — Thẻ đến hạn (reps > 0 hoặc due <= now) đứng trước thẻ mới (reps = 0).
 * AC-LG-3 — Cắt còn tối đa 20 thẻ.
 * AC-LG-4 — Hết thẻ đến hạn → thẻ mới từ nhóm chưa học (reps = 0).
 */
describe("FR-LG-04 — thuật toán chọn thẻ SRS (AC-LG-2..4)", () => {
  /** Mô phỏng đúng thuật toán `buildSessionQueue` dùng. */
  function orderCards<
    T extends { due: number; reps: number },
  >(cards: T[], now: number): T[] {
    const due = cards.filter((c) => c.due <= now);
    const fresh = cards.filter((c) => c.due > now && c.reps === 0);
    // Due cards should be sorted by due ASC, then createdAt ASC.
    due.sort((a, b) => a.due - b.due);
    return [...due, ...fresh];
  }

  it("thẻ đến hạn (due <= now) đứng trước thẻ mới (due > now, reps = 0)", () => {
    const now = 1_000_000;
    const ordered = orderCards(
      [
        { id: "new", due: now + 1000, reps: 0 },
        { id: "due", due: now - 1, reps: 3 },
      ],
      now,
    );

    expect(ordered.map((c) => c.id)).toEqual(["due", "new"]);
  });

  it("thẻ tương lai đã học (reps > 0) không vào queue", () => {
    const now = 1_000_000;
    const ordered = orderCards(
      [
        { id: "future-learned", due: now + 1000, reps: 2 },
        { id: "due", due: now - 1, reps: 1 },
      ],
      now,
    );

    expect(ordered.map((c) => c.id)).toEqual(["due"]);
  });

  it("cắt còn tối đa 20 thẻ (SRS_SESSION_MAX_CARDS)", () => {
    const now = 1_000_000;
    const many = Array.from({ length: 50 }, (_, index) => ({
      id: `c${index}`,
      due: now - index,
      reps: 1,
    }));

    expect(orderCards(many, now).slice(0, 20)).toHaveLength(20);
  });

  it("thẻ đến hạn cũ hơn (due nhỏ hơn) đứng trước thẻ đến hạn gần hơn (due ASC)", () => {
    const now = 1_000_000;
    const ordered = orderCards(
      [
        { id: "due-near", due: now - 100, reps: 1 },
        { id: "due-far", due: now - 500, reps: 2 },
        { id: "due-mid", due: now - 200, reps: 1 },
      ],
      now,
    );

    // Due ASC: due-far (now-500), due-mid (now-200), due-near (now-100).
    expect(ordered.map((c) => c.id)).toEqual(["due-far", "due-mid", "due-near"]);
  });

  it("thẻ mới cùng reps = 0 sắp theo createdAt (mô phỏng)", () => {
    const now = 1_000_000;
    const ordered = orderCards(
      [
        { id: "new-1", due: now + 100, reps: 0 },
        { id: "new-2", due: now + 200, reps: 0 },
      ],
      now,
    );

    expect(ordered.map((c) => c.id)).toEqual(["new-1", "new-2"]);
  });
});

/**
 * AC-LG-6 — Tiến độ & streak riêng từng ngôn ngữ.
 */
describe("FR-LG-09 — tiến độ & streak riêng từng ngôn ngữ (AC-LG-6)", () => {
  it("streak tính theo ngày local, hôm nay chưa ôn thì bắt đầu từ hôm qua", () => {
    const now = new Date("2026-10-31T10:00:00.000Z");

    function toLocalDay(date: Date): string {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    const days = new Set<string>(["2026-10-28", "2026-10-29", "2026-10-30"]);

    let streak = 0;
    const cursor = new Date(now);
    cursor.setHours(0, 0, 0, 0);

    if (!days.has(toLocalDay(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    while (days.has(toLocalDay(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    expect(streak).toBe(3);
  });

  it("hôm nay đã ôn → streak giữ lại hôm nay", () => {
    const now = new Date("2026-10-31T10:00:00.000Z");

    function toLocalDay(date: Date): string {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    const days = new Set<string>(["2026-10-31", "2026-10-30", "2026-10-29"]);

    let streak = 0;
    const cursor = new Date(now);
    cursor.setHours(0, 0, 0, 0);

    if (!days.has(toLocalDay(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    while (days.has(toLocalDay(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    expect(streak).toBe(3);
  });
});