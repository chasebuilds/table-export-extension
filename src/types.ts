/** A merged region in the source table (row/col are 0-based, spans >= 1). */
export interface Merge {
  r: number;
  c: number;
  rowspan: number;
  colspan: number;
}

/** What the page-side script returns for one table. Spans are already filled in. */
export interface RawTable {
  rows: string[][];
  merges: Merge[];
  /** Number of leading rows that are headers (from <thead> or all-<th> rows). */
  headerRows: number;
  caption: string;
}

export interface TableSummary {
  index: number;
  rows: number;
  cols: number;
  caption: string;
  headerPreview: string;
}

export interface Options {
  cleanNumbers: boolean;
  fillMerged: boolean;
  neutralizeFormulas: boolean;
}

/** An output cell. `pct` is the number of decimals when the source text was a percentage. */
export interface Cell {
  v: string | number;
  pct?: number;
}

export interface Sheet {
  rows: Cell[][];
  /** Merges in output coordinates, only filled when fillMerged is false. */
  merges: Merge[];
}
