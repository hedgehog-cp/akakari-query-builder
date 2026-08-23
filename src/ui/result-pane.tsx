import { useEffect, useRef, useState } from "preact/hooks";
import type { Query } from "../model/types";
import { serializeQuery } from "../serialize/hjson";
import { toGoogleQuery } from "../serialize/gquery";
import { parseQuery, type ParseWarning } from "../parse/json";
import type { Column } from "../schema/catalog";
import { JsonHighlight } from "./json-highlight";

/**
 * 組み立てた結果を出す枠。テキストを直接編集すると、その内容をクエリに取り込む。
 *
 * 構文強調は「色付きの pre の上に文字色を透明にした textarea を重ねる」よくある手だが、
 * 編集中は選択の反転色が下の pre を覆って読めなくなるうえ、折り返しが少しでもずれると
 * 見えている文字と実際の文字がずれてクリック位置も合わなくなる。そのためフォーカス中は
 * 重ね合わせをやめ、普通に色の付いた textarea として編集させる。
 */
export function ResultPane(props: {
  query: Query;
  columns: Column[];
  onImport: (q: Query, warnings: ParseWarning[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"hjson" | "query">("hjson");
  const [includeDate, setIncludeDate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [focused, setFocused] = useState(false);
  const [draftText, setDraftText] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preSize, setPreSize] = useState<{
    width: number;
    height: number;
    gutter: number;
  } | null>(null);
  const [resizedHeight, setResizedHeight] = useState<string | null>(null);

  // textarea をネイティブのリサイズハンドルで手動拡大しても、構文強調の黒背景(pre)が
  // CSSクラスだけでは追従しないため、実測してインラインstyleで直接反映する。
  //
  // 同時に、pre と textarea は内容の幅が1文字でもずれると折り返し位置が食い違い、
  // 色付きの文字と実際の文字が段々ずれて読めなくなる。textarea はスクロールバーの
  // ぶんだけ内容が狭いので、その幅を測って pre の右padding に足して揃える。
  // (textarea 側は scrollbar-gutter: stable で幅を常に一定にしてある)
  useEffect(() => {
    const el = textareaRef.current;
    if (el === null) return;
    const observer = new ResizeObserver(() => {
      // contentRect は padding/border を含まない content-box のサイズなので、
      // border-box(Tailwind の既定)で height/width を直接指定するには使えない。
      // getBoundingClientRect() の border-box サイズをそのまま使う。
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      // offsetWidth(枠込み) - clientWidth(枠とスクロールバーを除く) - 枠 = スクロールバー幅。
      const gutter =
        el.offsetWidth -
        el.clientWidth -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth);
      setPreSize({ width: rect.width, height: rect.height, gutter: Math.max(0, gutter) });
      // 普段の高さは左の入力欄と揃うようグリッド側(flex-1)が決めるので、
      // textarea 自身は h-full で追従するだけ。ただし手動リサイズしたときだけは
      // インラインの height が付くため、それを枠の下限として親に伝え、
      // 外側(=左の3枠)も一緒に伸び縮みするようにする。
      setResizedHeight(el.style.height === "" ? null : el.style.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const columnNames = props.columns.map((c) => c.name);
  const hjsonText = serializeQuery(props.query);
  const gq = toGoogleQuery(props.query, props.columns, { includeDate });
  const text = tab === "hjson" ? hjsonText : gq.query;

  // ツリーUIでの編集結果は、テキストエリアが未フォーカスの間だけ反映する。
  // フォーカス中に上書きするとカーソル位置が壊れるため。
  // 未フォーカス時は表示内容が最新のクエリと一致している(=妥当)ことが
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
    // タイピング中のデバウンスタイマーが残っていると、ドロップ直後の
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

  const handleTextareaInput = (value: string) => {
    setDraftText(value);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyText(value), 400);
  };

  // フォーカスが外れる瞬間に保留中の編集があれば即座に確定させる。
  // これをしないと、未反映のままフォーカスが外れた場合に上の同期effectが
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
    input.accept = ".hjson,.json,application/json";
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
                checked={tab === "hjson"}
                onChange={() => setTab("hjson")}
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
              void navigator.clipboard.writeText(tab === "hjson" ? draftText : text);
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
              const blob = new Blob([tab === "hjson" ? draftText : text], {
                type: "application/json;charset=utf-8",
              });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "akakari-query.hjson";
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
          <span class="text-xs text-gray-500">JSONをドラッグ&ドロップして読み込み</span>
        </div>
        {error !== null && <p class="text-xs text-red-600 mb-1">読み込めませんでした: {error}</p>}
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
            {gq.dropped.length > 0 && (
              <p class="text-red-600">
                次の条件は QUERY に反映されていません: {gq.dropped.join(", ")}
                {(gq.dropped.includes("攻撃艦装備") || gq.dropped.includes("防御艦装備")) &&
                  "。CSV で判定するには出力節の「装備スロット条件」を使ってください。"}
              </p>
            )}
            {gq.warnings.map((w, i) => (
              <p key={i} class="text-amber-700">
                {w}
              </p>
            ))}
          </div>
        )}
        <div class={tab === "hjson" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
          <div
            class="relative flex-1 min-h-[26rem]"
            style={resizedHeight !== null ? { minHeight: resizedHeight } : undefined}
          >
            <pre
              ref={preRef}
              aria-hidden="true"
              class={`pointer-events-none absolute inset-0 m-0 text-xs bg-[#1e1e1e] rounded p-2 overflow-hidden h-full w-full font-mono whitespace-pre-wrap break-words border border-transparent ${
                focused ? "invisible" : ""
              }`}
              style={
                preSize !== null
                  ? {
                      height: `${preSize.height}px`,
                      width: `${preSize.width}px`,
                      // p-2 の 0.5rem にスクロールバーぶんを足す。
                      paddingRight: `calc(0.5rem + ${preSize.gutter}px)`,
                    }
                  : undefined
              }
            >
              <JsonHighlight text={draftText} />
            </pre>
            <textarea
              ref={textareaRef}
              class={`relative text-xs border border-gray-200 rounded p-2 overflow-auto [scrollbar-gutter:stable] h-full w-full font-mono whitespace-pre-wrap break-words caret-gray-100 ${
                focused ? "bg-[#1e1e1e] text-gray-100" : "bg-transparent text-transparent"
              }`}
              value={draftText}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                flushPending();
                setFocused(false);
              }}
              onInput={(e) => handleTextareaInput((e.target as HTMLTextAreaElement).value)}
              onScroll={(e) => {
                const el = e.target as HTMLTextAreaElement;
                if (preRef.current !== null) {
                  preRef.current.scrollTop = el.scrollTop;
                  preRef.current.scrollLeft = el.scrollLeft;
                }
              }}
            />
          </div>
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
