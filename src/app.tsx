import { useEffect, useRef, useState } from "preact/hooks";
import { freshQuery, type Battle, type Query } from "./model/types";
import { validateQuery } from "./model/validate";
import { fetchCatalog, type Column } from "./schema/fetch";
import { BattleSelect } from "./ui/battle-select";
import { DateSection } from "./ui/date-section";
import { ItemSection } from "./ui/item-section";
import { OutputSection } from "./ui/output-tree";
import { PreviewPane } from "./ui/preview-pane";
import { ResultPane } from "./ui/result-pane";
import { TemplateDrawer } from "./ui/template-drawer";
import { Warnings } from "./ui/warnings";
import type { ParseWarning } from "./parse/json";
import { clearDraft, loadDraft, saveDraft } from "./storage/draft";
import { master } from "./master/load";

/** 一時的に画面から隠す機能。復活させる場合はここを true に戻すだけでよい。 */
const FEATURES = { itemSections: false };

export function App() {
  const [restored] = useState(() => loadDraft());
  const [query, setQuery] = useState<Query>(restored?.query ?? freshQuery("akakari-hougeki"));
  const [restoredNotice, setRestoredNotice] = useState(restored !== null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [importWarnings, setImportWarnings] = useState<ParseWarning[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const matchRef = useRef<HTMLDivElement>(null);
  const [matchHeight, setMatchHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = matchRef.current;
    if (el === null) return;
    const observer = new ResizeObserver(() => {
      // contentRect は padding/border を含まない content-box のサイズ。右の出力欄は
      // border-box で高さを指定するので、外枠の padding も含む実測値を渡す。
      setMatchHeight(el.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => saveDraft({ battle: query.battle, query }), 500);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let alive = true;
    fetchCatalog(query.battle).then((r) => {
      if (!alive) return;
      setColumns(r.columns);
      setUsingFallback(r.usedFallback);
    });
    return () => { alive = false; };
  }, [query.battle, reloadKey]);

  const setBattle = (b: Battle) => setQuery({ ...query, battle: b });

  return (
    <main class="max-w-[1400px] mx-auto p-4 grid gap-3 lg:grid-cols-2">
      <header class="lg:col-span-2 flex items-center gap-2">
        <img src="./logo.png" alt="kcverify" class="h-10 w-auto shrink-0" />
        <span class="text-lg font-bold text-gray-800">赤仮クエリビルダー</span>
      </header>
      <TemplateDrawer battle={query.battle} query={query} onLoadTemplate={(q) => setQuery(q)} />
      {/* 通知・警告は左右どちらの列にも属さない全幅の帯にする。左列に置くと
          文言が狭い幅で折り返すうえ、通知の有無で右の出力欄の開始位置がずれる。 */}
      <div class="lg:col-span-2 grid gap-2 min-w-0">
        <p class="text-xs text-gray-400">マスタデータ最終更新: {master.generatedAt.slice(0, 10)}</p>
        {restoredNotice && (
          <p class="text-xs text-emp-1 bg-emp-4 rounded px-2 py-1 flex items-center gap-2">
            前回の続きを復元しました。
            <button type="button" class="text-xs underline" onClick={() => setRestoredNotice(false)}>閉じる</button>
            <button type="button" class="text-xs underline" onClick={() => {
              clearDraft();
              setQuery(freshQuery(query.battle));
              setRestoredNotice(false);
            }}>破棄</button>
          </p>
        )}
        {usingFallback && (
          <p class="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-1 flex items-center gap-2">
            列カタログの取得に失敗したため、同梱データを使用しています(最新でない可能性があります)。
            <button type="button" class="text-xs underline" onClick={() => setReloadKey((k) => k + 1)}>再試行</button>
          </p>
        )}
        <Warnings validation={validateQuery(query, columns)} imports={importWarnings} />
      </div>
      <div class="grid gap-3 content-start min-w-0">
        {/* 3枚をひとつの枠にまとめ、右の出力欄と1対1で向き合って見えるようにする。 */}
        <div ref={matchRef} class="border border-gray-300 rounded bg-bg-main p-2 grid gap-2 content-start">
          <BattleSelect value={query.battle} onChange={setBattle} />
          <DateSection ranges={query.dateRanges} onChange={(r) => setQuery({ ...query, dateRanges: r })} />
          <OutputSection
            node={query.output}
            columns={columns}
            onChange={(n) => setQuery({ ...query, output: n })}
          />
        </div>
        {FEATURES.itemSections && (
          <>
            <ItemSection title="攻撃艦装備" node={query.attackerItems}
              onChange={(n) => setQuery({ ...query, attackerItems: n })} />
            <ItemSection title="防御艦装備" node={query.defenderItems}
              onChange={(n) => setQuery({ ...query, defenderItems: n })} />
          </>
        )}
      </div>
      <div class="grid gap-3 content-start min-w-0">
        <ResultPane
          query={query}
          columns={columns}
          matchHeight={matchHeight}
          onImport={(q, w) => { setQuery(q); setImportWarnings(w); }}
        />
      </div>
      <div class="lg:col-span-2 min-w-0">
        <PreviewPane query={query} columns={columns} />
      </div>
    </main>
  );
}
