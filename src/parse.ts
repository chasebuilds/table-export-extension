import type { Merge, RawTable } from "./types";

const MAX_COLSPAN = 1000;

/** Visible text of a cell: <br> becomes a space, footnote refs and scripts are dropped. */
export function cellText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  for (const junk of clone.querySelectorAll("script, style, sup.reference")) junk.remove();
  for (const br of clone.querySelectorAll("br")) br.replaceWith(" ");
  return (clone.textContent ?? "").replace(/[\s ]+/g, " ").trim();
}

/** Expand rowspan/colspan into a rectangular grid and report which cells were merged. */
export function parseTable(table: HTMLTableElement): RawTable {
  const trs = Array.from(table.rows);
  const grid: string[][] = trs.map(() => []);
  const taken: boolean[][] = trs.map(() => []);
  const merges: Merge[] = [];

  trs.forEach((tr, r) => {
    let c = 0;
    for (const cell of Array.from(tr.cells)) {
      while (taken[r]?.[c]) c++;
      const colspan = Math.min(Math.max(cell.colSpan || 1, 1), MAX_COLSPAN);
      // rowspan=0 means "to the end of the row group"; approximated as the end of the table.
      const rawRowspan = cell.rowSpan === 0 ? trs.length - r : cell.rowSpan;
      const rowspan = Math.min(Math.max(rawRowspan || 1, 1), trs.length - r);
      const text = cellText(cell);
      for (let dr = 0; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) {
          (grid[r + dr] as string[])[c + dc] = text;
          (taken[r + dr] as boolean[])[c + dc] = true;
        }
      }
      if (rowspan > 1 || colspan > 1) merges.push({ r, c, rowspan, colspan });
      c += colspan;
    }
  });

  const width = Math.max(0, ...grid.map((row) => row.length));
  const rows = grid.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ""));

  return {
    rows,
    merges,
    headerRows: countHeaderRows(table, trs),
    caption: table.caption ? cellText(table.caption) : "",
  };
}

function countHeaderRows(table: HTMLTableElement, trs: HTMLTableRowElement[]): number {
  const thead = table.tHead;
  if (thead && thead.rows.length > 0) return thead.rows.length;
  let n = 0;
  for (const tr of trs) {
    const cells = Array.from(tr.cells);
    if (cells.length > 0 && cells.every((c) => c.tagName === "TH")) n++;
    else break;
  }
  // A table made only of <th> rows has no body to head.
  return n >= trs.length ? Math.min(1, trs.length) : n;
}

/** Tables worth offering: real data (at least 2 rows and 2 columns) and not hidden. */
export function isDataTable(table: HTMLTableElement): boolean {
  if (table.rows.length < 2) return false;
  const widest = Math.max(...Array.from(table.rows).map((r) => r.cells.length));
  if (widest < 2) return false;
  const style = table.ownerDocument.defaultView?.getComputedStyle(table);
  return style?.display !== "none" && style?.visibility !== "hidden";
}
