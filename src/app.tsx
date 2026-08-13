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

export function App() {
  const [query, setQuery] = useState<Query>(emptyQuery("akakari-hougeki"));
  const [columns, setColumns] = useState<Column[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<ParseWarning[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setCatalogError(null);
    fetchCatalog(query.battle)
      .then((cols) => { if (alive) setColumns(cols); })
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
        {catalogError !== null && (
          <div class="border border-red-400 bg-red-50 rounded p-2 text-xs">
            <p class="text-red-700">列カタログを取得できませんでした: {catalogError}</p>
            <button type="button" class="border border-red-400 rounded px-2 py-0.5 mt-1"
              onClick={() => setReloadKey((k) => k + 1)}>再試行</button>
          </div>
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
        />
        <PreviewPane query={query} columns={columns} />
      </div>
    </main>
  );
}
