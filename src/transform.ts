import type { Cell, Merge, Options, RawTable, Sheet } from "./types";

const CURRENCY = /[$€£¥₹]/g;
const US_NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$|^\.\d+$/;
const EU_NUMBER = /^\d{1,3}(?:\.\d{3})+,\d+$/;

/**
 * Parse "$1,234.50", "(1,200)", "-5", "12.5%", "1.234,56" into a number.
 * Returns null for anything else, including ids with leading zeros ("007").
 */
export function parseNumber(raw: string): Cell | null {
  let s = raw.replace(/[\s   ]+/g, " ").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^(USD|EUR|GBP)\s*/i, "").replace(CURRENCY, "").trim();
  const sign = /^[-−–]\s*/.exec(s);
  if (sign) {
    neg = !neg;
    s = s.slice(sign[0].length);
  }
  s = s.replace(CURRENCY, "").trim();
  let pct = false;
  if (s.endsWith("%")) {
    pct = true;
    s = s.slice(0, -1).trim();
  }
  if (EU_NUMBER.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (!US_NUMBER.test(s)) return null;
  s = s.replace(/,/g, "");
  if (/^0\d/.test(s)) return null;
  if (s.replace(/\D/g, "").length > 15) return null;
  let n = Number(s);
  if (!Number.isFinite(n)) return null;
  const decimals = s.includes(".") ? (s.split(".")[1] ?? "").length : 0;
  if (neg) n = -n;
  if (pct) return { v: Number((n / 100).toPrecision(12)), pct: decimals };
  return { v: n };
}

/** Strip footnote markers, collapse whitespace. */
export function cleanHeader(text: string): string {
  return text
    .replace(/\[(?:\d+|[a-z])\]/gi, "")
    .replace(/[\s ]+/g, " ")
    .trim()
    .replace(/\s*[*†‡]+$/, "");
}

/** Join stacked header rows per column: "2024" over "Q1" becomes "2024 / Q1". */
export function buildHeaders(rows: string[][], headerRows: number): string[] {
  const width = rows[0]?.length ?? 0;
  const seen = new Map<string, number>();
  const out: string[] = [];
  for (let c = 0; c < width; c++) {
    const parts: string[] = [];
    for (let r = 0; r < headerRows; r++) {
      const part = cleanHeader(rows[r]?.[c] ?? "");
      if (part && parts[parts.length - 1] !== part) parts.push(part);
    }
    let name = parts.join(" / ") || `Column ${c + 1}`;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    if (n > 1) name = `${name}_${n}`;
    out.push(name);
  }
  return out;
}

/** With no <th>, treat row 0 as the header when it is all text and later rows have numbers. */
export function effectiveHeaderRows(raw: RawTable): number {
  if (raw.headerRows > 0 || raw.rows.length < 2) return raw.headerRows;
  const first = raw.rows[0] ?? [];
  const firstIsText = first.every((t) => t !== "" && parseNumber(t) === null);
  const laterHasNumber = raw.rows.slice(1).some((row) => row.some((t) => parseNumber(t) !== null));
  return firstIsText && laterHasNumber ? 1 : 0;
}

/** Spreadsheets run text starting with = + - @ as formulas; a leading apostrophe stops that. */
export function neutralize(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function buildSheet(raw: RawTable, opts: Options): Sheet {
  const headerRows = effectiveHeaderRows(raw);
  const blanked = new Set<string>();
  if (!opts.fillMerged) {
    for (const m of raw.merges) {
      for (let dr = 0; dr < m.rowspan; dr++) {
        for (let dc = 0; dc < m.colspan; dc++) {
          if (dr || dc) blanked.add(`${m.r + dr},${m.c + dc}`);
        }
      }
    }
  }
  const header: Cell[] = buildHeaders(raw.rows, headerRows).map((v) => ({ v }));
  const body: Cell[][] = raw.rows.slice(headerRows).map((row, i) =>
    row.map((text, c): Cell => {
      if (blanked.has(`${i + headerRows},${c}`)) return { v: "" };
      return (opts.cleanNumbers ? parseNumber(text) : null) ?? { v: text };
    }),
  );
  const merges: Merge[] = [];
  if (!opts.fillMerged) {
    for (const m of raw.merges) {
      if (m.r < headerRows) continue;
      merges.push({ ...m, r: m.r - headerRows + 1 });
    }
  }
  return { rows: [header, ...body], merges };
}

/** Text form of a cell for CSV/TSV. Percentages stay as "12.5%" so spreadsheets re-read them. */
export function cellToText(cell: Cell, opts: Pick<Options, "neutralizeFormulas">): string {
  if (typeof cell.v === "number") {
    return cell.pct === undefined ? String(cell.v) : `${Number((cell.v * 100).toFixed(cell.pct))}%`;
  }
  return opts.neutralizeFormulas ? neutralize(cell.v) : cell.v;
}
