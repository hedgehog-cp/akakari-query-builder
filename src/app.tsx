import { useEffect, useState } from "preact/hooks";
import { emptyQuery, type Battle, type Query } from "./model/types";
import { validateQuery } from "./model/validate";
import { fetchCatalog, type Column } from "./schema/fetch";
import { BattleSelect } from "./ui/battle-select";
import { DateSection } from "./ui/date-section";
import { ItemSection } from "./ui/item-section";
import { OutputSection } from "./ui/output-tree";
import { PreviewPane } from "./ui/preview-pane";
import { ResultPane } from "./ui/result-pane";
import { Warnings } from "./ui/warnings";
import type { ParseWarning } from "./parse/json";
import { loadDraft, saveDraft } from "./storage/draft";
import { master } from "./master/load";

export function App() {
  const [restored] = useState(() => loadDraft());
  const [query, setQuery] = useState<Query>(restored?.query ?? emptyQuery("akakari-hougeki"));
  const [restoredNotice, setRestoredNotice] = useState(restored !== null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [importWarnings, setImportWarnings] = useState<ParseWarning[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => saveDraft({ battle: query.battle, query }), 500);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let alive = true;
    setCatalogError(null);
    fetchCatalog(query.battle)
      .then((r) => {
        if (!alive) return;
        setColumns(r.columns);
        setUsingFallback(r.usedFallback);
      })
      .catch((e: unknown) => {
        if (alive) setCatalogError(e instanceof Error ? e.message : String(e));
      });
    return () => { alive = false; };
  }, [query.battle, reloadKey]);

  const setBattle = (b: Battle) => setQuery({ ...query, battle: b });

  return (
    <main class="max-w-[1400px] mx-auto p-4 grid gap-3 lg:grid-cols-2">
      <div class="grid gap-3 content-start">
        <h1 class="text-base font-bold">赤仮CSV クエリビルダー</h1>
        <p class="text-xs text-gray-400">マスタデータ最終更新: {master.generatedAt.slice(0, 10)}</p>
        {restoredNotice && (
          <p class="text-xs text-emp-1 bg-emp-4 rounded px-2 py-1 flex items-center gap-2">
            前回の続きを復元しました。
            <button type="button" class="underline" onClick={() => setRestoredNotice(false)}>閉じる</button>
          </p>
        )}
        {catalogError !== null && (
          <div class="border border-red-400 bg-red-50 rounded p-2 text-xs">
            <p class="text-red-700">列カタログを取得できませんでした: {catalogError}</p>
            <button type="button" class="border border-red-400 rounded px-2 py-0.5 mt-1"
              onClick={() => setReloadKey((k) => k + 1)}>再試行</button>
          </div>
        )}
        {usingFallback && (
          <p class="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-1">
            列カタログの取得に失敗したため、同梱データを使用しています(最新でない可能性があります)。
          </p>
        )}
        <BattleSelect value={query.battle} onChange={setBattle} />
        <DateSection ranges={query.dateRanges} onChange={(r) => setQuery({ ...query, dateRanges: r })} />
        <OutputSection
          node={query.output}
          columns={columns}
          onChange={(n) => setQuery({ ...query, output: n })}
        />
        <ItemSection title="攻撃艦装備" node={query.attackerItems}
          onChange={(n) => setQuery({ ...query, attackerItems: n })} />
        <ItemSection title="防御艦装備" node={query.defenderItems}
          onChange={(n) => setQuery({ ...query, defenderItems: n })} />
      </div>
      <div class="grid gap-3 content-start">
        <Warnings validation={validateQuery(query, columns)} imports={importWarnings} />
        <ResultPane
          query={query}
          columns={columns}
          onImport={(q, w) => { setQuery(q); setImportWarnings(w); }}
          onLoadTemplate={(q) => setQuery(q)}
        />
        <PreviewPane query={query} columns={columns} />
      </div>
    </main>
  );
}
