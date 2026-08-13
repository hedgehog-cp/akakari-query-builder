/// <reference lib="webworker" />
import type { Query } from "../model/types";
import { compileQuery } from "./compile";
import { CsvParser, formatCsvRow } from "./csv";

export type PreviewRequest = { query: Query; header: string[]; file: File };

export type PreviewMessage =
  | { type: "progress"; scanned: number; matched: number }
  | { type: "header-mismatch"; missing: string[]; extra: string[] }
  | { type: "done"; scanned: number; matched: number; sample: string[][]; csv: string; ignored: string[] }
  | { type: "error"; message: string };

const SAMPLE_LIMIT = 200;
const PROGRESS_EVERY = 20000;

function post(msg: PreviewMessage): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

self.onmessage = async (e: MessageEvent<PreviewRequest>) => {
  const { query, header, file } = e.data;
  try {
    const parser = new CsvParser();
    const reader = file.stream().pipeThrough(new TextDecoderStream("utf-8")).getReader();

    let csvHeader: string[] | null = null;
    // TS がクロージャ内の再代入を読み取り側で never に絞り込んでしまうため、
    // オブジェクトに包んでプロパティ代入にする。
    const state: { compiled: ReturnType<typeof compileQuery> | null } = { compiled: null };
    let scanned = 0;
    let matched = 0;
    const sample: string[][] = [];
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
          if (sample.length < SAMPLE_LIMIT) sample.push(row);
          out.push(formatCsvRow(row));
        }
        if (scanned % PROGRESS_EVERY === 0) post({ type: "progress", scanned, matched });
      }
      return true;
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!handle(parser.push(value))) return;
    }
    if (!handle(parser.flush())) return;

    // 元のCSVと同じ形式で書き出す: UTF-8 BOM付き・CRLF・ヘッダ行あり
    const csv = "﻿" + out.join("\r\n") + "\r\n";
    post({
      type: "done", scanned, matched, sample, csv,
      ignored: state.compiled?.ignored ?? [],
    });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
