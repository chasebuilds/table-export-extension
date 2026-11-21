import { isDataTable, parseTable } from "./parse";
import type { RawTable, TableSummary } from "./types";

/** Injected on demand by the popup (activeTab + scripting). Nothing here talks to the network. */
interface TableExportApi {
  list(): TableSummary[];
  mark(selected: number | null): void;
  get(index: number): RawTable | null;
  clear(): void;
}

declare global {
  interface Window {
    __tableExport?: TableExportApi;
  }
}

let tables: HTMLTableElement[] = [];

function outline(el: HTMLElement, width: number, color: string): void {
  el.style.setProperty("outline", `${width}px solid ${color}`, "important");
  el.style.setProperty("outline-offset", "3px", "important");
}

function clear(): void {
  for (const t of tables) {
    t.style.removeProperty("outline");
    t.style.removeProperty("outline-offset");
  }
}

/** The popup cannot reliably clean up when it closes, so any click or key on the page does it. */
function dismissOnInteraction(): void {
  const stop = (): void => {
    clear();
    document.removeEventListener("pointerdown", stop, true);
    document.removeEventListener("keydown", stop, true);
  };
  document.addEventListener("pointerdown", stop, true);
  document.addEventListener("keydown", stop, true);
}

function list(): TableSummary[] {
  clear();
  tables = Array.from(document.querySelectorAll("table")).filter(isDataTable);
  const out = tables.map((t, index): TableSummary => {
    const raw = parseTable(t);
    const head = (raw.rows[Math.max(0, raw.headerRows - 1)] ?? []).filter(Boolean).slice(0, 4).join(", ");
    return { index, rows: raw.rows.length, cols: raw.rows[0]?.length ?? 0, caption: raw.caption, headerPreview: head };
  });
  for (const t of tables) outline(t, 2, "#3b82f6");
  dismissOnInteraction();
  return out;
}

function mark(selected: number | null): void {
  tables.forEach((t, i) => {
    if (i === selected) {
      outline(t, 4, "#f97316");
      t.scrollIntoView({ block: "center", behavior: "smooth" });
    } else outline(t, 2, "#3b82f6");
  });
}

function get(index: number): RawTable | null {
  const t = tables[index];
  return t ? parseTable(t) : null;
}

window.__tableExport = { list, mark, get, clear };
