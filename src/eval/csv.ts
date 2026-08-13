export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * RFC4180 のストリームパーサ。
 * 引用値の中のカンマ・CRLF・二重引用符を正しく扱う。
 * チャンク境界が引用値の途中や CR と LF の間に落ちても壊れない。
 */
export class CsvParser {
  private cells: string[] = [];
  private cell = "";
  private inQuotes = false;
  /** 直前が引用値の中の " で、次が " ならエスケープ、そうでなければ引用終わり。 */
  private quotePending = false;
  /** 直前が引用外の CR。次が LF なら改行1つとして扱う。 */
  private crPending = false;
  private started = false;

  push(chunk: string): string[][] {
    const text = this.started ? chunk : stripBom(chunk);
    this.started = true;
    const rows: string[][] = [];

    for (const ch of text) {
      if (this.quotePending) {
        this.quotePending = false;
        if (ch === '"') {
          this.cell += '"';
          continue;
        }
        this.inQuotes = false;
        // フォールスルーして通常処理へ
      }

      if (this.inQuotes) {
        if (ch === '"') this.quotePending = true;
        else this.cell += ch;
        continue;
      }

      if (this.crPending) {
        this.crPending = false;
        if (ch === "\n") {
          rows.push(this.endRow());
          continue;
        }
        rows.push(this.endRow());
        // CR単独も改行として扱い、この文字は続けて処理する
      }

      if (ch === '"') {
        this.inQuotes = true;
      } else if (ch === ",") {
        this.cells.push(this.cell);
        this.cell = "";
      } else if (ch === "\r") {
        this.crPending = true;
      } else if (ch === "\n") {
        rows.push(this.endRow());
      } else {
        this.cell += ch;
      }
    }
    return rows;
  }

  flush(): string[][] {
    if (this.quotePending) {
      this.quotePending = false;
      this.inQuotes = false;
    }
    if (this.crPending) {
      this.crPending = false;
      return [this.endRow()];
    }
    if (this.cell !== "" || this.cells.length > 0) {
      return [this.endRow()];
    }
    return [];
  }

  private endRow(): string[] {
    this.cells.push(this.cell);
    this.cell = "";
    const row = this.cells;
    this.cells = [];
    return row;
  }
}

const NEEDS_QUOTE = /[",\r\n]/;

/** 書き出し用。必要なときだけ引用する。 */
export function formatCsvRow(cells: string[]): string {
  return cells
    .map((c) => (NEEDS_QUOTE.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
    .join(",");
}
