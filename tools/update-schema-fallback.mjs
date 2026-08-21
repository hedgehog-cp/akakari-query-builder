#!/usr/bin/env node
// akakari-schema サイトから現行3世代の列カタログを取得し、
// フェッチ失敗時のフォールバックとして src/schema/fallback/ に同梱する。
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_BY_BATTLE, schemaUrl } from "./schema-urls.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "src/schema/fallback");

// ファイル名は世代IDではなく戦闘種別にする。世代が変わってもファイル名は
// 据え置きになり、直す場所が generations.json だけで済む。
for (const [battle, id] of Object.entries(SCHEMA_BY_BATTLE)) {
  const url = schemaUrl(id);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} の取得に失敗しました (${res.status})`);
  }
  const json = await res.json();
  writeFileSync(resolve(outDir, `${battle}.json`), JSON.stringify(json, null, 2) + "\n", "utf-8");
  console.log(`${battle}: ${id} fields ${json.fields.length}`);
}
