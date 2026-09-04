import type { Query } from "../model/types";
import { detectBadEncoding, type BadEncoding } from "./encoding";
import { formatCsvRow } from "./csv";
import { parseCsvLine } from "./scan";
import type { PreviewMessage, PreviewRequest } from "./preview.worker";

/** 既定のワーカーの作り方。この形で書かないとビルド時に見つけてもらえない。 */
function spawnWorker(): Worker {
  return new Worker(new URL("./preview.worker.ts", import.meta.url), { type: "module" });
}

/** 画面へ流す報せ。走査を何本に分けたかは画面から見えない。 */
export type PreviewEvent =
  | { type: "progress"; scanned: number; matched: number; bytes: number }
  | { type: "header-mismatch"; missing: string[]; extra: string[] }
  | { type: "bad-encoding"; encoding: BadEncoding }
  | {
      type: "done";
      scanned: number;
      matched: number;
      rows: string[][];
      truncated: boolean;
      header: string[];
      /** 一致した行の CSV(UTF-8 BOM付き・CRLF)。範囲ごとに分かれている。 */
      csv: ArrayBuffer[];
      ignored: string[];
    }
  | { type: "error"; message: string };

/**
 * 画面に保持する一致行の上限。1ページ200行なので50ページぶん。
 * 全一致行はバイト列としても返しており、コピー・ダウンロードはそちらを使うため、
 * ここを増やしても得られるのは「さらに奥のページをめくれる」ことだけ。
 * 多数の列×数十万行を配列のまま持つとメモリを食い潰すので上限を設ける。
 */
const PREVIEW_ROWS = 10000;

/** 列名の行を読むために先読みするバイト数。155列でも数KBに収まる。 */
const HEAD_BYTES = 1 << 16;

/**
 * ファイルを分けて走らせる本数。走査は純粋な計算なので、コアの数だけ速くなる。
 * 上限を置くのは、本数を増やすほど1本あたりの取り分が小さくなり、
 * 立ち上げと受け渡しの費用が勝ってしまうため。
 */
const MAX_WORKERS = 8;

/** 1本に最低限これだけは持たせる。細切れにしても速くならない。 */
const MIN_BYTES_PER_WORKER = 8 << 20;

function workerCount(size: number): number {
  const cores = navigator.hardwareConcurrency ?? 4;
  const byCores = Math.max(1, Math.min(MAX_WORKERS, cores));
  const bySize = Math.max(1, Math.floor(size / MIN_BYTES_PER_WORKER));
  return Math.min(byCores, bySize);
}

