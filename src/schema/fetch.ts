import { BATTLE_SCHEMA, type Battle } from "../model/types";
import { toCatalog, type Column } from "./catalog";
import fallbackHougeki from "./fallback/akakari-hougeki-2024-07-20.json";
import fallbackRaigeki from "./fallback/akakari-raigeki-2024-07-20.json";
import fallbackMidnight from "./fallback/akakari-midnight-2024-07-20.json";

export type { Column };

/**
 * スキーマの配信元。akakari-schema が安定URLで配る Table Schema 本体を参照する。
 *
 *   {BASE}/tableschema/{世代ID}.schema.json
 *
 * 以前は画面用に変換された `{BASE}/data/{世代ID}.json` を見ていたが、向こうが
 * その変換の段(publish.py)ごと廃止したため404になり、気づかないまま同梱データで
 * 動き続けていた。取得先が生きているかは deploy.yml の死活確認で見る。
 */
const BASE: string =
  import.meta.env.VITE_SCHEMA_BASE ?? "https://hedgehog-cp.github.io/akakari-schema";

/** ネットワーク取得に失敗したときの同梱データ。`npm run update:schema-fallback` で更新する。 */
const FALLBACK: Record<Battle, unknown> = {
  "akakari-hougeki": fallbackHougeki,
  "akakari-raigeki": fallbackRaigeki,
  "akakari-midnight": fallbackMidnight,
};

const cache = new Map<Battle, Column[]>();

export function schemaUrl(battle: Battle): string {
  return `${BASE}/tableschema/${BATTLE_SCHEMA[battle]}.schema.json`;
}

export async function fetchCatalog(battle: Battle): Promise<{ columns: Column[]; usedFallback: boolean }> {
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
