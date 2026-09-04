/// <reference lib="webworker" />
import type { Query } from "../model/types";
import { encodeLines, scanFileRange } from "./scan-range";

/**
 * ワーカー1つぶんの依頼。ファイルを範囲で分けて同時に走らせるため、
 * 担当するバイト範囲を受け取る。列名の行と文字コードは preview-runner が
 * 先に確かめているので、ここでは扱わない。
 */
export type PreviewRequest = {
  query: Query;
  /** CSV の列名。 */
  csvHeader: string[];
  file: File;
  /** 担当するバイト範囲 [start, end)。 */
  start: number;
  end: number;
  /** 何番目の範囲か。0 は列名の行から始まる。 */
  index: number;
  /** 表に出すために取っておく行数の上限。 */
  keepLimit: number;
};

/** ワーカーから runner への報せ。 */
export type PreviewMessage =
  | {
      type: "progress";
      scanned: number;
      matched: number;
      /** この範囲で読み終えたバイト数。 */ bytes: number;
    }
  | {
      type: "done";
      scanned: number;
      matched: number;
      /** 表に出すために取っておいた行(文字列のまま)。 */
      keptLines: string[];
      /**
       * 一致した行を元のCSVと同じ形(CRLF区切り)にしたバイト列。
       * 文字列で渡すと postMessage が丸ごと複製する(数百MBで1秒を超える)。
       * バイト列は所有権ごと移せるので複製が要らず、順につなげれば1つのCSVになる。
       */
      csv: ArrayBuffer;
      ignored: string[];
      /** 範囲の切り口が行頭でなかった疑い。runner は1本で走査し直す。 */
      misaligned: boolean;
    }
  | { type: "error"; message: string };

function post(msg: PreviewMessage, transfer?: Transferable[]): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? []);
}

self.onmessage = async (e: MessageEvent<PreviewRequest>) => {
  try {
    const r = await scanFileRange({
      ...e.data,
      onProgress: (p) => post({ type: "progress", ...p }),
    });
    const csv = encodeLines(r.lines);
    post(
      {
        type: "done",
        scanned: r.scanned,
        matched: r.matched,
        keptLines: r.keptLines,
        csv,
        ignored: r.ignored,
        misaligned: r.misaligned,
      },
      [csv],
    );
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
