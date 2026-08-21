// 列カタログの取得先。画面と同じ定義元(generations.json)を読むので、
// 世代を移すときに直すのはあちらだけでよい。

import generations from "../src/schema/generations.json" with { type: "json" };

/** 列カタログの配信元。 */
export const BASE = generations.base;

/** 戦闘種別 → 世代ID。同梱データのファイル名は戦闘種別のほうを使う。 */
export const SCHEMA_BY_BATTLE = generations.ids;

/** 現行世代の世代ID一覧。 */
export const SCHEMA_IDS = Object.values(generations.ids);

/** akakari-schema が安定URLで配る Table Schema 本体。 */
export function schemaUrl(id) {
  return `${BASE}/tableschema/${id}.schema.json`;
}
