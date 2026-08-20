# akakari-query-builder

[赤仮](https://github.com/noratako5/logbook)または[ElectronicObserverEN](https://github.com/ElectronicObserverEN/ElectronicObserver)が出力する赤仮形式のCSVファイルに対するクエリ構築をGUIで行えます。

<https://hedgehog-cp.github.io/akakari-query-builder/>

特徴として、複数スロットに対するクエリ構築をGUI側で拡張しており「いずれか」や「N個以上」などを簡単に入力できます。
出力はlogbookが定める`HJSON`およびGoogle Spreadsheetの`QUERY`関数の`WHERE`句に対応しています。

また、`JSON`(`HJSON`ではない)を入力することでGUIの入力状態を復元できます。

現在、`赤仮砲撃戦.csv`、`赤仮夜戦.csv`、`赤仮雷撃戦.csv`それぞれの最新版に対応しています。

## CSVを読み込んで試す

組み立てた条件は、手元のCSVファイルをプレビュー欄にドラッグ&ドロップすればその場で適用できます。
一致した行は200行ずつ表示され、TSV/CSVでのコピーとダウンロードができます。
条件を変えたあとは「再実行」を押してください(数十万行を走査するため、編集のたびの自動実行はしません)。

## 開発

Node.js 22 以降。

```shell
npm install
npm run dev     # 開発サーバ
npm test        # 単体テスト (vitest, Node環境。UIコンポーネントは対象外)
npm run build   # 型検査(tsc)のうえ dist/ へ出力 (ビルド成果物, コミットしない)
```

同梱データと取得先の面倒を見るコマンド。

```shell
npm run gen:master             # マスタデータの再生成 (.repositories/api_start2 が要る)
npm run update:schema-fallback # 同梱する列カタログの取り直し
npm run check:schema-urls      # 列カタログ取得先の死活確認 (CIでも実行)
```

---

ライセンスはMITです（`LICENSE`）。同梱データの出典は`NOTICE.md`に挙げています。
