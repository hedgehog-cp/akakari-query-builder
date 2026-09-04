import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { BATTLE_LABEL, type Query } from "../model/types";
import type { Column } from "../schema/catalog";
import { runPreview } from "../eval/preview-runner";
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
      /** 一致した行の CSV(UTF-8 BOM付き・CRLF)。走査の範囲ごとに分かれている。 */
      csv: ArrayBuffer[];
      ignored: string[];
    }
  | { kind: "error"; message: string };

/**
 * 走査の対象。落としたファイルのほか、直前の結果を対象にして更に絞ることもできる。
 * 結果は元のCSVと同じ形のバイト列なので、そのまま次の走査に掛けられる。
 */
type Source = {
  blob: Blob;
  /** 画面に出す名前。 */
  label: string;
  /** 直前の結果を対象にしているか。 */
  narrowed: boolean;
};

/**
 * 条件を変えてから自動で走らせ直すまでの待ち。条件は打鍵のたびに変わるので、
 * 手が止まるのを待ってからまとめて1回にする。
 */
const AUTO_RUN_DELAY_MS = 400;

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

function download(body: string | ArrayBuffer[], name: string, type: string): void {
  const blob = new Blob(Array.isArray(body) ? body : [body], { type });
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
function useCsvText(csv: ArrayBuffer[] | null): () => string {
  const cache = useRef<{ csv: ArrayBuffer[] | null; text: string }>({ csv: null, text: "" });
  return useCallback(() => {
    if (csv === null) return "";
    if (cache.current.csv !== csv) {
      // 範囲の切れ目は行の切れ目なので、範囲ごとに復号してつなげてよい。
      const dec = new TextDecoder("utf-8");
      cache.current = { csv, text: csv.map((part) => dec.decode(part)).join("") };
    }
    return cache.current.text;
  }, [csv]);
}

/** 表のうち実際に作る範囲。行も列も、見えている分とその少し外だけを作る。 */
type Window = { rowFirst: number; rowLast: number; colFirst: number; colLast: number };

function sameWindow(a: Window, b: Window): boolean {
  return (
    a.rowFirst === b.rowFirst &&
    a.rowLast === b.rowLast &&
    a.colFirst === b.colFirst &&
    a.colLast === b.colLast
  );
}

/**
 * 見えている範囲から、作る行と列を決める。
 *
 * 1ページは200行×百数十列で、素直に作ると升目が3万を超える。作る数がそのまま
 * ページを繰る待ち時間になるので、画面に入る分(と少しの余分)だけを作る。
 * 残りは、間を空ける升目1つで場所だけ取っておく。
 */
function windowOf(el: HTMLElement, offsets: number[], rowCount: number): Window {
  const rowFirst = Math.max(0, Math.floor(el.scrollTop / ROW_HEIGHT) - ROW_MARGIN);
  const rowLast = Math.min(
    rowCount - 1,
    Math.ceil((el.scrollTop + el.clientHeight) / ROW_HEIGHT) + ROW_MARGIN,
  );
  const left = el.scrollLeft;
  const right = left + el.clientWidth;
  // 左端の列は貼り付けてあるので、探すのは2列目から。
  let colFirst = offsets.length - 1;
  let colLast = 1;
  for (let j = 1; j < offsets.length - 1; j++) {
    if (offsets[j + 1] > left && offsets[j] < right) {
      if (j < colFirst) colFirst = j;
      if (j > colLast) colLast = j;
    }
  }
  return {
    rowFirst,
    rowLast,
    colFirst: Math.max(1, colFirst - COL_MARGIN),
    colLast: Math.min(offsets.length - 2, colLast + COL_MARGIN),
  };
}

/** canvas に渡す字の指定。font 一括の値を返さないブラウザのために組み立て直す。 */
function fontOf(el: Element): string {
  const style = getComputedStyle(el);
  if (style.font !== "") return style.font;
  return `${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`;
}

/**
 * 表の1行の高さ(px)。行の位置を数で出せるように決め打ちにする。
 * 中身は1行の字なので、この高さで収まる。
 */
const ROW_HEIGHT = 20;

/**
 * 画面の外にも作っておく行数と列数。少しはみ出して持っておくと、
 * 送るたびに作り直さずに済む。
 */
const ROW_MARGIN = 10;
const COL_MARGIN = 4;

/** 升目の左右の余白(px-1 の2つぶん)。測った字幅にこれを足して列の幅にする。 */
const CELL_PADDING = 9;

/** 幅を測るためだけの canvas。作り直さずに使い回す。 */
let ruler: CanvasRenderingContext2D | null = null;

/** 全角は2文字ぶんとして数える。どの値が一番長いかの当たりを付けるのに使う。 */
function weightedLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) n += s.charCodeAt(i) < 0x80 ? 1 : 2;
  return n;
}

