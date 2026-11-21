// Builds docs/preview.png: the fixture page with highlighted tables next to the popup.
// Uses the same harness as the smoke test (needs `npm run build:test` first).
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const html = readFileSync(resolve("test/fixtures/page.html"));
const server = createServer((_, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.once("listening", ok));
const port = server.address().port;

const ext = resolve("dist-test");
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "tx-shot-")), {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const id = new URL(worker.url()).host;

const page = await context.newPage();
await page.setViewportSize({ width: 820, height: 620 });
await page.goto(`http://127.0.0.1:${port}/`);
const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);

const popup = await context.newPage();
await popup.setViewportSize({ width: 410, height: 640 });
await popup.goto(`chrome-extension://${id}/popup.html?tabId=${tabId}`);
await popup.locator(".table-item").first().click();
await popup.waitForTimeout(900);

const pageShot = await page.screenshot();
const popupShot = await popup.screenshot();
const shot = await context.newPage();
await shot.setViewportSize({ width: 1280, height: 680 });
await shot.setContent(`<body style="margin:0;background:#e9edf3;display:flex;gap:24px;padding:20px;font:12px system-ui;align-items:flex-start">
<img style="width:820px;border:1px solid #c9ced8;border-radius:8px" src="data:image/png;base64,${pageShot.toString("base64")}">
<img style="width:410px;border:1px solid #c9ced8;border-radius:8px" src="data:image/png;base64,${popupShot.toString("base64")}"></body>`);
mkdirSync("docs", { recursive: true });
writeFileSync("docs/preview.png", await shot.screenshot());
await context.close();
server.close();
console.log("wrote docs/preview.png");
