/// <reference lib="webworker" />
import type { Query } from "../model/types";
import { compileQuery } from "./compile";
import { CsvParser, formatCsvRow } from "./csv";

/** 画面からワーカーへの依頼。 */
export type PreviewRequest = { query: Query; header: string[]; file: File };

/** ワーカーから画面への報せ。 */
export type PreviewMessage =
  | {
      type: "progress";
      scanned: number;
      matched: number;
      /** 読み終えたバイト数(File.size に対する進捗) */ bytes: number;
    }
  | { type: "header-mismatch"; missing: string[]; extra: string[] }
  | {
      type: "done";
      scanned: number;
      matched: number;
      /** 画面のページ送り用に保持した先頭 PREVIEW_ROWS 件。 */
      rows: string[][];
      /** 一致行が PREVIEW_ROWS を超えて rows が打ち切られたか。 */
      truncated: boolean;
      header: string[];
      csv: string;
      ignored: string[];
    }
  | { type: "error"; message: string };

/**
 * 画面に保持する一致行の上限。1ページ200行なので50ページぶん。
 * 全一致行は csv 文字列としても返しており、コピー・ダウンロードはそちらを使うため、
 * ここを増やしても得られるのは「さらに奥のページをめくれる」ことだけ。
 * 多数の列×数十万行を配列のまま持つとメモリを食い潰すので上限を設ける。
 */
const PREVIEW_ROWS = 10000;

/**
 * 進捗を送る間隔。行数を基準にすると、行の長さ次第で更新が飛び飛びになったり
 * 逆に送りすぎたりする。時間で区切れば、どんなCSVでも毎秒10回に収まる。
 */
const PROGRESS_INTERVAL_MS = 100;

function post(msg: PreviewMessage): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

self.onmessage = async (e: MessageEvent<PreviewRequest>) => {
  const { query, header, file } = e.data;
  try {
    const parser = new CsvParser();
    // TextDecoderStream を挟むと文字数しか分からず、File.size(バイト)と比べられない。
    // 進捗バーの分母を実バイト数にするため、生のチャンクを受けて自前で復号する。
    const reader = file.stream().getReader();
    const decoder = new TextDecoder("utf-8");
    let bytes = 0;
    let lastPost = 0;

    let csvHeader: string[] | null = null;
    // TS がクロージャ内の再代入を読み取り側で never に絞り込んでしまうため、
    // オブジェクトに包んでプロパティ代入にする。
    const state: { compiled: ReturnType<typeof compileQuery> | null } = { compiled: null };
    let scanned = 0;
    let matched = 0;
    const keptRows: string[][] = [];
    const out: string[] = [];

    const handle = (rows: string[][]): boolean => {
      for (const row of rows) {
        if (csvHeader === null) {
          csvHeader = row;
          const got = new Set(row);
          const want = new Set(header);
          const missing = header.filter((n) => !got.has(n));
          const extra = row.filter((n) => !want.has(n));
          if (missing.length > 0 || extra.length > 0) {
            post({ type: "header-mismatch", missing, extra });
            return false;
          }
          state.compiled = compileQuery(query, row);
          out.push(formatCsvRow(row));
          continue;
        }
        scanned++;
        if (state.compiled !== null && state.compiled.predicate(row)) {
          matched++;
          if (keptRows.length < PREVIEW_ROWS) keptRows.push(row);
          out.push(formatCsvRow(row));
        }
      }
      return true;
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      // stream: true でチャンク境界にまたがる多バイト文字を持ち越す
      if (!handle(parser.push(decoder.decode(value, { stream: true })))) return;
      const now = performance.now();
      if (now - lastPost >= PROGRESS_INTERVAL_MS) {
        lastPost = now;
        post({ type: "progress", scanned, matched, bytes });
      }
    }
    // 復号器に残った持ち越しを吐き出させる(不完全なバイト列は置換文字になる)
    const tail = decoder.decode();
    if (tail !== "" && !handle(parser.push(tail))) return;
    if (!handle(parser.flush())) return;
    // 読み終えた時点で 100% にしておく。この後の csv 組み立て(数十MBの join)にも
    // 時間がかかるため、そこで帯が途中の値のまま止まって見えないようにする。
    post({ type: "progress", scanned, matched, bytes });

    // 元のCSVと同じ形式で書き出す: UTF-8 BOM付き・CRLF・ヘッダ行あり
    const csv = "﻿" + out.join("\r\n") + "\r\n";
    post({
      type: "done",
      scanned,
      matched,
      rows: keptRows,
      truncated: matched > keptRows.length,
      header: csvHeader ?? header,
      csv,
      ignored: state.compiled?.ignored ?? [],
    });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