/**
 * 列ごとの幅(px)を決める。
 *
 * 幅を決めずに表を描くと、ブラウザは列の幅を決めるために升目を全部測る。1ページは
 * 200行×百数十列あるので、これがページを繰るたびの待ち時間になる。こちらで幅を
 * 決めて table-layout: fixed にすれば、その測り直しが無くなる。
 *
 * 幅は表に出しうる行(先頭1万行)から取るので、表示中に字が切れることはない。
 * 列ごとに一番長い値だけを実際の字幅で測る(全部測ると数百万回になる)。
 */
function measureColumns(header: string[], rows: string[][], head: string, body: string): number[] {
  if (ruler === null) ruler = document.createElement("canvas").getContext("2d");
  const ctx = ruler;
  if (ctx === null) return [];

  const longest = header.map(() => "");
  const lengths = header.map(() => -1);
  for (const row of rows) {
    for (let j = 0; j < row.length && j < header.length; j++) {
      const n = weightedLength(row[j]);
      if (n > lengths[j]) {
        lengths[j] = n;
        longest[j] = row[j];
      }
    }
  }

  ctx.font = head;
  const widths = header.map((name) => ctx.measureText(name).width);
  ctx.font = body;
  return widths.map((w, j) =>
    Math.ceil(
      Math.max(w, longest[j] === "" ? 0 : ctx.measureText(longest[j]).width) + CELL_PADDING,
    ),
  );
}

/**
 * Shift を押しながらのホイールを横スクロールにする。列が百を超えるので、
 * 横に送る手段が要る。ブラウザ任せだと縦に流れるものがあるため自分で送る。
 */
function scrollSideways(e: WheelEvent): void {
  if (!e.shiftKey || e.deltaY === 0) return;
  const el = e.currentTarget as HTMLElement;
  if (el.scrollWidth <= el.clientWidth) return;
  el.scrollLeft += e.deltaY;
  e.preventDefault();
}

