import type { Battle } from "../model/types";
import { BATTLE_SCHEMA, SCHEMA_BASE } from "./generations";
import { toCatalog } from "./catalog";
import type { Column } from "../model/column";
import fallbackHougeki from "./fallback/akakari-hougeki.json";
import fallbackRaigeki from "./fallback/akakari-raigeki.json";
import fallbackMidnight from "./fallback/akakari-midnight.json";

/**
 * スキーマの配信元。akakari-schema が安定URLで配る Table Schema 本体を参照する。
 *
 *   {BASE}/tableschema/{世代ID}.schema.json
 *
 * 以前は画面用に変換された別のJSONを見ていたが、向こうがその変換ごと廃止して
 * 404になり、気づかないまま同梱データで動き続けていた。取得先が生きているかは
 * CI の死活確認で見る。
 */
const BASE: string = import.meta.env.VITE_SCHEMA_BASE ?? SCHEMA_BASE;

/** ネットワーク取得に失敗したときの同梱データ。`npm run update:schema-fallback` で更新する。 */
const FALLBACK: Record<Battle, unknown> = {
  "akakari-hougeki": fallbackHougeki,
  "akakari-raigeki": fallbackRaigeki,
  "akakari-midnight": fallbackMidnight,
};

const cache = new Map<Battle, Column[]>();

/** その戦闘種別の列カタログのURL。 */
export function schemaUrl(battle: Battle): string {
  return `${BASE}/tableschema/${BATTLE_SCHEMA[battle]}.schema.json`;
}

/**
 * 列カタログを取り、画面が使う形にして返す。一度取れば戦闘種別ごとに覚える。
 * 取得に失敗したときは同梱データで代替し、そのことを usedFallback で知らせる。
 */
export async function fetchCatalog(
  battle: Battle,
): Promise<{ columns: Column[]; usedFallback: boolean }> {
  const hit = cache.get(battle);
  if (hit !== undefined) return { columns: hit, usedFallback: false };
  const url = schemaUrl(battle);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const cols = toCatalog(await res.json());
    cache.set(battle, cols);
    return { columns: cols, usedFallback: false };
  } catch {
    const cols = toCatalog(FALLBACK[battle]);
    return { columns: cols, usedFallback: true };
  }
}
