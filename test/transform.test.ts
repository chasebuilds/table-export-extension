import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { toCSV, toTSV, toXLSX } from "../src/format";
import { parseTable } from "../src/parse";
import { buildHeaders, buildSheet, cleanHeader, effectiveHeaderRows, neutralize, parseNumber } from "../src/transform";
import type { Options, RawTable } from "../src/types";

const defaults: Options = { cleanNumbers: true, fillMerged: true, neutralizeFormulas: true };

function fixture(id: string): RawTable {
  const html = readFileSync(resolve(process.cwd(), "test/fixtures/page.html"), "utf8");
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";
  return parseTable(document.getElementById(id) as HTMLTableElement);
}

describe("parseNumber", () => {
  it.each([
    ["$1,200.50", 1200.5],
    ["€ 3,000", 3000],
    ["USD 15", 15],
    ["($45.25)", -45.25],
    ["-3.2", -3.2],
    ["−7", -7],
    ["$-5", -5],
    ["1,234,567", 1234567],
    ["1.234,56", 1234.56],
    [".5", 0.5],
    ["42", 42],
  ])("reads %s as %d", (text, value) => {
    expect(parseNumber(text)).toEqual({ v: value });
  });

  it("reads percentages as fractions and remembers the decimals", () => {
    expect(parseNumber("12.5%")).toEqual({ v: 0.125, pct: 1 });
    expect(parseNumber("(3%)")).toEqual({ v: -0.03, pct: 0 });
    expect(parseNumber("0.1%")).toEqual({ v: 0.001, pct: 1 });
  });

  it.each(["", "abc", "007", "0123", "12-34", "1,23", "1.2.3", "12345678901234567", "N/A", "10 items", String.fromCharCode(0x2014)])(
    "leaves %j as text",
    (text) => {
      expect(parseNumber(text)).toBeNull();
    },
  );
});

describe("headers", () => {
  it("joins stacked headers and collapses repeated spans", () => {
    const raw = fixture("sales");
    expect(buildHeaders(raw.rows, raw.headerRows)).toEqual(["Region", "2024 / Q1", "2024 / Q2", "Growth"]);
  });

  it("cleans footnote markers, symbols and whitespace", () => {
    expect(cleanHeader("  Price [1]  (USD)* ")).toBe("Price (USD)");
  });

  it("names empty headers and de-duplicates repeats", () => {
    expect(buildHeaders([["", "Total", "Total", ""]], 1)).toEqual(["Column 1", "Total", "Total_2", "Column 4"]);
  });

  it("promotes a text first row to header only when numbers follow", () => {
    const withNumbers: RawTable = { rows: [["Item", "Cost"], ["Pen", "$2"]], merges: [], headerRows: 0, caption: "" };
    const allText: RawTable = { rows: [["a", "b"], ["c", "d"]], merges: [], headerRows: 0, caption: "" };
    expect(effectiveHeaderRows(withNumbers)).toBe(1);
    expect(effectiveHeaderRows(allText)).toBe(0);
  });
});

describe("buildSheet", () => {
  it("cleans currency and percent, keeps ids and text", () => {
    const sheet = buildSheet(fixture("sales"), defaults);
    expect(sheet.rows[0]?.map((c) => c.v)).toEqual(["Region", "2024 / Q1", "2024 / Q2", "Growth"]);
    expect(sheet.rows[1]).toEqual([{ v: "North" }, { v: 1200.5 }, { v: 1350 }, { v: 0.125, pct: 1 }]);
    expect(sheet.rows[2]).toEqual([{ v: "North" }, { v: 980 }, { v: -45.25 }, { v: -0.032, pct: 1 }]);
    const staff = buildSheet(fixture("staff"), defaults);
    expect(staff.rows[1]?.map((c) => c.v)).toEqual(["Ada Lovelace", "007", "Starts May 1"]);
  });

  it("leaves numbers as text when cleaning is off", () => {
    const sheet = buildSheet(fixture("sales"), { ...defaults, cleanNumbers: false });
    expect(sheet.rows[1]?.[1]).toEqual({ v: "$1,200.50" });
  });

  it("repeats merged values by default", () => {
    const sheet = buildSheet(fixture("sales"), defaults);
    expect(sheet.rows[2]?.[0]).toEqual({ v: "North" });
    expect(sheet.merges).toEqual([]);
  });

  it("blanks non-anchor merged cells and reports merges when fill is off", () => {
    const sheet = buildSheet(fixture("sales"), { ...defaults, fillMerged: false });
    expect(sheet.rows[1]?.[0]).toEqual({ v: "North" });
    expect(sheet.rows[2]?.[0]).toEqual({ v: "" });
    // header merges are dropped (the header collapses to one row); body merges shift up by one header row
    expect(sheet.merges).toContainEqual({ r: 1, c: 0, rowspan: 2, colspan: 1 });
    expect(sheet.merges.every((m) => m.r >= 1)).toBe(true);
  });
});

describe("text output", () => {
  const sheet = () => buildSheet(fixture("sales"), defaults);

  it("writes RFC 4180 CSV with CRLF and quoting", () => {
    const csv = toCSV(sheet(), defaults);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Region,2024 / Q1,2024 / Q2,Growth");
    expect(lines[1]).toBe("North,1200.5,1350,12.5%");
    expect(lines[2]).toBe("North,980,-45.25,-3.2%");
    expect(csv.endsWith("\r\n")).toBe(true);
    const staff = toCSV(buildSheet(fixture("staff"), defaults), defaults).split("\r\n");
    expect(staff[2]).toBe('Grace Hopper,0123,"Team lead, ""acting"""');
  });

  it("neutralizes formula-looking text, and can be turned off", () => {
    expect(toCSV(sheet(), defaults)).toContain("'=HYPERLINK");
    expect(toCSV(sheet(), { neutralizeFormulas: false })).not.toContain("'=HYPERLINK");
    expect(neutralize("+1 555")).toBe("'+1 555");
    expect(neutralize("fine")).toBe("fine");
  });

  it("writes TSV with one tab per column and no tabs or newlines inside cells", () => {
    const raw: RawTable = { rows: [["a", "b"], ["x\ty", "line1\nline2"]], merges: [], headerRows: 1, caption: "" };
    expect(toTSV(buildSheet(raw, defaults), defaults)).toBe("a\tb\nx y\tline1 line2");
  });
});

describe("xlsx output", () => {
  it("round-trips numbers, percent format and merges", () => {
    const bytes = toXLSX(buildSheet(fixture("sales"), { ...defaults, fillMerged: false }));
    const ws = XLSX.read(bytes, { type: "array", cellStyles: true }).Sheets["Table"] as XLSX.WorkSheet;
    expect(ws["A1"]?.v).toBe("Region");
    expect(ws["B2"]?.v).toBe(1200.5);
    expect(ws["B2"]?.t).toBe("n");
    expect(ws["D2"]?.v).toBeCloseTo(0.125);
    expect(ws["D2"]?.z).toBe("0.0%");
    expect(ws["A3"]?.v ?? "").toBe("");
    expect(ws["!merges"]).toContainEqual({ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } });
  });

  it("stores formula-looking text as a string, not a formula", () => {
    const bytes = toXLSX(buildSheet(fixture("sales"), defaults));
    const ws = XLSX.read(bytes, { type: "array" }).Sheets["Table"] as XLSX.WorkSheet;
    expect(ws["A5"]?.t).toBe("s");
    expect(ws["A5"]?.f).toBeUndefined();
  });
});
