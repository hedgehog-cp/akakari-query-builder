import { useState } from "preact/hooks";
import type { Query } from "../model/types";
import { serializeQuery } from "../serialize/hjson";
import { toGoogleQuery } from "../serialize/gquery";
import { parseQuery, type ParseWarning } from "../parse/json";
import type { Column } from "../schema/catalog";

export function ResultPane(props: {
  query: Query;
  columns: Column[];
  onImport: (q: Query, warnings: ParseWarning[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"hjson" | "query">("hjson");
  const [includeDate, setIncludeDate] = useState(false);

  const columnNames = props.columns.map((c) => c.name);
  const hjsonText = serializeQuery(props.query);
  const gq = toGoogleQuery(props.query, props.columns, { includeDate });
  const text = tab === "hjson" ? hjsonText : gq.query;

  const importText = (raw: string) => {
    try {
      const r = parseQuery(raw, columnNames);
      setError(null);
      props.onImport(r.query, r.warnings);
    } catch (e) {
      // 読めなければ既存の編集内容を壊さない
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const pickFile = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".hjson,.json,application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f !== undefined) importText(await f.text());
    };
    input.click();
  };

  const download = () => {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "akakari-query.hjson";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
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
            onClick={() => void navigator.clipboard.writeText(text)}>コピー</button>
          <button type="button" class="border border-gray-300 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
            onClick={download}>ダウンロード</button>
          <button type="button" class="border border-gray-300 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
            onClick={() => void pickFile()}>JSON を読み込む</button>
        </div>
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
      <pre class="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-[60vh]">{text}</pre>
    </section>
  );
}
