import type { VNode } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { BATTLE_LABEL, type Query } from "../model/types";
import type { Column } from "../schema/catalog";
import type { PreviewMessage } from "../eval/preview.worker";
import { CsvParser, formatCsvRow, formatTsvRow } from "../eval/csv";
import type { BadEncoding } from "../eval/encoding";
import { SectionToggle } from "./collapsible";

type State =
  | { kind: "idle" }
  | {
      kind: "running";
      scanned: number;
      matched: number;
      /** 読み終えたバイト数。進捗の分子。 */ bytes: number;
    }
  | { kind: "mismatch"; missing: string[]; extra: string[] }
  | { kind: "bad-encoding"; encoding: BadEncoding }
  | {
      kind: "done";
      scanned: number;
      matched: number;
      rows: string[][];
      truncated: boolean;
      header: string[];
      /** 一致した行の CSV(UTF-8 BOM付き・CRLF)。文字にするのは求められたときだけ。 */
      csv: ArrayBuffer;
      ignored: string[];
    }
  | { kind: "error"; message: string };

/** 1ページの表示行数。一度に描く量と、ページを繰る手数の釣り合いで決めた。 */
const PAGE_SIZE = 200;

/**
 * ヘッダ不一致の列名を並べる上限。列は百を超えるので、戦闘種別違いの CSV を落とすと
 * ほぼ全列が並んで画面が埋まってしまうため、先頭だけ見せて残りは件数にする。
 */
const NAME_LIST_LIMIT = 10;

function nameList(names: string[]): string {
  if (names.length <= NAME_LIST_LIMIT) return names.join(", ");
  return `${names.slice(0, NAME_LIST_LIMIT).join(", ")} ほか ${names.length - NAME_LIST_LIMIT} 件`;
}

/**
 * ワーカーが返した CSV 文字列をタブ区切りに組み直す。
 * ワーカー側で CSV と TSV の2本を作ると、数十万行規模では巨大な文字列を
 * 二重に抱えることになるため、TSV はコピーを押したときにここで作る。
 */
function csvToTsv(csv: string, includeHeader: boolean): string {
  const parser = new CsvParser();
  const rows = [...parser.push(csv), ...parser.flush()];
  return (includeHeader ? rows : rows.slice(1)).map(formatTsvRow).join("\r\n");
}

