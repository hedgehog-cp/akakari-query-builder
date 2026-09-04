import { CsvParser } from "./csv";

const COMMA = 44;
const QUOTE = 34;
const CR = 13;
const LF = 10;

/**
 * CSV を行の文字列に切り分けるだけの読み取り器。セルには分けない。
 *
 * 条件に合う行はふつうごく一部なので、全行の全セルを文字列にするのは無駄が大きい。
 * まず行だけに切り、条件が見る列だけを pickFields で取り出し、合った行だけを
 * 改めて全部のセルに分ける、という順にするために使う。
 *
 * 行の切れ目は indexOf に探させる。見つけた位置は次に追い越すまで覚えておくので、
 * チャンクを何度も走査し直すことはない。
 */
export class CsvLineReader {
  /** 前のチャンクに残った行の途中。 */
  private pending = "";
  private inQuotes = false;
  /** 直前のチャンクが CR で終わっていた。続く LF は同じ改行の一部。 */
  private skipLf = false;
  private started = false;

  push(chunk: string, onLine: (line: string) => void): void {
    const text = this.started ? chunk : stripBomOf(chunk);
    this.started = true;
    const n = text.length;
    let i = 0;
    if (this.skipLf && n > 0) {
      this.skipLf = false;
      if (text.charCodeAt(0) === LF) i = 1;
    }
    let start = i;

    // 覚えておく位置。-1 は「このチャンクにもう無い」、i より手前なら探し直す。
    let quote = text.indexOf('"', i);
    let cr = text.indexOf("\r", i);
    let lf = text.indexOf("\n", i);

    for (;;) {
      if (quote !== -1 && quote < i) quote = text.indexOf('"', i);
      if (this.inQuotes) {
        // 引用の中では改行も区切りではない。閉じる " まで飛ばす。
        if (quote === -1) break;
        this.inQuotes = false;
        i = quote + 1;
        continue;
      }
      if (cr !== -1 && cr < i) cr = text.indexOf("\r", i);
      if (lf !== -1 && lf < i) lf = text.indexOf("\n", i);
      const brk = cr === -1 ? lf : lf === -1 ? cr : cr < lf ? cr : lf;
      if (brk === -1) {
        // 行の切れ目はもう無い。ただし残りに引用の始まりがあれば、次のチャンクは
        // 引用の中から続く。数だけ数えて状態を進めてから抜ける。
        for (let q = quote; q !== -1; q = text.indexOf('"', q + 1)) this.inQuotes = !this.inQuotes;
        break;
      }
      if (quote !== -1 && quote < brk) {
        // 引用が始まった。"" は「閉じてすぐ開く」と数えれば同じことになる。
        this.inQuotes = true;
        i = quote + 1;
        continue;
      }
      const line = text.slice(start, brk);
      onLine(this.pending === "" ? line : this.pending + line);
      this.pending = "";
      i = brk + 1;
      if (text.charCodeAt(brk) === CR) {
        if (i < n) {
          if (text.charCodeAt(i) === LF) i++;
        } else {
          this.skipLf = true;
        }
      }
      start = i;
    }
    if (start < n) this.pending += text.slice(start);
  }

  /** 行の途中で止まっているか。範囲を分けて読むとき、続きが要るかの判断に使う。 */
  get midLine(): boolean {
    return this.pending !== "";
  }

  /** 改行で終わっていない最後の行を吐き出す。 */
  flush(onLine: (line: string) => void): void {
    if (this.pending !== "") {
      onLine(this.pending);
      this.pending = "";
    }
  }
}

function stripBomOf(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * 行から、want に印を付けた列だけを out に入れる。maxCol より後ろは見ない。
 * 条件が見ない列は文字列にしないので、列数の多い CSV ほど効く。
 *
 * out は呼び出し側で使い回す。印の無い位置には前の行の値が残るが、
 * 条件はその位置を見ないため差し支えない。
 */
export function pickFields(line: string, want: Uint8Array, maxCol: number, out: string[]): void {
  const n = line.length;
  let col = 0;
  let i = 0;
  while (col <= maxCol && i <= n) {
    let start = i;
    let quoted = false;
    if (i < n && line.charCodeAt(i) === QUOTE) {
      quoted = true;
      start = i + 1;
      i = start;
      for (;;) {
        const q = line.indexOf('"', i);
        if (q === -1) {
          i = n;
          break;
        }
        if (line.charCodeAt(q + 1) === QUOTE) {
          i = q + 2; // "" は値の中の "
          continue;
        }
        i = q + 1;
        break;
      }
    }
    const end = quoted ? i - 1 : nextComma(line, i, n);
    if (want[col] === 1) {
      const v = line.slice(start, end < start ? start : end);
      out[col] = quoted && v.indexOf('"') !== -1 ? v.replace(/""/g, '"') : v;
    }
    i = quoted ? nextComma(line, i, n) : end;
    col++;
    i++; // カンマを飛ばす
  }
}

function nextComma(line: string, from: number, n: number): number {
  let i = from;
  while (i < n && line.charCodeAt(i) !== COMMA) i++;
  return i;
}

/** 1行を全部のセルに分ける。条件に合った行にだけ使う。 */
export function parseCsvLine(line: string): string[] {
  const p = new CsvParser();
  const rows = p.push(line);
  const rest = p.flush();
  // 空行はセル1つの行として扱う(まとめて分けたときと同じ)。
  return rows[0] ?? rest[0] ?? [""];
}