/** 走査を始める。戻り値を呼ぶと、動いているワーカーを全部止める。 */
export function runPreview(opts: {
  query: Query;
  /** 選択中の戦闘種別の列名。CSV がこれと合うかを先に確かめる。 */
  header: string[];
  file: File;
  onEvent: (e: PreviewEvent) => void;
  /** ワーカーの作り方。省略すると既定のワーカーを立てる。 */
  spawn?: () => Worker;
}): () => void {
  const workers: Worker[] = [];
  let cancelled = false;

  /** 立てたワーカーを片付ける。走査が終わったときにも呼ぶ。 */
  const terminateAll = () => {
    for (const w of workers) w.terminate();
    workers.length = 0;
  };

  /** 呼び出し側からの中止。以降は何も知らせない。 */
  const stop = () => {
    cancelled = true;
    terminateAll();
  };

  /** 範囲ごとの途中経過と、走り終えた範囲の結果。どちらも範囲の番号で並ぶ。 */
  type Counts = { scanned: number; matched: number; bytes: number };
  type Part = { keptLines: string[]; csv: ArrayBuffer; ignored: string[] };

  function start(count: number, csvHeader: string[]): void {
    const size = opts.file.size;
    const counts: Counts[] = Array.from({ length: count }, () => ({
      scanned: 0,
      matched: 0,
      bytes: 0,
    }));
    const parts = new Array<Part | null>(count).fill(null);

    const postProgress = () => {
      let scanned = 0;
      let matched = 0;
      let bytes = 0;
      for (const c of counts) {
        scanned += c.scanned;
        matched += c.matched;
        bytes += c.bytes;
      }
      opts.onEvent({ type: "progress", scanned, matched, bytes });
    };

    for (let i = 0; i < count; i++) {
      const worker = opts.spawn === undefined ? spawnWorker() : opts.spawn();
      workers.push(worker);
      worker.onmessage = (e: MessageEvent<PreviewMessage>) => {
        const m = e.data;
        if (cancelled) return;
        if (m.type === "error") {
          stop();
          opts.onEvent({ type: "error", message: m.message });
          return;
        }
        if (m.type === "progress") {
          counts[i] = { scanned: m.scanned, matched: m.matched, bytes: m.bytes };
          postProgress();
          return;
        }
        if (m.misaligned) {
          // 範囲の切り口が行頭でなかった。分けずに1本で走査し直す
          // (引用値の中に改行がある CSV では起こりうる)。
          terminateAll();
          start(1, csvHeader);
          return;
        }
        counts[i] = { scanned: m.scanned, matched: m.matched, bytes: counts[i].bytes };
        parts[i] = { keptLines: m.keptLines, csv: m.csv, ignored: m.ignored };
        postProgress();
        if (parts.every((p) => p !== null)) finish(parts as Part[], counts, csvHeader);
      };
      const request: PreviewRequest = {
        query: opts.query,
        csvHeader,
        file: opts.file,
        start: Math.floor((size * i) / count),
        end: Math.floor((size * (i + 1)) / count),
        index: i,
        keepLimit: PREVIEW_ROWS,
      };
      worker.postMessage(request);
    }
  }

  function finish(parts: Part[], counts: Counts[], csvHeader: string[]): void {
    terminateAll();
    // 表に出す行は、範囲の番号順に前から詰める(元のCSVと同じ並び)。
    const keptLines: string[] = [];
    for (const p of parts) {
      for (const line of p.keptLines) {
        if (keptLines.length >= PREVIEW_ROWS) break;
        keptLines.push(line);
      }
    }
    // 元のCSVと同じ形式で書き出す: UTF-8 BOM付き・CRLF・ヘッダ行あり。
    // 列名の行は元の書き方が残っていないので、必要なときだけ引用して書き戻す。
    const headBytes = new TextEncoder().encode("﻿" + formatCsvRow(csvHeader) + "\r\n");
    const matched = counts.reduce((a, c) => a + c.matched, 0);
    opts.onEvent({
      type: "done",
      scanned: counts.reduce((a, c) => a + c.scanned, 0),
      matched,
      rows: keptLines.map(parseCsvLine),
      truncated: matched > keptLines.length,
      header: csvHeader,
      csv: [headBytes.buffer as ArrayBuffer, ...parts.map((p) => p.csv)],
      // 落とした条件は範囲によらず同じ(同じ条件を同じ列名に当てている)。
      ignored: parts[0].ignored,
    });
  }

  void (async () => {
    try {
      const head = new Uint8Array(await opts.file.slice(0, HEAD_BYTES).arrayBuffer());
      if (cancelled) return;

      // 文字コード違いは復号の時点では止まらず、置換文字だらけの行になって
      // ヘッダ不一致として現れる。原因が伝わらないので、先頭で見て断る。
      const bad = detectBadEncoding(head, opts.header);
      if (bad !== null) {
        opts.onEvent({ type: "bad-encoding", encoding: bad });
        return;
      }

      const headText = new TextDecoder("utf-8").decode(head);
      const nl = headText.search(/\r\n|\n/);
      const csvHeader = parseCsvLine(nl === -1 ? headText : headText.slice(0, nl));
      const got = new Set(csvHeader);
      const want = new Set(opts.header);
      const missing = opts.header.filter((n) => !got.has(n));
      const extra = csvHeader.filter((n) => !want.has(n));
      if (missing.length > 0 || extra.length > 0) {
        opts.onEvent({ type: "header-mismatch", missing, extra });
        return;
      }

      start(workerCount(opts.file.size), csvHeader);
    } catch (err) {
      if (!cancelled) {
        opts.onEvent({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
    }
  })();

  return stop;
}