function download(body: string | ArrayBuffer, name: string, type: string): void {
  const blob = new Blob([body], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * ワーカーから届いたバイト列を文字列にする。数百MBでは復号だけで1秒近くかかるため、
 * コピーを押したときにだけ行い、同じ結果に対しては1度きりにする。
 * (TextDecoder は先頭の BOM を落とすので、得られるのは BOM 無しの本文。)
 */
function useCsvText(csv: ArrayBuffer | null): () => string {
  const cache = useRef<{ csv: ArrayBuffer | null; text: string }>({ csv: null, text: "" });
  return useCallback(() => {
    if (csv === null) return "";
    if (cache.current.csv !== csv) {
      cache.current = { csv, text: new TextDecoder("utf-8").decode(csv) };
    }
    return cache.current.text;
  }, [csv]);
}

/** 手元の CSV に条件を当てて結果を見せる枠。走査はワーカーで行う。 */
export function PreviewPane(props: { query: Query; columns: Column[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [page, setPage] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  /** コピーする文字列にヘッダ行を含めるか。表計算へ継ぎ足すときに外せるようにした。 */
  const [withHeader, setWithHeader] = useState(true);
  /** 選択中の行(done.rows のインデックス)。Shift の起点は anchor。 */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [open, setOpen] = useState(true);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const expectedFileName = `${BATTLE_LABEL[props.query.battle]}.csv`;

  const clearSelection = () => {
    setSelected(new Set());
    setAnchor(null);
  };

  const run = (target: File) => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../eval/preview.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    setPage(0);
    clearSelection();
    setState({ kind: "running", scanned: 0, matched: 0, bytes: 0 });
    worker.onmessage = (e: MessageEvent<PreviewMessage>) => {
      const m = e.data;
      if (m.type === "progress")
        setState({ kind: "running", scanned: m.scanned, matched: m.matched, bytes: m.bytes });
      else if (m.type === "header-mismatch")
        setState({ kind: "mismatch", missing: m.missing, extra: m.extra });
      else if (m.type === "bad-encoding") setState({ kind: "bad-encoding", encoding: m.encoding });
      else if (m.type === "done") setState({ kind: "done", ...m });
      else setState({ kind: "error", message: m.message });
    };
    worker.postMessage({
      query: props.query,
      header: props.columns.map((c) => c.name),
      file: target,
    });
  };

  // 戦闘種別が違うために弾かれた CSV は、正しい戦闘種別に切り替えた時点で
  // 自動的に走らせ直す。列カタログは戦闘種別ごとに取り直されるので、
  // 「新しい列が届いた」= 切り替わったタイミングとして props.columns を見る。
  // 依存に state を入れると mismatch → 実行 → mismatch で回り続けるため入れない。
  // 成功済み(done)のときは自動再実行しない。数十万行の走査を切り替えのたびに
  // 始めてしまうため、そちらは「再実行」ボタンに任せる。
  useEffect(() => {
    if (state.kind === "mismatch" && file !== null) run(file);
  }, [props.columns]);

  // 受け取った時点で実行する。条件を編集するたびの自動再実行はしない
  // (CSV は数十万行に達することがあり、そのたびに走らせると重すぎるため)。
  const accept = (f: File) => {
    setFile(f);
    run(f);
  };

  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f !== undefined) accept(f);
    };
    input.click();
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const done = state.kind === "done" ? state : null;
  const csvText = useCsvText(done?.csv ?? null);
  const totalPages = done === null ? 1 : Math.max(1, Math.ceil(done.rows.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const pageRows = done === null ? [] : done.rows.slice(start, start + PAGE_SIZE);

  // ページをまたぐ選択は扱わない。移動したら選択も起点も捨てる。
  const goPage = (next: number) => {
    setPage(next);
    clearSelection();
  };

  // 選択と起点は ref からも読めるようにしておく。下の selectRow を
  // 「毎回同じ関数」にするためで、そうしないと行 vnode を使い回したときに
  // 古い selected/anchor を掴んだままのハンドラが残ってしまう。
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;

  const selectRow = useCallback((e: MouseEvent, index: number) => {
    const additive = e.ctrlKey || e.metaKey;
    const anchorNow = anchorRef.current;
    const selectedNow = selectedRef.current;
    if (e.shiftKey && anchorNow !== null) {
      const [lo, hi] = anchorNow <= index ? [anchorNow, index] : [index, anchorNow];
      const next = new Set(additive ? selectedNow : []);
      for (let i = lo; i <= hi; i++) next.add(i);
      setSelected(next);
      return; // 起点は動かさない(続けて範囲を広げ直せるように)
    }
    if (additive) {
      const next = new Set(selectedNow);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      setSelected(next);
    } else {
      setSelected(new Set([index]));
    }
    setAnchor(index);
  }, []);

  // 行 vnode のキャッシュ。Preact は前回と同一の vnode を見つけると、その部分木の
  // 差分計算を丸ごと省く。これを使い、選択の色が変わった行だけを作り直して他の行は
  // 前回のものを返す。素直に毎回作り直すと、1行クリックするたびに表の全セルぶんの
  // vnode を作って比べることになり、選択が目に見えて遅れる。
  const rowCache = useRef(new Map<number, { on: boolean; node: VNode }>());
  const rowCacheKey = useRef<{ done: unknown; page: number }>({ done: null, page: -1 });

  // 表は数万セルあり、素直に書くと開閉やコピー通知など無関係な再描画のたびに
  // Preact がその全セルを差分計算してしまう。行データ・ページ・選択が変わらない
  // 限り同じ vnode を返せば、Preact はその部分木の差分計算ごと省略する。
  const table = useMemo(() => {
    if (done === null) return null;
    const from = page * PAGE_SIZE;
    const rows = done.rows.slice(from, from + PAGE_SIZE);
    // 行の中身そのものが変わる(別のCSV・別ページ)ときはキャッシュを捨てる。
    if (rowCacheKey.current.done !== done || rowCacheKey.current.page !== page) {
      rowCache.current.clear();
      rowCacheKey.current = { done, page };
    }
    return (
      // 列が多いため横スクロールはこのコンテナだけが持つ(ページ全体を
      // 横に伸ばさない)。1ページぶんしか描画しないので列幅は内容なりでよい。
      <div class="contain-layout overflow-auto max-h-[600px] border border-gray-300 rounded">
        <table class="w-max text-xs border-collapse">
          <thead class="bg-gray-200 sticky top-0 z-10">
            <tr>
              {done.header.map((name) => (
                <th key={name} class="px-1 text-left whitespace-nowrap font-bold">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          {/* 行クリックで選択。Ctrl(Cmd)で追加/解除、Shiftで範囲。
              Shiftクリックでの文字列選択が邪魔になるので select-none。 */}
          <tbody class="select-none">
            {rows.map((r, i) => {
              const index = from + i;
              const on = selected.has(index);
              const cached = rowCache.current.get(index);
              if (cached !== undefined && cached.on === on) return cached.node;
              const node = (
                <tr
                  key={index}
                  class={`cursor-pointer ${on ? "bg-emp-2" : "odd:bg-gray-50/50 hover:bg-emp-4/60"}`}
                  onMouseDown={(e) => selectRow(e as MouseEvent, index)}
                >
                  {r.map((v, j) => (
                    <td key={j} class="px-1 whitespace-nowrap">
                      {v}
                    </td>
                  ))}
                </tr>
              );
              rowCache.current.set(index, { on, node });
              return node;
            })}
          </tbody>
        </table>
      </div>
    );
  }, [done, page, selected, selectRow]);

  /** 選択行。選択が空のときは null を返し、呼び出し側で全件を使う。 */
  const selectedRows = (): string[][] | null => {
    if (done === null || selected.size === 0) return null;
    return [...selected].sort((a, b) => a - b).map((i) => done.rows[i]);
  };

  /** 選択行にヘッダを付けた表。ダウンロードは付けたまま(読み込み直せる形を保つ)。 */
  const headed = (rows: string[][], includeHeader: boolean): string[][] =>
    includeHeader && done !== null ? [done.header, ...rows] : rows;

  /** 全一致行の CSV。ヘッダを外すときは先頭の1行(と続く CRLF)だけを落とす。 */
  const allCsv = (includeHeader: boolean): string => {
    const body = csvText();
    if (includeHeader) return body;
    // 列名の行は元の CSV の書き方のまま入っているので、長さは改行を探して測る。
    const nl = body.indexOf("\r\n");
    return nl === -1 ? "" : body.slice(nl + 2);
  };

  const suffix = selected.size > 0 ? `(選択 ${selected.size} 行)` : "";

  /** 走査の進捗(%)。ファイルの大きさが分からないときは帯も割合も出さない。 */
  const percent =
    state.kind === "running" && file !== null && file.size > 0
      ? Math.min(100, Math.round((state.bytes / file.size) * 100))
      : null;

  return (
    <>
      {copied && (
        <div class="fixed top-5 left-1/2 -translate-x-1/2 bg-green-600 text-white text-sm px-4 py-2 rounded shadow-lg z-50">
          クリップボードにコピーしました
        </div>
      )}
      <section
        class={`bg-bg-panel border rounded p-3 ${dragOver ? "border-emp-1 bg-emp-4/40" : "border-gray-300"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer?.files?.[0];
          if (f !== undefined) accept(f);
        }}
      >
        <SectionToggle open={open} onToggle={() => setOpen(!open)}>
          <h2 class="font-bold text-purple-900">プレビュー</h2>
        </SectionToggle>

        {/* ファイル名・件数もボタンも開閉の内側に置く。畳んだときは見出しの1行だけを残す。 */}
        <div class={open ? "mt-2 grid gap-2" : "collapsed"}>
          {(file !== null || done !== null) && (
            <div class="flex flex-wrap items-baseline gap-4 text-xs text-gray-500">
              {file !== null && <span>{file.name}</span>}
              {done !== null && (
                <span>
                  合致 {done.matched.toLocaleString()} 行 / 全 {done.scanned.toLocaleString()} 行
                </span>
              )}
            </div>
          )}

          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={withHeader}
                onChange={(e) => setWithHeader((e.target as HTMLInputElement).checked)}
              />
              ヘッダを含める
            </label>
            <button
              type="button"
              class="border border-gray-300 rounded px-2 py-0.5 hover:bg-emp-4 disabled:opacity-40"
              disabled={done === null}
              onClick={() => {
                if (done === null) return;
                const sel = selectedRows();
                copy(
                  sel === null
                    ? allCsv(withHeader)
                    : headed(sel, withHeader).map(formatCsvRow).join("\r\n"),
                );
              }}
            >
              CSVでコピー{suffix}
            </button>
            <button
              type="button"
              class="border border-gray-300 rounded px-2 py-0.5 hover:bg-emp-4 disabled:opacity-40"
              disabled={done === null}
              onClick={() => {
                if (done === null) return;
                const sel = selectedRows();
                copy(
                  sel === null
                    ? csvToTsv(csvText(), withHeader)
                    : headed(sel, withHeader).map(formatTsvRow).join("\r\n"),
                );
              }}
            >
              TSVでコピー{suffix}
            </button>
            <button
              type="button"
              class="border border-gray-300 rounded px-2 py-0.5 hover:bg-emp-4 disabled:opacity-40"
              disabled={done === null}
              onClick={() => {
                if (done === null) return;
                const sel = selectedRows();
                // ファイルは元のCSVと同じ形式(UTF-8 BOM付き・CRLF・ヘッダ行あり)で書き出す
                const csv: string | ArrayBuffer =
                  sel === null
                    ? done.csv
                    : "\ufeff" + headed(sel, true).map(formatCsvRow).join("\r\n") + "\r\n";
                download(csv, "filtered.csv", "text/csv;charset=utf-8");
              }}
            >
              ダウンロード{suffix}
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                class="border border-gray-300 rounded px-2 py-0.5 hover:bg-emp-4"
                onClick={clearSelection}
              >
                選択を解除
              </button>
            )}
            {file !== null && (
              <button
                type="button"
                class="border border-emp-1 rounded px-2 py-0.5 hover:bg-emp-4"
                onClick={() => run(file)}
              >
                再実行
              </button>
            )}
          </div>
          {state.kind === "running" && (
            <div class="grid gap-1">
              <p class="text-xs">
                合致 {state.matched.toLocaleString()} 行 / 走査 {state.scanned.toLocaleString()} 行…
                {percent !== null && ` (${percent}%)`}
              </p>
              {/* 分母はファイルのバイト数。行数は最後まで読まないと分からないため。 */}
              {percent !== null && (
                <div class="h-1.5 rounded bg-gray-200 overflow-hidden">
                  <div
                    class="h-full bg-emp-1 transition-[width] duration-100"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {state.kind === "bad-encoding" && (
            <div class="border border-red-400 bg-red-50 rounded p-2 text-xs">
              <p class="text-red-700 font-bold">
                {state.encoding === "shift_jis"
                  ? "CSV の文字コードが Shift_JIS のようです。実行を中止しました。"
                  : "CSV を UTF-8 として読めませんでした。実行を中止しました。"}
              </p>
              <p class="text-gray-600">
                このツールは UTF-8 の CSV だけを扱います。UTF-8
                で保存し直してから読み込んでください。
              </p>
            </div>
          )}

          {state.kind === "mismatch" && (
            <div class="border border-red-400 bg-red-50 rounded p-2 text-xs">
              <p class="text-red-700 font-bold">
                CSV のヘッダが選択中の戦闘種別と一致しません。実行を中止しました。
              </p>
              {state.missing.length > 0 && <p>不足: {nameList(state.missing)}</p>}
              {state.extra.length > 0 && <p>余分: {nameList(state.extra)}</p>}
              <p class="text-gray-600">
                選択中の戦闘種別は「{BATTLE_LABEL[props.query.battle]}」です。 旧世代の CSV
                か、別の戦闘種別・日本語以外の環境で出力された CSV の可能性があります。
              </p>
            </div>
          )}

          {state.kind === "error" && <p class="text-xs text-red-600">{state.message}</p>}

          {done === null ? (
            <>
              <div
                class="border-2 border-dashed border-gray-300 rounded py-16 text-center text-gray-400 cursor-pointer hover:bg-emp-4/40"
                onClick={pickFile}
              >
                {expectedFileName}をドラッグ&ドロップしてプレビュー
              </div>
              <p class="text-xs text-gray-500">
                条件を編集した場合は再実行をクリックしてください。
              </p>
            </>
          ) : (
            <div class="grid gap-2">
              {done.ignored.length > 0 && (
                <p class="text-xs text-red-600">
                  次の条件はプレビューに反映されていません: {done.ignored.join(", ")}
                  (CSV の列だけでは評価できません)
                </p>
              )}
              {table}
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                <span class="whitespace-nowrap">
                  {done.rows.length === 0
                    ? "0–0"
                    : `${(start + 1).toLocaleString()}–${(start + pageRows.length).toLocaleString()}`}
                  {" / 全"}
                  {done.matched.toLocaleString()}件
                  {selected.size > 0 && ` (選択 ${selected.size} 行)`}
                </span>
                {/* 注記は伸ばして、ページ送りを右端へ押しやる */}
                <p class="flex-1 text-gray-500">
                  {done.truncated
                    ? `表には先頭 ${done.rows.length.toLocaleString()} 行のみ表示しています。`
                    : ""}
                  {expectedFileName}を新たにドロップすると差し替わります。
                </p>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="border border-gray-300 rounded px-2 py-0.5 hover:bg-emp-4 disabled:opacity-40"
                    disabled={page === 0}
                    onClick={() => goPage(Math.max(0, page - 1))}
                  >
                    ← 前へ
                  </button>
                  <button
                    type="button"
                    class="border border-gray-300 rounded px-2 py-0.5 hover:bg-emp-4 disabled:opacity-40"
                    disabled={page >= totalPages - 1}
                    onClick={() => goPage(Math.min(totalPages - 1, page + 1))}
                  >
                    次へ →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
