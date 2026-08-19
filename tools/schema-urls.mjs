// 列カタログの取得先。同梱物の更新(update-schema-fallback.mjs)と
// 死活確認(check-schema-urls.mjs)の唯一の定義元。
//
// 世代IDは src/model/types.ts の BATTLE_SCHEMA と同じでなければならない。
// TS からは import できないので、一致は src/schema/fetch.test.ts が縛る。

export const BASE = "https://hedgehog-cp.github.io/akakari-schema";

export const SCHEMA_IDS = [
  "akakari-hougeki-2024-07-20",
  "akakari-raigeki-2024-07-20",
  "akakari-midnight-2024-07-20",
];

/** akakari-schema が安定URLで配る Table Schema 本体。 */
export function schemaUrl(id) {
  return `${BASE}/tableschema/${id}.schema.json`;
}
