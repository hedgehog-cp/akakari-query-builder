#!/usr/bin/env node
// akakari-schema サイトから現行3世代の列カタログを取得し、
// フェッチ失敗時のフォールバックとして web/src/schema/fallback/ に同梱する。
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "web/src/schema/fallback");
const BASE = "https://hedgehog-cp.github.io/akakari-schema";

const ids = [
  "akakari-hougeki-2024-07-20",
  "akakari-raigeki-2024-07-20",
  "akakari-midnight-2024-07-20",
];

for (const id of ids) {
  const url = `${BASE}/data/${id}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} の取得に失敗しました (${res.status})`);
  }
  const json = await res.json();
  writeFileSync(resolve(outDir, `${id}.json`), JSON.stringify(json, null, 2) + "\n", "utf-8");
  console.log(`${id}: fields ${json.fields.length}`);
}