/** 手元の CSV に条件を当てて結果を見せる枠。走査はワーカーで行う。 */
export function PreviewPane(props: { query: Query; columns: Column[] }) {
  const [file, setFile] = useState<File | null>(null);
  /** 次の走査を掛ける先。既定は落としたファイルそのもの。 */
  const [source, setSource] = useState<Source | null>(null);
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
  /** 条件を変えるたびに走らせ直すか。 */
  const [autoRun, setAutoRun] = useState(false);
  /** 走っている走査を止める手。次の走査を始める前と、枠を閉じるときに呼ぶ。 */
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const expectedFileName = `${BATTLE_LABEL[props.query.battle]}.csv`;

  const clearSelection = () => {
    setSelected(new Set());
    setAnchor(null);
  };

  const run = (target: Source) => {
    stopRef.current?.();
    setPage(0);
    clearSelection();
    setState({ kind: "running", scanned: 0, matched: 0, bytes: 0 });
    stopRef.current = runPreview({
      query: props.query,
      header: props.columns.map((c) => c.name),
      file: target.blob,
      onEvent: (m) => {
        if (m.type === "progress")
          setState({ kind: "running", scanned: m.scanned, matched: m.matched, bytes: m.bytes });
        else if (m.type === "header-mismatch")
          setState({ kind: "mismatch", missing: m.missing, extra: m.extra });
        else if (m.type === "bad-encoding")
          setState({ kind: "bad-encoding", encoding: m.encoding });
        else if (m.type === "done") setState({ kind: "done", ...m });
        else setState({ kind: "error", message: m.message });
      },
    });
  };

  // 戦闘種別が違うために弾かれた CSV は、正しい戦闘種別に切り替えた時点で
  // 自動的に走らせ直す。列カタログは戦闘種別ごとに取り直されるので、
  // 「新しい列が届いた」= 切り替わったタイミングとして props.columns を見る。
  // 依存に state を入れると mismatch → 実行 → mismatch で回り続けるため入れない。
  // 成功済み(done)のときは自動再実行しない。数十万行の走査を切り替えのたびに
  // 始めてしまうため、そちらは「再実行」ボタンに任せる。
  useEffect(() => {
    if (state.kind === "mismatch" && source !== null) run(source);
  }, [props.columns]);

  // 条件を変えたら走らせ直す。数十万行の走査を打鍵のたびに始めないよう、
  // 手が止まってからまとめて1回にする。既定では走らせず、チェックで有効にする。
  const sourceRef = useRef<Source | null>(null);
  sourceRef.current = source;
  useEffect(() => {
    if (!autoRun) return;
    const timer = setTimeout(() => {
      const target = sourceRef.current;
      if (target !== null) run(target);
    }, AUTO_RUN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [props.query, autoRun]);

  /** 受け取った時点で実行する。 */
  const accept = (f: File) => {
    setFile(f);
    const next: Source = { blob: f, label: f.name, narrowed: false };
    setSource(next);
    run(next);
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
    // ページを繰ったら先頭から見せる。縦の位置が残っていると、
    // 作る行を決める計算も前のページの位置のままになる。
    if (scrollRef.current !== null) scrollRef.current.scrollTop = 0;
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
  // 列の幅。結果ごとに1度だけ測り、以降のページはこの幅で描く。
  // 字幅は、字の指定だけを同じにした見えない見本から読む(本体を測る必要はない)。
  const probeRef = useRef<HTMLTableElement>(null);
  const [widths, setWidths] = useState<{ done: unknown; px: number[] } | null>(null);
  useLayoutEffect(() => {
    if (done === null || widths?.done === done) return;
    const el = probeRef.current;
    if (el === null) return;
    const head = fontOf(el.querySelector("th") ?? el);
    const body = fontOf(el.querySelector("td") ?? el);
    setWidths({ done, px: measureColumns(done.header, done.rows, head, body) });
  }, [done, widths]);
  const colWidths = done !== null && widths?.done === done ? widths.px : null;

  /** 列の左端の位置。境目を探すのに使う。 */
  const colOffsets = useMemo(() => {
    if (colWidths === null) return null;
    const xs = [0];
    for (const w of colWidths) xs.push(xs[xs.length - 1] + w);
    return xs;
  }, [colWidths]);

  // 表を送るたびに、作る範囲を出し直す。範囲が変わらないうちは作り直さない。
  const scrollRef = useRef<HTMLDivElement>(null);
  const [window_, setWindow] = useState<Window>({
    rowFirst: 0,
    rowLast: -1,
    colFirst: 1,
    colLast: 0,
  });
  const windowRef = useRef(window_);
  const pending = useRef(false);
  const syncWindow = useCallback(() => {
    const el = scrollRef.current;
    if (el === null || colOffsets === null || done === null) return;
    const rows = Math.min(PAGE_SIZE, done.rows.length - page * PAGE_SIZE);
    const next = windowOf(el, colOffsets, rows);
    if (sameWindow(windowRef.current, next)) return;
    windowRef.current = next;
    setWindow(next);
  }, [colOffsets, done, page]);
  // 送っている間は毎回ではなく、次に描く直前に1度だけ数え直す。
  const onScroll = () => {
    if (pending.current) return;
    pending.current = true;
    requestAnimationFrame(() => {
      pending.current = false;
      syncWindow();
    });
  };
  useLayoutEffect(syncWindow, [syncWindow]);

  // 表は数万セルあり、素直に書くと開閉やコピー通知など無関係な再描画のたびに
  // Preact がその全セルを差分計算してしまう。行データ・ページ・選択が変わらない
  // 限り同じ vnode を返せば、Preact はその部分木の差分計算ごと省略する。
  const table = useMemo(() => {
    if (done === null) return null;
    const from = page * PAGE_SIZE;
    const rows = done.rows.slice(from, from + PAGE_SIZE);
    const w = window_;
    // 幅がまだ測れていない間は、字幅を読むための見本だけを描く。
    const ready = colWidths !== null;
    const header = done.header;
    /** 左端の列・間を空ける升目・見えている列、の順に並べる。 */
    const cellsOf = <T,>(make: (j: number) => T, gap: T): T[] => {
      const out = [make(0)];
      if (w.colFirst > 1) out.push(gap);
      for (let j = w.colFirst; j <= w.colLast; j++) out.push(make(j));
      return out;
    };
    const above = w.rowFirst * ROW_HEIGHT;
    const below = Math.max(0, (rows.length - 1 - w.rowLast) * ROW_HEIGHT);

    return (
      // 列が多いため横スクロールはこのコンテナだけが持つ(ページ全体を横に伸ばさない)。
      <div
        ref={scrollRef}
        class="contain-layout overflow-auto max-h-[600px] border border-gray-300 rounded"
        onWheel={scrollSideways}
        onScroll={onScroll}
      >
        {/* 字幅を測るためだけの見本。見えないが、字の指定は表の升目と同じにする。 */}
        <table
          ref={probeRef}
          aria-hidden="true"
          class="text-xs absolute invisible pointer-events-none"
        >
          <tbody>
            <tr>
              <th class="font-bold">0</th>
              <td>0</td>
            </tr>
          </tbody>
        </table>
        {ready && (
          // 罫線を離した表にするのは、貼り付けた列の境の影が
          // border-collapse では塗られないため。間隔は 0 にして見た目は変えない。
          <table
            class="text-xs table-fixed border-separate border-spacing-0"
            style={{ width: `${colWidths.reduce((a, b) => a + b, 0)}px` }}
          >
            <colgroup>
              {colWidths.map((width, j) => (
                <col key={j} style={{ width: `${width}px` }} />
              ))}
            </colgroup>
            {/* 見出しは上に、左端の列は横に貼り付ける。重なりは
                左上の角 > 見出し > 左端の列 の順で、下を隠す側が上に来る。 */}
            <thead class="bg-gray-200 sticky top-0 z-20">
              <tr>
                {cellsOf(
                  (j) => (
                    <th
                      key={header[j]}
                      class={`px-1 text-left whitespace-nowrap font-bold overflow-hidden text-ellipsis ${
                        j === 0 ? "sticky left-0 z-30 bg-gray-200 pinned-col" : ""
                      }`}
                    >
                      {header[j]}
                    </th>
                  ),
                  <th key="gap" colSpan={w.colFirst - 1} />,
                )}
              </tr>
            </thead>
            {/* 行クリックで選択。Ctrl(Cmd)で追加/解除、Shiftで範囲。
                Shiftクリックでの文字列選択が邪魔になるので select-none。 */}
            <tbody class="select-none">
              {above > 0 && (
                <tr style={{ height: `${above}px` }}>
                  <td colSpan={header.length} />
                </tr>
              )}
              {rows.slice(w.rowFirst, w.rowLast + 1).map((r, i) => {
                const index = from + w.rowFirst + i;
                const on = selected.has(index);
                return (
                  <tr
                    key={index}
                    style={{ height: `${ROW_HEIGHT}px` }}
                    // 縞は行の番号で決める。作る行を絞っているので、tbody の中の
                    // 並び(odd/even)で決めると送るたびに縞がずれる。
                    // 色を透かさないのは、左端の列がこの色を受け継ぐため。透けていると
                    // 下を流れる列の字が見えてしまう。
                    class={`cursor-pointer ${
                      on
                        ? "bg-emp-2"
                        : `hover:bg-emp-4 ${index % 2 === 1 ? "bg-gray-50" : "bg-bg-panel"}`
                    }`}
                    onMouseDown={(e) => selectRow(e as MouseEvent, index)}
                  >
                    {cellsOf(
                      (j) => (
                        <td
                          key={j}
                          class={`px-1 whitespace-nowrap overflow-hidden text-ellipsis ${
                            j === 0 ? "sticky left-0 z-10 bg-inherit pinned-col" : ""
                          }`}
                        >
                          {r[j]}
                        </td>
                      ),
                      <td key="gap" colSpan={w.colFirst - 1} />,
                    )}
                  </tr>
                );
              })}
              {below > 0 && (
                <tr style={{ height: `${below}px` }}>
                  <td colSpan={header.length} />
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    );
  }, [done, page, colWidths, window_, selected, selectRow, onScroll]);

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
    state.kind === "running" && source !== null && source.blob.size > 0
      ? Math.min(100, Math.round((state.bytes / source.blob.size) * 100))
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
          {(source !== null || done !== null) && (
            <div class="flex flex-wrap items-baseline gap-4 text-xs text-gray-500">
              {source !== null && <span>{source.label}</span>}
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
                const csv: string | ArrayBuffer[] =
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
            {source !== null && (
              <button
                type="button"
                class="border border-emp-1 rounded px-2 py-0.5 hover:bg-emp-4"
                onClick={() => run(source)}
              >
                再実行
              </button>
            )}
            {done !== null && done.matched > 0 && source !== null && !source.narrowed && (
              <button
                type="button"
                class="border border-gray-300 rounded px-2 py-0.5 hover:bg-emp-4"
                onClick={() => {
                  setSource({
                    blob: new Blob(done.csv),
                    label: `${file?.name ?? source.label} を絞り込んだ ${done.matched.toLocaleString()} 行`,
                    narrowed: true,
                  });
                }}
              >
                この結果を次の対象にする
              </button>
            )}
            <label class="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRun}
                onChange={(e) => setAutoRun((e.target as HTMLInputElement).checked)}
              />
              条件を変えたら自動で実行
            </label>
          </div>
          {source !== null && source.narrowed && (
            <p class="text-xs text-emp-1 bg-emp-4 rounded px-2 py-1 flex flex-wrap items-center gap-2">
              いまはこの結果を対象に実行します。条件を緩めても、ここに残っていない行は戻りません。
              {file !== null && (
                <button
                  type="button"
                  class="underline"
                  onClick={() => setSource({ blob: file, label: file.name, narrowed: false })}
                >
                  ファイル全体に戻す
                </button>
              )}
            </p>
          )}

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
