import { toCSV, toTSV, toXLSX } from "./format";
import { buildSheet, cellToText } from "./transform";
import type { Options, RawTable, Sheet, TableSummary } from "./types";

interface PageApi {
  list(): TableSummary[];
  mark(selected: number | null): void;
  get(index: number): RawTable | null;
  clear(): void;
}
type PageWindow = Window & { __tableExport: PageApi };

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

let tabId = 0;
let pageTitle = "table";
let selected: number | null = null;
let raw: RawTable | null = null;

function setStatus(text: string, kind: "ok" | "error" | "" = ""): void {
  const el = $("status");
  el.textContent = text;
  el.dataset["kind"] = kind;
}

async function resolveTab(): Promise<chrome.tabs.Tab> {
  // ?tabId=N lets the smoke test point the popup page at a fixture tab.
  const forced = Number(new URLSearchParams(location.search).get("tabId"));
  if (forced) return chrome.tabs.get(forced);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  return tab;
}

async function callPage<T>(fn: (arg: number | null) => T, arg: number | null = null): Promise<T> {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: fn, args: [arg] });
  return res?.result as T;
}

const readOptions = (): Options => ({
  cleanNumbers: $<HTMLInputElement>("opt-numbers").checked,
  fillMerged: $<HTMLInputElement>("opt-fill").checked,
  neutralizeFormulas: $<HTMLInputElement>("opt-formulas").checked,
});

function currentSheet(): Sheet | null {
  return raw ? buildSheet(raw, readOptions()) : null;
}

function renderPreview(): void {
  const body = $("preview");
  body.replaceChildren();
  const sheet = currentSheet();
  if (!sheet) return;
  sheet.rows.slice(0, 6).forEach((row, i) => {
    const tr = document.createElement("tr");
    for (const cell of row.slice(0, 6)) {
      const td = document.createElement(i === 0 ? "th" : "td");
      td.textContent = cellToText(cell, readOptions());
      if (typeof cell.v === "number") td.className = "num";
      tr.append(td);
    }
    body.append(tr);
  });
  const total = sheet.rows.length - 1;
  $("preview-note").textContent = `${total} data row${total === 1 ? "" : "s"}, ${sheet.rows[0]?.length ?? 0} columns`;
}

async function select(index: number): Promise<void> {
  selected = index;
  document.querySelectorAll<HTMLElement>(".table-item").forEach((el, i) => el.classList.toggle("on", i === index));
  await callPage((i) => (window as unknown as PageWindow).__tableExport.mark(i), index);
  raw = await callPage((i) => (window as unknown as PageWindow).__tableExport.get(i as number), index);
  renderPreview();
  for (const b of document.querySelectorAll<HTMLButtonElement>("button.action")) b.disabled = raw === null;
}

function fileBase(): string {
  const caption = selected !== null ? document.querySelectorAll(".table-item")[selected]?.getAttribute("data-caption") : "";
  const base = (caption || pageTitle || "table").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return `${base || "table"}-${(selected ?? 0) + 1}`;
}

async function download(blob: Blob, name: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename: name, saveAs: false });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  setStatus(`Saved ${name} to your downloads folder.`, "ok");
}

async function onCsv(): Promise<void> {
  const sheet = currentSheet();
  if (!sheet) return;
  const bom = "﻿"; // lets Excel read UTF-8
  await download(new Blob([bom + toCSV(sheet, readOptions())], { type: "text/csv;charset=utf-8" }), `${fileBase()}.csv`);
}

async function onXlsx(): Promise<void> {
  const sheet = currentSheet();
  if (!sheet) return;
  const bytes = toXLSX(sheet, "Table");
  await download(
    new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileBase()}.xlsx`,
  );
}

async function onCopy(): Promise<void> {
  const sheet = currentSheet();
  if (!sheet) return;
  await navigator.clipboard.writeText(toTSV(sheet, readOptions()));
  setStatus("Copied. Paste into Excel or Sheets.", "ok");
}

function renderList(items: TableSummary[]): void {
  const list = $("tables");
  list.replaceChildren();
  items.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = "table-item";
    li.tabIndex = 0;
    li.dataset["caption"] = t.caption;
    const title = document.createElement("strong");
    title.textContent = t.caption || `Table ${i + 1}`;
    const meta = document.createElement("span");
    meta.textContent = `${t.rows} rows, ${t.cols} cols`;
    const head = document.createElement("small");
    head.textContent = t.headerPreview;
    li.append(title, meta, head);
    li.addEventListener("click", () => void run(select(i)));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void run(select(i));
      }
    });
    list.append(li);
  });
}

async function run(p: Promise<void>): Promise<void> {
  try {
    await p;
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  }
}

async function init(): Promise<void> {
  const tab = await resolveTab();
  tabId = tab.id as number;
  pageTitle = tab.title ?? "table";
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  const items = await callPage(() => (window as unknown as PageWindow).__tableExport.list());
  if (!items || items.length === 0) {
    $("empty").hidden = false;
    $("main").hidden = true;
    return;
  }
  renderList(items);
  setStatus(`${items.length} table${items.length === 1 ? "" : "s"} found. Pick one.`);
  if (items.length === 1) await select(0);
}

$("btn-csv").addEventListener("click", () => void run(onCsv()));
$("btn-xlsx").addEventListener("click", () => void run(onXlsx()));
$("btn-copy").addEventListener("click", () => void run(onCopy()));
for (const id of ["opt-numbers", "opt-fill", "opt-formulas"]) $(id).addEventListener("change", renderPreview);
addEventListener("pagehide", () => void callPage(() => (window as unknown as PageWindow).__tableExport.clear()).catch(() => undefined));

void run(init().catch((err: unknown) => {
  $("empty").hidden = false;
  $("main").hidden = true;
  $("empty-text").textContent =
    "This page does not allow extensions to read it (browser pages, the web store, and some PDFs are blocked).";
  console.error(err);
}));
