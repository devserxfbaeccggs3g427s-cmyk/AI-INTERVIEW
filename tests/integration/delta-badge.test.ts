// @vitest-environment jsdom
/**
 * Integration test — `DeltaBadge` (tasks.md 11.5).
 *
 * 11.5 Done: *"↑ primary / ↓ error"*. Test bảo vệ đúng 3 trạng thái:
 *   - **Tăng** → `text-primary` + icon `trending_up`
 *   - **Giảm** → `text-error`   + icon `trending_down`
 *   - **Giữ nguyên / chưa có dữ liệu** → `text-outline` + icon `remove`
 *
 * Và bảo vệ **import site cũ**: `RubricGrid` phải re-export `DeltaBadge` để
 * `src/app/speak/write/page.tsx` + `src/app/speak/talk/page.tsx` không phải sửa.
 *
 * Xem tasks.md 11.5 · SPEC.md S07.
 */

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render } from "@testing-library/react";

import { DeltaBadge } from "@/components/rubric/DeltaBadge";
import { DeltaBadge as ReExportedDeltaBadge } from "@/components/rubric/RubricGrid";

describe("DeltaBadge — so sánh với lần ghi trước (11.5)", () => {
  it("tăng → `text-primary` + icon `trending_up`", () => {
    const { container } = render(createElement(DeltaBadge, { current: 4, previous: 3 }));
    const el = container.firstElementChild as HTMLElement;

    expect(el.className).toContain("text-primary");
    expect(el.className).not.toContain("text-error");
    expect(el.textContent).toContain("trending_up");
    expect(el.textContent).toContain("+1.0");
  });

  it("giảm → `text-error` + icon `trending_down`", () => {
    const { container } = render(createElement(DeltaBadge, { current: 3, previous: 4 }));
    const el = container.firstElementChild as HTMLElement;

    expect(el.className).toContain("text-error");
    expect(el.className).not.toContain("text-primary");
    expect(el.textContent).toContain("trending_down");
    expect(el.textContent).toContain("-1.0");
  });

  it("giữ nguyên → `text-outline` + icon `remove`", () => {
    const { container } = render(createElement(DeltaBadge, { current: 3, previous: 3 }));
    const el = container.firstElementChild as HTMLElement;

    expect(el.className).toContain("text-outline");
    expect(el.textContent).toContain("remove");
  });

  it("chưa có dữ liệu (`previous = null`) → `text-outline` + 'chưa có dữ liệu'", () => {
    const { container } = render(createElement(DeltaBadge, { current: 3, previous: null }));
    const el = container.firstElementChild as HTMLElement;

    expect(el.className).toContain("text-outline");
    expect(el.textContent).toContain("chưa có dữ liệu");
    expect(el.textContent).toContain("remove");
  });

  it("nhãn tuỳ chỉnh được hiển thị đúng", () => {
    const { container } = render(
      createElement(DeltaBadge, { current: 4, previous: 3, label: "So với lần trước" }),
    );
    expect((container.firstElementChild as HTMLElement).textContent).toContain("So với lần trước");
  });

  it("`RubricGrid` re-export `DeltaBadge` — import site cũ không phải sửa", () => {
    expect(ReExportedDeltaBadge).toBe(DeltaBadge);
  });
});
