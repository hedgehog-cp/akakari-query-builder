import { useEffect, useRef, useState } from "preact/hooks";
import type { Query } from "../model/types";
import { serializeQuery } from "../serialize/hjson";
import { toGoogleQuery } from "../serialize/gquery";
import { parseQuery, type ParseWarning } from "../parse/json";
import type { Column } from "../schema/catalog";
import { deleteTemplate, listTemplates, saveTemplate, type Template } from "../storage/templates";

export function ResultPane(props: {
  query: Query;
  columns: Column[];
  onImport: (q: Query, warnings: ParseWarning[]) => void;
  onLoadTemplate: (q: Query) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"hjson" | "query">("hjson");
  const [includeDate, setIncludeDate] = useState(false);
  const [templates, setTemplates] = useState<Template[]>(() => listTemplates());
  const [templateName, setTemplateName] = useState("");
  const [copied, setCopied] = useState(false);
  const [focused, setFocused] = useState(false);
  const [draftText, setDraftText] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveAsTemplate = () => {
    const name = templateName.trim();
    if (name === "") return;
    setTemplates(saveTemplate(name, props.query.battle, props.query));
    setTemplateName("");
  };

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
    // 反映から最大400ms後にその古い入力内容でapplyTextが呼ばれ、
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
      <section class="bg-bg-panel border border-gray-300 rounded p-3">
      <div class="flex items-center gap-2 mb-2">
        <div class="flex gap-1">
          <button type="button"
            class={`border rounded px-2 py-0.5 text-xs ${tab === "hjson" ? "bg-emp-2 border-emp-1" : "border-gray-300 hover:bg-emp-4"}`}
            onClick={() => setTab("hjson")}>hjson</button>
          <button type="button"
            class={`border rounded px-2 py-0.5 text-xs ${tab === "query" ? "bg-emp-2 border-emp-1" : "border-gray-300 hover:bg-emp-4"}`}
            onClick={() => setTab("query")}>QUERY</button>
        </div>
        <div class="ml-auto flex gap-1">
          <button type="button" class="border border-gray-300 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
            onClick={() => {
              void navigator.clipboard.writeText(tab === "hjson" ? draftText : text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}>コピー</button>
          <button type="button" class="border border-gray-300 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
            onClick={() => {
              const blob = new Blob([tab === "hjson" ? draftText : text], { type: "application/json;charset=utf-8" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "akakari-query.hjson";
              a.click();
              URL.revokeObjectURL(a.href);
            }}>ダウンロード</button>
          <button type="button" class="border border-gray-300 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
            onClick={() => void pickFile()}>JSON を読み込む</button>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-1 mb-2 text-xs">
        <input type="text" class="border border-gray-300 rounded px-2 py-0.5 w-40"
          placeholder="テンプレート名"
          value={templateName}
          onInput={(e) => setTemplateName((e.target as HTMLInputElement).value)} />
        <button type="button" class="border border-emp-1 rounded px-2 py-0.5 hover:bg-emp-4 disabled:opacity-40"
          disabled={templateName.trim() === ""}
          onClick={saveAsTemplate}>
          名前を付けて保存
        </button>
        {templates.length > 0 && (
          <select class="border border-gray-300 rounded px-1 py-0.5"
            value=""
            onChange={(e) => {
              const name = (e.target as HTMLSelectElement).value;
              const t = templates.find((x) => x.name === name);
              if (t !== undefined) props.onLoadTemplate(t.query);
              (e.target as HTMLSelectElement).value = "";
            }}>
            <option value="" disabled>テンプレートを読み込む…</option>
            {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        )}
        {templates.length > 0 && (
          <select class="border border-gray-300 rounded px-1 py-0.5"
            value=""
            onChange={(e) => {
              const name = (e.target as HTMLSelectElement).value;
              if (name !== "" && confirm(`テンプレート「${name}」を削除しますか?`)) {
                setTemplates(deleteTemplate(name));
              }
              (e.target as HTMLSelectElement).value = "";
            }}>
            <option value="" disabled>テンプレートを削除…</option>
            {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        )}
      </div>
      {error !== null && (
        <p class="text-xs text-red-600 mb-1">読み込めませんでした: {error}</p>
      )}
      {tab === "query" && (
        <div class="text-xs text-gray-600 mb-1 space-y-1">
          <label class="flex items-center gap-1">
            <input type="checkbox" checked={includeDate}
              onChange={(e) => setIncludeDate((e.target as HTMLInputElement).checked)} />
            日時を QUERY に載せる(日付列が日時値として取り込まれている場合のみ効きます)
          </label>
          <p>列参照は <code>Col1</code> から始まる番号です。<code>QUERY()</code> の第2引数に貼ってください。</p>
          {gq.dropped.length > 0 && (
            <p class="text-red-600">
              次の条件は QUERY に反映されていません: {gq.dropped.join(", ")}
              {(gq.dropped.includes("攻撃艦装備") || gq.dropped.includes("防御艦装備")) &&
                "。CSV で判定するには出力節の「装備スロット条件」を使ってください。"}
            </p>
          )}
          {gq.warnings.map((w, i) => <p key={i} class="text-amber-700">{w}</p>)}
        </div>
      )}
      {tab === "hjson" ? (
        <textarea
          class="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-[60vh] w-full font-mono"
          rows={20}
          value={draftText}
          onFocus={() => setFocused(true)}
          onBlur={() => { flushPending(); setFocused(false); }}
          onInput={(e) => handleTextareaInput((e.target as HTMLTextAreaElement).value)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => void handleDrop(e)}
        />
      ) : (
        <pre class="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-[60vh]">{text}</pre>
      )}
      </section>
    </>
  );
}
