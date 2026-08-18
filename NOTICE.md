# 第三者データの帰属表示

このリポジトリのソースコードは MIT ライセンス (`LICENSE`) です。
それとは別に、`src/` の一部のファイルは第三者が公開するデータを取り込んで生成したものです。
ここに出典と、上流が表明しているライセンスをそのまま記載します。

## Tibowl/api_start2 (ライセンス表明なし)

- 取り込み先: `src/master/master.json`
- 出典: <https://github.com/Tibowl/api_start2> の `parsed/api_mst_slotitem.json`,
  `api_mst_slotitem_equiptype.json`, `api_mst_ship.json`, `api_mst_stype.json`,
  `api_mst_maparea.json`, `api_mst_mapinfo.json`
- 生成: `tools/gen-master.mjs` (`npm run gen:master`)

上流リポジトリにライセンスファイルは無く、GitHub もライセンスを検出していません
(2026-08-18 時点)。内容は艦これ本体が配信するマスタデータであり、
その権利は上流リポジトリの作成者ではなく艦これの権利者に帰属します。
このリポジトリでは装備名・艦船名・海域名の引き当てに必要な項目だけを抜き出しています。

## akakari-schema (MIT)

- 取り込み先: `src/schema/fallback/*.json`
- 出典: <https://github.com/hedgehog-cp/akakari-schema>
- 生成: `tools/update-schema-fallback.mjs` (`npm run update:schema-fallback`)

列カタログは実行時に akakari-schema サイトから取得しますが、
取得に失敗したときのフォールバックとして現行世代のカタログを同梱しています。

```
The MIT License (MIT)
Copyright (c) 2026 hedgehog-cp
```

## npm 依存 (いずれも MIT)

preact, prismjs, sortablejs は `dist/` のビルド成果物にバンドルされます。
上流の著作権表示は `dist/assets/*.js` 中の `@license` バナーとして保持されています。

## 艦これ本体

「艦隊これくしょん -艦これ-」の権利は DMM GAMES / KADOKAWA GAMES に帰属します。
このリポジトリは非公式であり、権利者とは関係ありません。
