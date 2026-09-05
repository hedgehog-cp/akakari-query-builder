import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Query } from "../../model/types";
import type { Column } from "../../model/column";
import { runPreview } from "../../eval/preview-runner";
import type { BadEncoding } from "../../eval/encoding";

export type State =
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
export type Source = {
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

/** 走査の進み具合と、次に掛ける先。 */
export type Scan = {
  state: State;
  /** 落としたファイルそのもの。表示名と、対象を戻すために持つ。 */
  file: File | null;
  /** 次の走査を掛ける先。 */
  source: Source | null;
  /** その対象に条件を当て直す。 */
  run: (target: Source) => void;
  /** ファイルを受け取り、それを対象にして走らせる。 */
  accept: (f: File) => void;
  /** 結果を次の対象にするなど、対象だけを差し替える。 */
  setSource: (next: Source) => void;
  autoRun: boolean;
  setAutoRun: (on: boolean) => void;
};

/**
 * CSV に条件を当てる一連の流れ。走査はワーカーに任せ、進み具合を状態にして返す。
 *
 * onStart は走査を始めるたびに呼ぶ。見せている側がページや選択を畳むために使う。
 */
export function useScan(query: Query, columns: Column[], onStart: () => void): Scan {
  const header = useMemo(() => columns.map((c) => c.name), [columns]);
  const [file, setFile] = useState<File | null>(null);
  /** 次の走査を掛ける先。既定は落としたファイルそのもの。 */
  const [source, setSource] = useState<Source | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [autoRun, setAutoRun] = useState(false);
  /** 走っている走査を止める手。次の走査を始める前と、枠を閉じるときに呼ぶ。 */
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const run = (target: Source) => {
    stopRef.current?.();
    onStart();
    setState({ kind: "running", scanned: 0, matched: 0, bytes: 0 });
    stopRef.current = runPreview({
      query,
      header,
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
  // 「新しい列が届いた」= 切り替わったタイミングとして列カタログを見る。
  // 依存に state を入れると mismatch → 実行 → mismatch で回り続けるため入れない。
  // 成功済み(done)のときは自動再実行しない。数十万行の走査を切り替えのたびに
  // 始めてしまうため、そちらは「再実行」ボタンに任せる。
  useEffect(() => {
    if (state.kind === "mismatch" && source !== null) run(source);
  }, [columns]);

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
  }, [query, autoRun]);

  /** 受け取った時点で実行する。 */
  const accept = (f: File) => {
    setFile(f);
    const next: Source = { blob: f, label: f.name, narrowed: false };
    setSource(next);
    run(next);
  };

  return { state, file, source, run, accept, setSource, autoRun, setAutoRun };
}
