import type { Query } from "../model/types";
import { compileQuery, type Compiled } from "./compile";
import { CsvLineReader, parseCsvLine, pickFields } from "./scan";

/** 走査した範囲の結果。 */
export type RangeResult = {
  /** 走査した行数(列名の行と、範囲の頭で欠けた行は数えない)。 */
  scanned: number;
  matched: number;
  /** 表に出すために取っておいた行。keepLimit 件まで。文字列のまま持つ。 */
  keptLines: string[];
  /** 一致した行の文字列。元のCSVの書き方のまま。 */
  lines: string[];
};

export type RangeOptions = {
  query: Query;
  /** CSV の列名。範囲ごとに読み直さなくて済むよう、呼び出し側が先に確かめて渡す。 */
  csvHeader: string[];
  /** 表に出すために取っておく行数の上限。 */
  keepLimit: number;
};

/**
 * CSV のバイト範囲ひとつを走査する。
 *
 * ファイルを分けて同時に走らせるために、範囲の始まりと終わりの半端な行を決まった形で
 * 扱う。始まりの1行は捨て(前の範囲が最後まで読む)、終わりで切れた行は続きを
 * 読んで閉じる。こうすると、どこで分けても行が欠けたり重なったりしない。
 *
 * 呼び出し側の約束: 2つ目以降の範囲は、担当の1バイト手前から読ませること。
 * ちょうど行頭から始まる範囲でも、捨てるのは直前の行の改行までの空文字列になり、
 * 担当の1行目が失われない。最初の範囲は 0 から読み、捨てられるのは列名の行になる。
 */
export class RangeScanner {
  private readonly decoder = new TextDecoder("utf-8");
  private readonly lines = new CsvLineReader();
  private readonly compiled: Compiled;
  private readonly want: Uint8Array;
  private readonly maxCol: number;
  private readonly fields: string[] = [];
  private readonly keepLimit: number;
  private readonly columnCount: number;

  /** 範囲の先頭の行(前の範囲の続き、または列名の行)を捨てたか。 */
  private skipped = false;
  /** 終わりで切れた行を閉じる読みに入ったか。 */
  private closing = false;
  /** その1行を閉じ終えたか。 */
  private closed = false;
  /** 最初の行の列数が合わなかった。範囲の切り口が行頭でなかった疑いがある。 */
  private misalignedFlag = false;

  readonly result: RangeResult = { scanned: 0, matched: 0, keptLines: [], lines: [] };

  constructor(opts: RangeOptions) {
    this.compiled = compileQuery(opts.query, opts.csvHeader);
    this.want = new Uint8Array(opts.csvHeader.length);
    this.keepLimit = opts.keepLimit;
    this.columnCount = opts.csvHeader.length;
    let maxCol = -1;
    for (const i of this.compiled.usedColumns) {
      this.want[i] = 1;
      if (i > maxCol) maxCol = i;
    }
    this.maxCol = maxCol;
  }

  /** 評価できずに落とした条件。 */
  get ignored(): string[] {
    return this.compiled.ignored;
  }

  /** 範囲の切り口が行頭でなかった疑いがあるか。 */
  get misaligned(): boolean {
    return this.misalignedFlag;
  }

  /** ここまでに走査した行数と一致した行数。 */
  get counts(): { scanned: number; matched: number } {
    return { scanned: this.result.scanned, matched: this.result.matched };
  }

  /** 行の途中で止まっているか。true なら続きのバイトが要る。 */
  get midLine(): boolean {
    return this.lines.midLine;
  }

  /** 担当範囲のバイトを渡す。 */
  push(bytes: Uint8Array): void {
    if (this.closed) return;
    // stream: true でチャンク境界にまたがる多バイト文字を持ち越す
    this.lines.push(this.decoder.decode(bytes, { stream: true }), this.handle);
  }

  /**
   * 範囲の終わりで切れた行を閉じるための続きを渡す。
   * 1行閉じ終えたら true を返す。以降のバイトは要らない。
   */
  pushTail(bytes: Uint8Array): boolean {
    this.closing = true;
    this.push(bytes);
    return this.closed;
  }

