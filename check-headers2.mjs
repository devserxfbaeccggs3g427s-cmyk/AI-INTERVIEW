import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:3100/test/demo-test", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3000);
const html = await p.content();
// Find all <header> elements
const headers = html.split('<header').slice(1).map(h => '<header' + h.substring(0, h.indexOf('>') + 1));
console.log("=== HEADERS ===");
headers.forEach((h, i) => console.log(i, h));
await b.close();
