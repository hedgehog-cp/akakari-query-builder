# 赤仮クエリビルダー

赤仮形式のCSVファイル(砲撃戦/雷撃戦/夜戦)を絞り込むクエリを組み立て、
hjson と Google スプレッドシートの `QUERY` 文字列で出力する GUI。
組み立てたクエリはその場で CSV に適用して結果を確認できる。

<https://hedgehog-cp.github.io/akakari-query-builder/>

## 位置づけ

[ダメージ検証用スプレ改](https://drive.google.com/drive/folders/1J_tBagjdXl81d0onHqKf--H5hf0TGHnw?usp=sharing)
の周辺ツールのひとつ。列の定義は
[akakari-schema](https://github.com/hedgehog-cp/akakari-schema) が提供する列カタログに従う。

## 開発

Node.js 22 以降。

```shell
npm install
npm run dev     # 開発サーバ
npm test        # 純関数の単体テスト (vitest)
npm run build   # dist/ へ出力 (ビルド成果物, コミットしない)
```

### 列カタログ

列カタログは実行時に akakari-schema サイト
(<https://hedgehog-cp.github.io/akakari-schema>) から取得する
(`src/schema/fetch.ts`)。既定値を上書きしたいときは `.env.local` に
`VITE_SCHEMA_BASE=...` を置く(このファイルはコミットしない)。

取得に失敗したときは `src/schema/fallback/` に同梱した現行3世代の
カタログにフォールバックする。同梱物を更新するには:

```shell
npm run update:schema-fallback
```

### 艦これマスタデータ

装備名・艦船名・海域名は `src/master/master.json` から引く。
これは `api_start2` のマスタから必要な項目だけを抜き出したもの。
再生成にはローカルに `.repositories/api_start2` のクローンが必要
(`.repositories/` はコミットしない)。

```shell
npm run gen:master
```

## 公開

`main` に push すると `.github/workflows/deploy.yml` がテストとビルドを実行し、
`dist/` を GitHub Pages へ配信する。ビルド成果物はリポジトリにコミットしない。

リポジトリ設定の **Settings → Pages → Build and deployment → Source** は
`GitHub Actions` にしておくこと。

## ライセンス

MIT ([LICENSE](LICENSE)).

このリポジトリは第三者が公開するデータを取り込んでいます。
出典と上流のライセンスは [NOTICE.md](NOTICE.md) を参照してください。

## 履歴

もとは
[script-for-damage-formula-verification](https://github.com/hedgehog-cp/script-for-damage-formula-verification)
の `web/` として開発していたものを、2026-08-17 に独立したリポジトリへ分離した。
分離前のコミット履歴も引き継いでいる。