  /** これ以上バイトが無いとき、復号器と読み取り器に残ったものを吐き出す。 */
  finish(): void {
    if (this.closed) return;
    const tail = this.decoder.decode();
    if (tail !== "") this.lines.push(tail, this.handle);
    if (!this.closed) this.lines.flush(this.handle);
  }

  private readonly handle = (line: string): void => {
    if (this.closed) return;
    if (!this.skipped) {
      // 範囲の頭の行は前の範囲が読み切る。範囲が0から始まるときは列名の行。
      this.skipped = true;
      return;
    }
    const r = this.result;
    r.scanned++;
    if (r.scanned === 1) {
      // 切り口が行頭でなければ、最初の行は列の数が合わない。
      this.misalignedFlag = parseCsvLine(line).length !== this.columnCount;
    }
    if (this.maxCol < 0 || this.hit(line)) {
      r.matched++;
      // 切り出した行は読み込んだバイト列の一部を指しており、そのまま抱えると
      // 元のチャンクが解放されない。取っておくぶんだけ複製して切り離す。
      if (r.keptLines.length < this.keepLimit) r.keptLines.push(structuredClone(line));
      r.lines.push(line);
    }
    // 終わりで切れた行を閉じるための読みなら、1行で用は済んでいる。
    if (this.closing) this.closed = true;
  };

  private hit(line: string): boolean {
    pickFields(line, this.want, this.maxCol, this.fields);
    return this.compiled.predicate(this.fields);
  }
}

/**
 * 一致した行を、元のCSVと同じ形(CRLF区切り・末尾も改行)のバイト列にする。
 * 範囲ごとのバイト列は、順につなげればそのまま1つのCSVになる。
 */
export function encodeLines(lines: string[]): ArrayBuffer {
  if (lines.length === 0) return new ArrayBuffer(0);
  const bytes = new TextEncoder().encode(lines.join("\r\n") + "\r\n");
  // encode が返すのはちょうどの長さの buffer なので、そのまま所有権を渡せる。
  return bytes.buffer as ArrayBuffer;
}

/** scanFileRange への依頼。 */
export type FileRangeRequest = RangeOptions & {
  /** 読み込む元。File でも Blob でもよい。 */
  file: Blob;
  /** 担当するバイト範囲 [start, end)。 */
  start: number;
  end: number;
  /** 何番目の範囲か。0 は列名の行から始まる。 */
  index: number;
  /** 読み進みの報せ。bytes はこの範囲で読んだバイト数。 */
  onProgress?: (p: { scanned: number; matched: number; bytes: number }) => void;
};

/** scanFileRange の結果。 */
export type FileRangeResult = RangeResult & { ignored: string[]; misaligned: boolean };

/** 進捗を送る間隔。時間で区切れば、どんなCSVでも毎秒10回に収まる。 */
const PROGRESS_INTERVAL_MS = 100;

/**
 * ファイルのバイト範囲ひとつを読んで走査する。
 * 範囲の終わりで切れた行は、続きを読んで閉じる(次の範囲はその行を捨てる)。
 */
export async function scanFileRange(req: FileRangeRequest): Promise<FileRangeResult> {
  const scanner = new RangeScanner(req);
  // 2つ目以降の範囲は直前の1バイト(前の行の改行)から読む。RangeScanner の約束。
  const from = req.index === 0 ? req.start : req.start - 1;
  const reader = req.file.slice(from, req.end).stream().getReader();
  let bytes = 0;
  let lastPost = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    scanner.push(value);
    const now = performance.now();
    if (now - lastPost >= PROGRESS_INTERVAL_MS) {
      lastPost = now;
      req.onProgress?.({ ...scanner.counts, bytes });
    }
  }
  if (scanner.midLine && req.end < req.file.size) {
    const tail = req.file.slice(req.end).stream().getReader();
    for (;;) {
      const { done, value } = await tail.read();
      if (done) break;
      if (scanner.pushTail(value)) break;
    }
    await tail.cancel();
  }
  scanner.finish();
  req.onProgress?.({ ...scanner.counts, bytes });
  return { ...scanner.result, ignored: scanner.ignored, misaligned: scanner.misaligned };
}
