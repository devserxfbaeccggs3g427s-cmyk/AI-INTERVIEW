/**
 * E2E — S03 Cây kỹ năng & S04 chi tiết (task 7.13 · FR-SK-01 / FR-SK-03).
 *
 * Kiểm chứng:
 *   1. Cây 3 tầng, **4 domain cố định** — mọi node có level, số bằng chứng,
 *      thanh segment (task 7.1).
 *   2. "Đặt làm trọng tâm hôm nay" → `FocusTarget` của hôm nay ghi đúng 1 node
 *      (duy nhất 1 node/ngày) và **S01 đổi trọng tâm** sang node đó (task 7.2).
 *   3. "Luyện tập đo lường ngay" → **+1 Evidence** + đúng 1 Activity gắn node
 *      (task 7.3 · FR-SK-01).
 *   4. "Tạo mục kỹ năng con" → node mới xuất hiện trong cây với mục cha đúng
 *      (task 7.4).
 *   5. Feed bằng chứng sắp xếp **thời gian giảm dần** (task 7.5).
 *
 * ⚠️ Test dùng `prisma` trực tiếp (import tương đối `../../src/lib/db`) —
 * đọc DB thật để khẳng định side-effect, không chỉ kiểm tra giao diện.
 */

import { expect, test, type Page } from "@playwright/test";

import { prisma } from "../../src/lib/db-test";
import { startOfDay } from "../../src/lib/dates";

const today = () => startOfDay(new Date());

/** Tiêu đề Activity mà nút "Luyện tập đo lường ngay" tạo ra. */
const practiceTitle = (skillName: string) => `Luyện tập đo lường: ${skillName}`;

/**
 * Chọn 1 node tầng 2 (skill gốc) — có mức ưu tiên cao nhất trong cây.
 *
 * Id là `cuid` sinh ngẫu nhiên mỗi lần seed → **không** hardcode id trong test.
 */
async function pickRootSkill() {
  const skill = await prisma.skill.findFirst({
    where: { parentId: null },
    orderBy: [{ position: "asc" }],
    select: { id: true, name: true, domain: true },
  });
  if (!skill) throw new Error("Cây kỹ năng chưa được seed.");
  return skill;
}

/** Chọn 1 node tầng 3 (mục kỹ năng con) — để kiểm tra cây 3 tầng. */
async function pickChildSkill() {
  const skill = await prisma.skill.findFirst({
    where: { parentId: { not: null } },
    orderBy: [{ position: "asc" }],
    select: { id: true, name: true, parentId: true },
  });
  if (!skill) throw new Error("Cây kỹ năng chưa có mục con.");
  return skill;
}

/** Bấm 1 node trong cây → panel chi tiết chuyển sang node đó. */
async function selectNode(page: Page, skillId: string) {
  await page.locator(`[data-skill-id="${skillId}"]`).click();
  await expect(page.getByTestId("skill-detail-panel")).toBeVisible();
}

