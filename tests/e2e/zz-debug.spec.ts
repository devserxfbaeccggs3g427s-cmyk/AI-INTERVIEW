import { expect, test } from "@playwright/test";

test("debug shell", async ({ page }) => {
  const res = await page.goto("/", { waitUntil: "domcontentloaded" });
  console.log("STATUS", res?.status(), "URL", page.url());
  const html = await page.content();
  console.log("HTMLLEN", html.length, "hasAside", html.includes("<aside"), "hasNav", html.includes("<nav"));
  console.log("COUNT aside nav a =", await page.locator("aside nav a").count());
  console.log("COUNT aside =", await page.locator("aside").count());
  console.log("COUNT nav =", await page.locator("nav").count());
  console.log("COUNT a =", await page.locator("a").count());
  const asideHtml = await page.locator("aside").first().evaluate((el) => el.outerHTML.slice(0, 600)).catch((e) => "ERR:" + e.message);
  console.log("ASIDE_HTML", asideHtml);
  await page.waitForTimeout(2000);
  console.log("AFTER WAIT COUNT aside nav a =", await page.locator("aside nav a").count());
  expect(true).toBe(true);
});
