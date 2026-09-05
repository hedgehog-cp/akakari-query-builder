import { useEffect, useRef, useState } from "preact/hooks";
import type { Query } from "../model/types";
import { serializeQuery } from "../serialize/json";
import { toGoogleQuery } from "../serialize/gquery";
import { parseQuery, type ParseWarning } from "../parse/json";
import type { Column } from "../schema/catalog";
import { JsonEditor } from "./json-editor";

/**
 * 組み立てた結果を出す枠。テキストを直接編集すると、その内容をクエリに取り込む。
 *
 * JSON 欄の編集そのものはエディタの部品に任せる。構文強調・括弧の組・自動インデント・
 * 撤回・補完の窓を自前で持つと、折り返し位置の一致やカーソル位置の復元といった
 * 細かい破綻を延々と追うことになるため。
 */
export function ResultPane(props: {
  query: Query;
  columns: Column[];
  onImport: (q: Query, warnings: ParseWarning[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"json" | "query">("json");
  const [includeDate, setIncludeDate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [focused, setFocused] = useState(false);
  const [draftText, setDraftText] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const columnNames = props.columns.map((c) => c.name);
  const jsonText = serializeQuery(props.query);
  const gq = toGoogleQuery(props.query, props.columns, { includeDate });
  const droppedMessage =
    `次の条件は QUERY に反映されていません: ${gq.dropped.join(", ")}` +
    (gq.dropped.includes("攻撃艦装備") || gq.dropped.includes("防御艦装備")
      ? "。CSV で判定するには出力節の「装備スロット条件」を使ってください。"
      : "");
  const text = tab === "json" ? jsonText : gq.query;

  // ツリーUIでの編集結果は、JSON欄に焦点が無い間だけ反映する。
  // 編集中に上書きするとカーソル位置が壊れるため。
  // 焦点が無いときは表示内容が最新のクエリと一致している(=妥当)ことが
  // 保証されるので、古いエラー表示もここで一緒に消す。
  useEffect(() => {
    if (!focused) {
      setDraftText(text);
      setError(null);
    }
  }, [text, focused]);

  // アンマウント時に保留中のデバウンスタイマーを片付ける。
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);

  const applyText = (raw: string) => {
    try {
      const r = parseQuery(raw, columnNames);
      setError(null);
      props.onImport(r.query, r.warnings);
    } catch (e) {
      // 読めなければ既存の編集内容を壊さない
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file === undefined) return;
    // 打っている途中のデバウンスタイマーが残っていると、ドロップ直後の
    // 反映のあとにその古い入力内容でapplyTextが呼ばれ、
    // ドロップした内容を静かに上書きしてしまう。flushPendingと同様に
    // ここで確実にキャンセルする。
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const content = await file.text();
    setDraftText(content);
    applyText(content);
  };

  const handleEdit = (value: string) => {
    setDraftText(value);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyText(value), 400);
  };

  // 焦点が外れる瞬間に保留中の編集があれば即座に確定させる。
  // これをしないと、未反映のまま焦点が外れた場合に上の同期effectが
  // 古い(編集前の)テキストでdraftTextを上書きしてしまい、コピー・
  // ダウンロードボタンが編集直後の内容ではなく古い内容を読んでしまう。
  const flushPending = () => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      applyText(draftText);
    }
  };

  const pickFile = async () => {
    const input = document.createElement("input");
    input.type = "file";
    // 読むのは JSON だけだが、以前の版が .hjson で保存していたので拡張子は両方受ける。
    input.accept = ".json,.hjson,application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f !== undefined) {
        const content = await f.text();
        setDraftText(content);
        applyText(content);
      }
    };
    input.click();
  };

  return (
    <>
      {copied && (
        <div class="fixed top-5 left-1/2 -translate-x-1/2 bg-green-600 text-white text-sm px-4 py-2 rounded shadow-lg z-50">
          クリップボードにコピーしました
        </div>
      )}
      <section
        class="bg-bg-panel border border-gray-300 rounded p-3 flex flex-col h-full"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => void handleDrop(e)}
      >
        {/* 表示形式の切り替えと操作ボタンは1本の行に左詰めで並べる。右端に寄せると
          出力欄の幅によってボタンの位置が動き、目で追いにくいため。 */}
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <div class="flex flex-wrap items-center gap-3 border border-gray-300 rounded px-2 py-0.5">
            <label class="flex items-center gap-1">
              <input
                type="radio"
                name="output-format"
                checked={tab === "json"}
                onChange={() => setTab("json")}
              />
              JSON
            </label>
            <label class="flex items-center gap-1">
              <input
                type="radio"
                name="output-format"
                checked={tab === "query"}
                onChange={() => setTab("query")}
              />
              Google Visualization Query
            </label>
          </div>
          <button
            type="button"
            class="border border-gray-300 rounded px-2 py-0.5 hover:bg-emp-4"
            onClick={() => {
              void navigator.clipboard.writeText(tab === "json" ? draftText : text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            コピー
          </button>
          <button
            type="button"
            class="border border-gray-300 rounded px-2 py-0.5 hover:bg-emp-4"
            onClick={() => {
              // 出す中身に合わせて型と拡張子を変える。JSON 欄の中身は JSON そのもので、
              // HJSON 独自の記法は使わない。QUERY 欄は WHERE 句の素の文字列。
              const isJson = tab === "json";
              const blob = new Blob([isJson ? draftText : text], {
                type: isJson ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
              });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = isJson ? "akakari-query.json" : "akakari-query-where.txt";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            ダウンロード
          </button>
          <button
            type="button"
            class="border border-gray-300 rounded px-2 py-0.5 hover:bg-emp-4"
            onClick={() => void pickFile()}
          >
            JSON を読み込む
          </button>
          <span class="text-xs text-gray-500">
            JSONをドラッグ&ドロップして読み込み(HJSON独自の記法は読めません)
          </span>
        </div>
        {/* 警告欄は中身の有無にかかわらず1行ぶんの高さを確保しておく。編集のたびに
          出たり消えたりして下の枠が上下すると、打っている場所が動いて打ちづらい。
          長い文面は1行に収めて省略し、全文は title で読めるようにする。 */}
        <p
          class={`text-xs text-red-600 mb-1 h-4 leading-4 truncate ${error === null ? "invisible" : ""}`}
          title={error ?? undefined}
        >
          読み込めませんでした: {error}
        </p>
        {tab === "query" && (
          <div class="text-xs text-gray-600 mb-1 space-y-1">
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={includeDate}
                onChange={(e) => setIncludeDate((e.target as HTMLInputElement).checked)}
              />
              日時を QUERY に載せる(日付列が日時値として取り込まれている場合のみ効きます)
            </label>
            {/* 警告は条件をいじるたびに増えたり減ったりする。そのぶん下の枠が動くと
              画面が上下に揺れて読みづらいので、2行ぶんの高さを常に取っておき、
              溢れるぶんはこの中だけを繰る。1件は1行に収めて、全文は title で読む。 */}
            <div class="h-8 overflow-y-auto">
              {gq.dropped.length > 0 && (
                <p class="text-red-600 leading-4 truncate" title={droppedMessage}>
                  {droppedMessage}
                </p>
              )}
              {gq.warnings.map((w, i) => (
                <p key={i} class="text-amber-700 leading-4 truncate" title={w}>
                  {w}
                </p>
              ))}
            </div>
          </div>
        )}
        <div class={tab === "json" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
          <JsonEditor
            class="flex-1 min-h-[26rem] overflow-hidden rounded border border-gray-200"
            value={draftText}
            columns={props.columns}
            onChange={handleEdit}
            onFocusChange={(f) => {
              if (!f) flushPending();
              setFocused(f);
            }}
          />
        </div>
        <div class={tab === "query" ? "" : "hidden"}>
          <pre class="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-[60vh] w-full whitespace-pre-wrap break-words">
            {text}
          </pre>
        </div>
      </section>
    </>
  );
}
