/** 先頭に BOM があれば取り除く。 */
export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

const COMMA = 44;
const QUOTE = 34;
const CR = 13;
const LF = 10;

/**
 * RFC4180 のストリームパーサ。
 * 引用値の中のカンマ・CRLF・二重引用符を正しく扱う。
 * チャンク境界が引用値の途中や CR と LF の間に落ちても壊れない。
 *
 * 1文字ずつ見るのではなく、区切りに当たるまで添字を進めてから slice でまとめて
 * 取り出す。数百MBのCSVでは、文字ごとに部分文字列を作って継ぎ足す書き方との差が
 * 数秒になる。
 */
export class CsvParser {
  private cells: string[] = [];
  private cell = "";
  private inQuotes = false;
  /** 直前が引用値の中の " で、次が " ならエスケープ、そうでなければ引用終わり。 */
  private quotePending = false;
  /** 直前のチャンクが CR で終わっていた。続く LF は同じ改行の一部として読み飛ばす。 */
  private skipLf = false;
  private started = false;

  push(chunk: string): string[][] {
    const text = this.started ? chunk : stripBom(chunk);
    this.started = true;
    const rows: string[][] = [];
    const n = text.length;
    let i = 0;

    // CR で終わったチャンクの続き。行は CR の時点で閉じてあるので、LF を捨てるだけ。
    if (this.skipLf && n > 0) {
      this.skipLf = false;
      if (text.charCodeAt(0) === LF) i = 1;
    }

    while (i < n) {
      if (this.quotePending) {
        this.quotePending = false;
        if (text.charCodeAt(i) === QUOTE) {
          this.cell += '"';
          i++;
          continue;
        }
        this.inQuotes = false;
        // この文字は引用の外として下で読み直す
      }

      if (this.inQuotes) {
        // 引用の中で意味を持つのは " だけなので、そこまで一気に飛ぶ。
        const end = text.indexOf('"', i);
        if (end === -1) {
          this.cell += text.slice(i);
          return rows;
        }
        if (end > i) this.cell += text.slice(i, end);
        this.quotePending = true;
        i = end + 1;
        continue;
      }

      let j = i;
      let code = 0;
      while (j < n) {
        code = text.charCodeAt(j);
        if (code === COMMA || code === QUOTE || code === CR || code === LF) break;
        j++;
      }
      if (j > i) this.cell += text.slice(i, j);
      if (j === n) return rows; // 区切りに当たらないままチャンクが尽きた
      i = j + 1;
      if (code === COMMA) {
        this.cells.push(this.cell);
        this.cell = "";
      } else if (code === QUOTE) {
        this.inQuotes = true;
      } else if (code === LF) {
        rows.push(this.endRow());
      } else {
        // CR。単独でも改行として扱い、直後の LF は同じ改行の一部として捨てる。
        rows.push(this.endRow());
        if (i < n) {
          if (text.charCodeAt(i) === LF) i++;
        } else {
          this.skipLf = true;
        }
      }
    }
    return rows;
  }

  flush(): string[][] {
    this.skipLf = false;
    if (this.quotePending) {
      this.quotePending = false;
      this.inQuotes = false;
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

/** 引用が要る文字を含むか。行数×列数だけ呼ばれるので正規表現は使わない。 */
function needsQuote(s: string, delimiter: number): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === delimiter || c === QUOTE || c === CR || c === LF) return true;
  }
  return false;
}

/**
 * 1行を組み立てる。join でまとめるのは速さではなく形のため。+= で継ぎ足すと
 * 結果が連結ノードの木のまま残り、数十万行を保持したときに木そのものが
 * 数GBを占める。join は平坦な文字列を1つ作って返す。
 */
function formatRow(cells: string[], delimiter: number, sep: string): string {
  const parts = new Array<string>(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    parts[i] = needsQuote(c, delimiter) ? `"${c.replace(/"/g, '""')}"` : c;
  }
  return parts.join(sep);
}

/** 書き出し用。必要なときだけ引用する。 */
export function formatCsvRow(cells: string[]): string {
  return formatRow(cells, COMMA, ",");
}

const TAB = 9;

/**
 * 表計算ソフトへの貼り付け用。CSV と同じ引用規則をタブ区切りに適用する。
 * (Excel/スプレッドシートは TSV でも "" によるエスケープを解釈する)
 */
export function formatTsvRow(cells: string[]): string {
  return formatRow(cells, TAB, "\t");
}
