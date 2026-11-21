import { chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface Harness {
  context: BrowserContext;
  server: Server;
  worker: Worker;
  extensionId: string;
  fixture: Page;
  popup: Page;
  downloads: string;
  close(): Promise<void>;
}

/**
 * Loads the unpacked test build (dist-test) in Chromium and serves the fixture page on 127.0.0.1.
 * The popup is opened as a normal tab with ?tabId=<fixture tab>, because a script cannot click
 * the toolbar button that grants activeTab. The test build adds http://127.0.0.1 host access
 * for exactly that reason; the release build has no host permissions.
 */
export async function start(): Promise<Harness> {
  const html = readFileSync(resolve("test/fixtures/page.html"));
  const server = createServer((_, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  const extPath = resolve("dist-test");
  const downloads = mkdtempSync(join(tmpdir(), "tx-dl-"));
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "tx-profile-")), {
    channel: "chromium",
    headless: true,
    acceptDownloads: true,
    downloadsPath: downloads,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });

  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;

  const fixture = await context.newPage();
  await fixture.goto(`http://127.0.0.1:${port}/`);
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "http://127.0.0.1/*" });
    return tabs[0]?.id ?? 0;
  });

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 640 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);

  return {
    context,
    server,
    worker,
    extensionId,
    fixture,
    popup,
    downloads,
    async close() {
      await context.close();
      server.close();
    },
  };
}
