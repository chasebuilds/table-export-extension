import * as XLSX from "xlsx";
import { cellToText } from "./transform";
import type { Options, Sheet } from "./types";

function csvField(text: string): string {
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with CRLF line ends. */
export function toCSV(sheet: Sheet, opts: Pick<Options, "neutralizeFormulas">): string {
  return sheet.rows.map((row) => row.map((c) => csvField(cellToText(c, opts))).join(",")).join("\r\n") + "\r\n";
}

/** Tab-separated text for pasting into Excel or Sheets. Tabs and newlines inside cells become spaces. */
export function toTSV(sheet: Sheet, opts: Pick<Options, "neutralizeFormulas">): string {
  return sheet.rows
    .map((row) => row.map((c) => cellToText(c, opts).replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}

export function toXLSX(sheet: Sheet, sheetName = "Table"): Uint8Array {
  const aoa = sheet.rows.map((row) =>
    row.map((c) =>
      typeof c.v === "number"
        ? {
            t: "n" as const,
            v: c.v,
            ...(c.pct === undefined ? {} : { z: c.pct > 0 ? `0.${"0".repeat(c.pct)}%` : "0%" }),
          }
        : { t: "s" as const, v: c.v },
    ),
  );
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (sheet.merges.length > 0) {
    ws["!merges"] = sheet.merges.map((m) => ({
      s: { r: m.r, c: m.c },
      e: { r: m.r + m.rowspan - 1, c: m.c + m.colspan - 1 },
    }));
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Table");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