test.describe("S03/S04 — Cây kỹ năng", () => {
  test.beforeEach(async () => {
    // Trọng tâm là duy nhất 1 node/ngày → xoá trọng tâm hôm nay trước mỗi test
    // để test chạy lại được (idempotent).
    await prisma.focusTarget.deleteMany({ where: { date: today() } });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("cây 3 tầng, 4 domain cố định, node có level + số bằng chứng", async ({ page }) => {
    await page.goto("/skills");

    const tree = page.getByTestId("skill-tree");
    await expect(tree).toBeVisible();

    // 4 domain cố định (FR-SK-01).
    await expect(tree.locator("section[data-domain]")).toHaveCount(4);

    // Tầng 2 + tầng 3 đều có node trong cây.
    const root = await pickRootSkill();
    const child = await pickChildSkill();

    await expect(tree.locator(`[data-skill-id="${root.id}"]`)).toBeVisible();
    await expect(tree.locator(`[data-skill-id="${child.id}"]`)).toBeVisible();

    // Mỗi node hiện mức level dạng `level/target` + số bằng chứng.
    const rootNode = tree.locator(`[data-skill-id="${root.id}"]`);
    await expect(rootNode).toContainText("bằng chứng");
    await expect(rootNode).toContainText(/\d+\/\d/);

    // KPI đầu trang dùng số liệu thật (task 7.6).
    await expect(page.getByTestId("skills-kpi")).toBeVisible();
  });

  test("đặt trọng tâm → S01 đổi trọng tâm sang node đó", async ({ page }) => {
    const skill = await pickRootSkill();

    await page.goto("/skills");
    await selectNode(page, skill.id);

    await page.getByTestId("set-focus").click();
    await expect(page.getByText("Đã đặt trọng tâm hôm nay").first()).toBeVisible();

    // DB: `FocusTarget` của hôm nay trỏ đúng node vừa chọn.
    await expect
      .poll(async () => {
        const focus = await prisma.focusTarget.findFirst({ where: { date: today() } });
        return focus?.skillId ?? null;
      })
      .toBe(skill.id);

    // Panel hiện badge "Trọng tâm hôm nay" + nút đổi thành "Bỏ trọng tâm".
    await expect(page.getByTestId("skill-detail-panel")).toContainText("Trọng tâm hôm nay");
    await expect(page.getByTestId("set-focus")).toHaveText(/Bỏ trọng tâm hôm nay/);

    // ── S01 phải đổi trọng tâm theo (FR-SK-01) ─────────────────────────
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 2, name: skill.name }),
    ).toBeVisible({ timeout: 15_000 });

    // Badge "Đã đặt thủ công" — phân biệt với trọng tâm tự suy ra.
    await expect(page.getByText("Đã đặt thủ công")).toBeVisible();
  });

  test("trọng tâm là duy nhất 1 node/ngày — đặt node khác ghi đè node cũ", async ({ page }) => {
    const first = await pickRootSkill();
    const second = await prisma.skill.findFirst({
      where: { parentId: null, id: { not: first.id } },
      orderBy: [{ position: "asc" }],
      select: { id: true, name: true },
    });
    if (!second) throw new Error("Cần ít nhất 2 skill gốc.");

    await page.goto("/skills");

    await selectNode(page, first.id);
    await page.getByTestId("set-focus").click();
    await expect
      .poll(async () => {
        const focus = await prisma.focusTarget.findFirst({ where: { date: today() } });
        return focus?.skillId ?? null;
      })
      .toBe(first.id);

    // Đặt node thứ hai → node cũ bị ghi đè, không tồn tại 2 trọng tâm.
    await selectNode(page, second.id);
    await page.getByTestId("set-focus").click();
    await expect
      .poll(async () => {
        const focus = await prisma.focusTarget.findFirst({ where: { date: today() } });
        return focus?.skillId ?? null;
      })
      .toBe(second.id);

    const count = await prisma.focusTarget.count({ where: { date: today() } });
    expect(count).toBe(1);
  });

  test("'Luyện tập đo lường ngay' → +1 Evidence, đúng 1 Activity gắn node", async ({ page }) => {
    const skill = await pickRootSkill();

    const before = await prisma.evidence.count({ where: { skillId: skill.id } });

    await page.goto("/skills");
    await selectNode(page, skill.id);

    await page.getByTestId("practice-now").click();
    await expect(page.getByText("Đã ghi 1 bằng chứng").first()).toBeVisible();

    // DB: đúng **+1** Evidence cho node này.
    await expect
      .poll(async () => prisma.evidence.count({ where: { skillId: skill.id } }), {
        timeout: 15_000,
      })
      .toBe(before + 1);

    // Activity tương ứng tồn tại và gắn đúng 1 Evidence.
    const activity = await prisma.activity.findFirst({
      where: { title: practiceTitle(skill.name), skillId: skill.id },
      orderBy: { createdAt: "desc" },
      include: { evidences: true },
    });
    expect(activity).not.toBeNull();
    expect(activity?.evidences).toHaveLength(1);
    expect(activity?.evidences[0]?.rating).toBe(3);

    // Feed "Bằng Chứng Gần Đây" có dòng mới ở đầu (thời gian giảm dần).
    await page.reload();
    const feed = page.getByTestId("evidence-feed");
    await expect(feed).toBeVisible();
    await expect(feed.locator("li").first()).toContainText(practiceTitle(skill.name));

    // Dọn dẹp — test không để lại rác trong DB.
    await prisma.activity.deleteMany({ where: { title: practiceTitle(skill.name) } });
  });

  test("'Tạo mục kỹ năng con' → node mới lưu đúng tên + mục cha", async ({ page }) => {
    const parent = await pickRootSkill();
    const childName = `E2E mục con ${Date.now()}`;

    await page.goto("/skills");
    await selectNode(page, parent.id);

    await page.getByTestId("toggle-child-form").click();
    await page.getByTestId("child-name").fill(childName);
    await page.getByTestId("create-child").click();

    await expect(page.getByText(`Đã tạo "${childName}"`).first()).toBeVisible();

    // DB: node mới có `parentId` đúng + level khởi tạo bằng 0 (FR-SK-03).
    await expect
      .poll(async () => {
        const created = await prisma.skill.findFirst({ where: { name: childName } });
        return created?.parentId ?? null;
      })
      .toBe(parent.id);

    const created = await prisma.skill.findFirst({ where: { name: childName } });
    expect(created?.level).toBe(0);

    // Node mới hiện trong cây.
    await page.reload();
    await expect(page.locator(`[data-skill-id="${created?.id}"]`)).toBeVisible();

    // Dọn dẹp.
    await prisma.skill.deleteMany({ where: { name: childName } });
  });
});
