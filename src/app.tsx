import { useEffect, useRef, useState } from "preact/hooks";
import { freshQuery, type Battle, type Query } from "./model/types";
import { validateQuery } from "./model/validate";
import { initHistory, pushHistory, redoHistory, undoHistory } from "./model/history";
import { fetchCatalog, type Column } from "./schema/fetch";
import { BattleSelect } from "./ui/battle-select";
import { DateSection } from "./ui/date-section";
import { ItemSection } from "./ui/item-section";
import { OutputSection } from "./ui/output-tree";
import { PreviewPane } from "./ui/preview-pane";
import { ResultPane } from "./ui/result-pane";
import { CollapsibleSection } from "./ui/collapsible";
import { TemplateDrawer } from "./ui/template-drawer";
import { Warnings } from "./ui/warnings";
import type { ParseWarning } from "./parse/json";
import { clearDraft, loadDraft, saveDraft } from "./storage/draft";
import { master } from "./master/load";

/** 一時的に画面から隠す機能。復活させる場合はここを true に戻すだけでよい。 */
const FEATURES = { itemSections: false };

const REPO = "https://github.com/hedgehog-cp/akakari-query-builder";

/** この時間内に続いた変更は1回の取り消しにまとめる。 */
const COALESCE_MS = 600;

/** 画面全体。クエリの状態を持ち、下書きの保存と列カタログの取得もここで受け持つ。 */
export function App() {
  const [restored] = useState(() => loadDraft());
  const [history, setHistory] = useState(() =>
    initHistory<Query>(restored?.query ?? freshQuery("akakari-hougeki")),
  );
  const query = history.present;
  const lastEditAt = useRef(0);

  /**
   * クエリを差し替える。短い間隔で続いた変更は1つの取り消し単位にまとめる。
   * 文字入力は1文字ごとに呼ばれるので、まとめないと Ctrl+Z が1文字ずつしか戻らない。
   */
  const setQuery = (next: Query) => {
    const now = Date.now();
    const coalesce = now - lastEditAt.current < COALESCE_MS;
    lastEditAt.current = now;
    setHistory((h) => pushHistory(h, next, coalesce));
  };

  // Ctrl+Z / Ctrl+Shift+Z(Ctrl+Y)で組み立て内容を戻す・やり直す。
  // 文字入力欄にカーソルがあるときはブラウザ既定の取り消しに任せる。そちらの
  // 取り消しも input イベントを起こすので、結果としてクエリにも反映される。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable) {
        return;
      }
      e.preventDefault();
      // 取り消しの直後の変更は必ず新しい履歴にする(まとめてしまうと戻せなくなる)。
      lastEditAt.current = 0;
      setHistory(key === "y" || e.shiftKey ? redoHistory : undoHistory);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const [restoredNotice, setRestoredNotice] = useState(restored !== null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [importWarnings, setImportWarnings] = useState<ParseWarning[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

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
    return () => {
      alive = false;
    };
  }, [query.battle, reloadKey]);

  const setBattle = (b: Battle) => setQuery({ ...query, battle: b });

  return (
    <main class="max-w-[1400px] mx-auto p-4 grid gap-3">
      <header class="flex items-center gap-2">
        <img src="./logo.png" alt="" class="h-10 w-auto shrink-0" />
        <span class="text-lg font-bold text-gray-800">赤仮クエリビルダー</span>
      </header>
      <TemplateDrawer battle={query.battle} query={query} onLoadTemplate={(q) => setQuery(q)} />
      {/* 通知・警告はクエリ欄の外に出した全幅の帯にする。左列に置くと文言が狭い幅で
          折り返すうえ、通知の有無で右の出力欄の開始位置がずれる。 */}
      <div class="grid gap-2 min-w-0">
        <p class="text-xs text-gray-400">マスタデータ最終更新: {master.generatedAt.slice(0, 10)}</p>
        {restoredNotice && (
          <p class="text-xs text-emp-1 bg-emp-4 rounded px-2 py-1 flex items-center gap-2">
            前回の続きを復元しました。
            <button
              type="button"
              class="text-xs underline"
              onClick={() => setRestoredNotice(false)}
            >
              閉じる
            </button>
            <button
              type="button"
              class="text-xs underline"
              onClick={() => {
                clearDraft();
                setQuery(freshQuery(query.battle));
                setRestoredNotice(false);
              }}
            >
              破棄
            </button>
          </p>
        )}
        {usingFallback && (
          <p class="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-1 flex items-center gap-2">
            列カタログの取得に失敗したため、同梱データを使用しています(最新でない可能性があります)。
            <button
              type="button"
              class="text-xs underline"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              再試行
            </button>
          </p>
        )}
        <Warnings validation={validateQuery(query, columns)} imports={importWarnings} />
      </div>
      {/* 入力の3枠と右の出力欄をひとつの外枠にまとめる。左右は同じグリッド行に
          並ぶので、既定の align-items:stretch により互いの高さが常に一致する。 */}
      <CollapsibleSection
        title="クエリ"
        class="border border-gray-300 rounded bg-bg-main p-2"
        bodyClass="grid gap-3 lg:grid-cols-2 min-w-0"
      >
        {/* 3枠目(出力)を 1fr にして余りを吸わせる。右の出力欄のほうが背が高い
            ときでも、出力枠が伸びて左右の下端が揃う。 */}
        <div class="grid gap-3 lg:grid-rows-[auto_auto_1fr] min-w-0">
          <BattleSelect value={query.battle} onChange={setBattle} />
          <DateSection
            ranges={query.dateRanges}
            onChange={(r) => setQuery({ ...query, dateRanges: r })}
          />
          <OutputSection
            node={query.output}
            columns={columns}
            onChange={(n) => setQuery({ ...query, output: n })}
          />
          {FEATURES.itemSections && (
            <>
              <ItemSection
                title="攻撃艦装備"
                node={query.attackerItems}
                onChange={(n) => setQuery({ ...query, attackerItems: n })}
              />
              <ItemSection
                title="防御艦装備"
                node={query.defenderItems}
                onChange={(n) => setQuery({ ...query, defenderItems: n })}
              />
            </>
          )}
        </div>
        <div class="grid min-w-0">
          <ResultPane
            query={query}
            columns={columns}
            onImport={(q, w) => {
              setQuery(q);
              setImportWarnings(w);
            }}
          />
        </div>
      </CollapsibleSection>
      <div class="min-w-0">
        <PreviewPane query={query} columns={columns} />
      </div>
      {/* 公開ページなので、データの扱いと権利表示への導線をここに置く。
          読み込んだ CSV が外へ出ないことは、外向きの通信が列カタログの取得
          1本しか無いことで担保している(テストで縛っている)。 */}
      <footer class="mt-2 pt-3 border-t border-gray-300 text-xs text-gray-500 grid gap-1">
        <p>
          読み込んだ CSV はブラウザの中だけで処理し、どこにも送信しません。
          ブラウザに保存するのはクエリの下書きと保存したテンプレートだけで、CSV
          の中身は保存しません。
        </p>
        <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            class="underline hover:text-gray-700"
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            class="underline hover:text-gray-700"
            href={`${REPO}/blob/main/LICENSE`}
            target="_blank"
            rel="noopener noreferrer"
          >
            MIT ライセンス
          </a>
          <a
            class="underline hover:text-gray-700"
            href={`${REPO}/blob/main/NOTICE.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            第三者データの帰属表示
          </a>
        </p>
        <p>
          非公式のツールです。「艦隊これくしょん -艦これ-」の権利は DMM GAMES / KADOKAWA GAMES
          に帰属します。
        </p>
      </footer>
    </main>
  );
}
