#!/usr/bin/env node
// akakari-schema サイトから現行3世代の列カタログを取得し、
// フェッチ失敗時のフォールバックとして src/schema/fallback/ に同梱する。
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_IDS, schemaUrl } from "./schema-urls.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "src/schema/fallback");

for (const id of SCHEMA_IDS) {
  const url = schemaUrl(id);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} の取得に失敗しました (${res.status})`);
  }
  const json = await res.json();
  writeFileSync(resolve(outDir, `${id}.json`), JSON.stringify(json, null, 2) + "\n", "utf-8");
  console.log(`${id}: fields ${json.fields.length}`);
}
