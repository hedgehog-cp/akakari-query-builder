import { BATTLE_SCHEMA, type Battle } from "../model/types";
import { toCatalog, type Column } from "./catalog";

export type { Column };

/**
 * スキーマの配信元。akakari-schema サイトの公開ページ用JSON(`docs/data/<id>.json`)を
 * 参照する。`tableschema/*.schema.json` はそのサイトの Pages 配信対象(`docs/`)に
 * 含まれないため使えないが、`fields` の内容は同一。
 */
const BASE: string =
  import.meta.env.VITE_SCHEMA_BASE ?? "https://hedgehog-cp.github.io/akakari-schema";

const cache = new Map<Battle, Column[]>();

export function schemaUrl(battle: Battle): string {
  return `${BASE}/data/${BATTLE_SCHEMA[battle]}.json`;
}

export async function fetchCatalog(battle: Battle): Promise<Column[]> {
  const hit = cache.get(battle);
  if (hit !== undefined) return hit;
  const url = schemaUrl(battle);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`列カタログを取得できませんでした (${res.status} ${url})`);
  }
  const cols = toCatalog(await res.json());
  cache.set(battle, cols);
  return cols;
}
