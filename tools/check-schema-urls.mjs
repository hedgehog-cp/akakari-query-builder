#!/usr/bin/env node
// 列カタログの取得先が生きているかを見る。
//
// 画面は取得に失敗しても同梱データにフォールバックして動いてしまうため、
// 取得先が404になっても気づけない(実際に配信の形が変わったとき、気づかないまま
// フォールバックで動き続けていた)。CI から叩いて表に出す。

import { SCHEMA_IDS, schemaUrl } from "./schema-urls.mjs";

let failed = 0;

for (const id of SCHEMA_IDS) {
  const url = schemaUrl(id);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`NG ${res.status} ${url}`);
      failed++;
      continue;
    }
    const json = await res.json();
    if (!Array.isArray(json.fields) || json.fields.length === 0) {
      console.error(`NG fields が無い ${url}`);
      failed++;
      continue;
    }
    console.log(`OK ${json.fields.length} 列 ${url}`);
  } catch (e) {
    console.error(`NG ${e instanceof Error ? e.message : String(e)} ${url}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(
    `\n${failed} 件の取得先が壊れています。akakari-schema 側の配信を確認してください。`,
  );
  process.exit(1);
}
