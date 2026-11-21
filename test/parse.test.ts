import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { isDataTable, parseTable } from "../src/parse";

const html = readFileSync(resolve(process.cwd(), "test/fixtures/page.html"), "utf8");
const table = (id: string): HTMLTableElement => document.getElementById(id) as HTMLTableElement;

function setBody(markup: string): HTMLTableElement {
  document.body.innerHTML = markup;
  return document.querySelector("table") as HTMLTableElement;
}

describe("parseTable on the fixture page", () => {
  beforeEach(() => {
    document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";
  });

  it("expands rowspan and colspan into a rectangular grid", () => {
    const raw = parseTable(table("sales"));
    expect(raw.rows).toEqual([
      ["Region", "2024", "2024", "Growth[1]"],
      ["Region", "Q1", "Q2", "Growth[1]"],
      ["North", "$1,200.50", "$1,350.00", "12.5%"],
      ["North", "$980", "($45.25)", "-3.2%"],
      ["South", "$2,010", "$2,400.75", "19.4%"],
      ['=HYPERLINK("http://example.test","click")', '=HYPERLINK("http://example.test","click")', '=HYPERLINK("http://example.test","click")', '=HYPERLINK("http://example.test","click")'],
    ]);
  });

  it("reports merged regions with their anchor cell", () => {
    const { merges } = parseTable(table("sales"));
    expect(merges).toContainEqual({ r: 0, c: 0, rowspan: 2, colspan: 1 });
    expect(merges).toContainEqual({ r: 0, c: 1, rowspan: 1, colspan: 2 });
    expect(merges).toContainEqual({ r: 2, c: 0, rowspan: 2, colspan: 1 });
    expect(merges).toContainEqual({ r: 5, c: 0, rowspan: 1, colspan: 4 });
  });

  it("counts thead rows as header rows and caption text", () => {
    const raw = parseTable(table("sales"));
    expect(raw.headerRows).toBe(2);
    expect(raw.caption).toBe("Quarterly sales by region");
  });

  it("detects a leading all-th row as the header when there is no thead", () => {
    expect(parseTable(table("staff")).headerRows).toBe(1);
  });

  it("turns <br> into a space and keeps inline text", () => {
    expect(parseTable(table("staff")).rows[1]?.[2]).toBe("Starts May 1");
  });

  it("offers data tables only: not layout tables, not hidden ones", () => {
    const ids = Array.from(document.querySelectorAll("table"))
      .filter(isDataTable)
      .map((t) => t.id);
    expect(ids).toEqual(["sales", "staff"]);
  });
});

describe("parseTable edge cases", () => {
  it("pads short rows to the widest row", () => {
    const raw = parseTable(setBody("<table><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td></tr></table>"));
    expect(raw.rows).toEqual([["a", "b", "c"], ["d", "", ""]]);
  });

  it("lets a rowspan cell push later cells in the next row to the right", () => {
    const raw = parseTable(
      setBody("<table><tr><td rowspan='2'>x</td><td>1</td></tr><tr><td>2</td></tr></table>"),
    );
    expect(raw.rows).toEqual([["x", "1"], ["x", "2"]]);
  });

  it("treats rowspan=0 as running to the end of the table", () => {
    const raw = parseTable(
      setBody("<table><tr><td rowspan='0'>x</td><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></table>"),
    );
    expect(raw.rows.map((r) => r[0])).toEqual(["x", "x", "x"]);
  });

  it("clamps a rowspan that runs past the last row", () => {
    const raw = parseTable(setBody("<table><tr><td rowspan='9'>x</td><td>1</td></tr><tr><td>2</td></tr></table>"));
    expect(raw.rows).toEqual([["x", "1"], ["x", "2"]]);
    expect(raw.merges).toEqual([{ r: 0, c: 0, rowspan: 2, colspan: 1 }]);
  });

  it("drops footnote reference superscripts but keeps other sup text", () => {
    const raw = parseTable(
      setBody("<table><tr><td>Pop<sup class='reference'>[3]</sup></td><td>10<sup>3</sup></td></tr><tr><td>a</td><td>b</td></tr></table>"),
    );
    expect(raw.rows[0]).toEqual(["Pop", "103"]);
  });

  it("does not pull a nested table's rows into the outer table", () => {
    const raw = parseTable(
      setBody(
        "<table><tr><td>outer</td><td><table><tr><td>in1</td><td>in2</td></tr></table></td></tr><tr><td>b</td><td>c</td></tr></table>",
      ),
    );
    expect(raw.rows).toHaveLength(2);
    expect(raw.rows[1]).toEqual(["b", "c"]);
  });

  it("does not treat a table of only th rows as all header", () => {
    expect(parseTable(setBody("<table><tr><th>a</th><th>b</th></tr><tr><th>c</th><th>d</th></tr></table>")).headerRows).toBe(1);
  });
});
