// Demo page script: the extension's own parse, transform and format modules, run on this page's
// tables. The extension does the same thing, split between a page script and its popup.
import { toCSV, toTSV, toXLSX } from "../../src/format";
import { isDataTable, parseTable } from "../../src/parse";
import { buildSheet, cellToText } from "../../src/transform";
import type { Options, RawTable } from "../../src/types";

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};
const checkbox = (id: string) => byId(id) as HTMLInputElement;

const tables = [...document.querySelectorAll<HTMLTableElement>("#samples table")].filter(isDataTable);
let selected = 0;

const readOptions = (): Options => ({
  cleanNumbers: checkbox("opt-numbers").checked,
  fillMerged: checkbox("opt-fill").checked,
  neutralizeFormulas: checkbox("opt-formulas").checked,
});

function current(): { raw: RawTable; name: string } {
  const table = tables[selected];
  if (!table) throw new Error("no table");
  const raw = parseTable(table);
  return { raw, name: (raw.caption || `table-${selected + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "-") };
}

function setStatus(text: string, kind: "ok" | "error" | "" = ""): void {
  const el = byId("status");
  el.textContent = text;
  el.dataset["kind"] = kind;
}

function render(): void {
  tables.forEach((t, i) => {
    t.classList.add("found");
    t.classList.toggle("picked", i === selected);
  });
  const sheet = buildSheet(current().raw, readOptions());
  const body = byId("preview");
  body.replaceChildren();
  sheet.rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement(i === 0 ? "th" : "td");
      td.textContent = cellToText(cell, readOptions());
      if (typeof cell.v === "number") td.className = "num";
      tr.appendChild(td);
    }
    body.appendChild(tr);
  });
  byId("tsv-out").textContent = toTSV(sheet, readOptions());
}

function save(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
  }, 1000);
  setStatus(`Saved ${name}.`, "ok");
}

const list = byId("tables");
tables.forEach((t, i) => {
  const raw = parseTable(t);
  const b = document.createElement("button");
  b.className = "tab";
  b.textContent = `${raw.caption || `Table ${i + 1}`} (${raw.rows.length} x ${raw.rows[0]?.length ?? 0})`;
  b.onclick = () => {
    selected = i;
    [...list.children].forEach((c, j) => c.classList.toggle("on", j === i));
    t.scrollIntoView({ behavior: "smooth", block: "center" });
    render();
  };
  list.appendChild(b);
});
list.firstElementChild?.classList.add("on");
for (const id of ["opt-numbers", "opt-fill", "opt-formulas"]) checkbox(id).onchange = render;

byId("csv").onclick = () => {
  const { raw, name } = current();
  save(new Blob(["﻿" + toCSV(buildSheet(raw, readOptions()), readOptions())], { type: "text/csv;charset=utf-8" }), `${name}.csv`);
};
byId("xlsx").onclick = () => {
  const { raw, name } = current();
  const bytes = toXLSX(buildSheet(raw, readOptions()), raw.caption || "Table");
  save(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${name}.xlsx`);
};
byId("tsv").onclick = async () => {
  try {
    await navigator.clipboard.writeText(toTSV(buildSheet(current().raw, readOptions()), readOptions()));
    setStatus("Copied as tab-separated text. Paste it into Excel or Google Sheets.", "ok");
  } catch {
    setStatus("The browser blocked clipboard access. The text is shown below to copy by hand.", "error");
  }
};
byId("found").textContent = `${tables.length} data tables found on this page (the layout table and the hidden one are skipped).`;
render();
document.body.dataset["ready"] = "1";
