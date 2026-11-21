import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { start, type Harness } from "./harness";

let h: Harness;

test.beforeAll(async () => {
  h = await start();
});
test.afterAll(async () => {
  await h.close();
});

/** Playwright stores finished downloads under a GUID name, so find the file by MIME type. */
async function waitForDownload(mime: string): Promise<string> {
  let file = "";
  await expect
    .poll(async () => {
      const items = await h.worker.evaluate(
        () => new Promise<chrome.downloads.DownloadItem[]>((ok) => chrome.downloads.search({ orderBy: ["-startTime"] }, ok)),
      );
      file = items.find((i) => i.mime === mime && i.state === "complete")?.filename ?? "";
      return file !== "";
    })
    .toBe(true);
  return file;
}

test("lists only the data tables and highlights them on the page", async () => {
  await expect(h.popup.locator(".table-item")).toHaveCount(2);
  await expect(h.popup.locator(".table-item").first()).toContainText("Quarterly sales by region");
  const outline = await h.fixture.locator("#sales").evaluate((el) => (el as HTMLElement).style.outline);
  expect(outline).toContain("solid");
  expect(await h.fixture.locator("#layout").evaluate((el) => (el as HTMLElement).style.outline)).toBe("");
});

test("selecting a table shows a cleaned preview and a stronger highlight", async () => {
  await h.popup.locator(".table-item").first().click();
  await expect(h.popup.locator("#preview th").nth(1)).toHaveText("2024 / Q1");
  await expect(h.popup.locator("#preview tr").nth(1).locator("td").nth(1)).toHaveText("1200.5");
  const width = await h.fixture.locator("#sales").evaluate((el) => (el as HTMLElement).style.outlineWidth);
  expect(width).toBe("4px");
});

test("downloads a CSV with clean headers and numbers", async () => {
  await h.popup.locator(".table-item").first().click();
  await h.popup.locator("#btn-csv").click();
  await expect(h.popup.locator("#status")).toContainText("Saved");
  const file = await waitForDownload("text/csv");
  const csv = readFileSync(file, "utf8");
  expect(csv).toContain("Region,2024 / Q1,2024 / Q2,Growth\r\n");
  expect(csv).toContain("North,1200.5,1350,12.5%");
});

test("downloads an XLSX that opens with numeric cells", async () => {
  await h.popup.locator(".table-item").first().click();
  await h.popup.locator("#btn-xlsx").click();
  const file = await waitForDownload("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const ws = XLSX.read(readFileSync(file), { type: "buffer" }).Sheets["Table"] as XLSX.WorkSheet;
  expect(ws["B2"]?.v).toBe(1200.5);
  expect(ws["B2"]?.t).toBe("n");
});

test("copy for Excel puts TSV on the clipboard", async () => {
  await h.popup.evaluate(() => {
    const w = window as unknown as { copied?: string };
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (t: string) => ((w.copied = t), Promise.resolve()) } });
  });
  await h.popup.locator(".table-item").nth(1).click();
  await h.popup.locator("#btn-copy").click();
  await expect(h.popup.locator("#status")).toContainText("Copied");
  const text = (await h.popup.evaluate(() => (window as unknown as { copied?: string }).copied)) ?? "";
  expect(text.split("\n")[0]).toBe("Name\tEmployee ID\tNotes");
  expect(text.split("\n")[1]).toBe("Ada Lovelace\t007\tStarts May 1");
});
