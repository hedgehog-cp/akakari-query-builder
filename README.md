# akakari-query-builder

[赤仮](https://github.com/noratako5/logbook)または[ElectronicObserverEN](https://github.com/ElectronicObserverEN/ElectronicObserver)が出力する赤仮形式のCSVファイルに対するクエリ構築をGUIで行えます。

<https://hedgehog-cp.github.io/akakari-query-builder/>

出力はlogbookが読むクエリ(`HJSON`)に加えて、Google Spreadsheetの`QUERY`関数の`WHERE`句に対応しています。
赤仮クエリビルダーが実際に扱うのは`JSON`であり`HJSON`ではありませんが、`JSON`は`HJSON`の部分集合であるため出力をlogbookでも利用できます。
赤仮クエリビルダーが出力した`JSON`を、赤仮クエリビルダーに入力すればGUIの入力状態を復元できます。
書式は[docs/format.md](docs/format.md)にまとめています。

特長として、複数スロットに対するクエリ構築をGUI側で拡張しており「いずれか」や「N個以上」などを簡単に入力できます。
現在、`赤仮砲撃戦.csv`、`赤仮夜戦.csv`、`赤仮雷撃戦.csv`それぞれの最新版に対応しています。

## 名前の入力補完

艦名・装備名の「一致」の入力欄では、打っている途中に候補が出ます。艦はよみでも引けます。
右のJSON欄でも同じように補完が効きます。キーの位置では列名や予約語、値の位置では艦名・装備名や選択肢を出します。
`↑` `↓` で選び、`Enter` で確定、`Esc` で閉じます。`Ctrl+Space` でも呼び出せます。

JSON欄は[CodeMirror](https://codemirror.net/)です。括弧と引用符は組で入り、閉じ括弧を打つと行が組み直され、改行すると深さを引き継ぎます。撤回は `Ctrl+Z`、やり直しは `Ctrl+Y`、字下げは `Tab` です。

## CSVを読み込んで試す

構築した条件は、手元のCSVファイルをプレビュー欄にドラッグ&ドロップすることで適用できます。
一致した行は200行ずつ表示し、CSV/TSVでのコピーとCSVでのダウンロードができます。
条件を変えた後は「再実行」を押してください(「条件を変えたら自動で実行」を入れておくと自動で走ります)。
「この結果を次の対象にする」を押すと、いま残っている行に対して次の条件を当てられます。段階的に絞り込むときに使います。
読み込めるのはUTF-8のCSVだけです。Shift_JISのCSVは実行せずに警告を出します。

## データの扱い

読み込んだCSVはブラウザの中(Web Worker)だけで処理し、どこにも送信しません。
サーバを持たない静的サイトで、外向きの通信は列カタログ(`akakari-schema`)の取得のみです。
入力されたCSVは保存しません。

## 開発

Node.js 24 以降。

```shell
npm install
npm run dev     # 開発サーバ
npm test        # 単体テスト (vitest, Node環境。UIコンポーネントは対象外)
npm run fmt     # Prettier で整形 (CI では fmt:check で未整形を落とす)
npm run build   # 型検査(tsc)のうえ dist/ へ出力 (ビルド成果物, コミットしない)
```

同梱データと取得先を保守するためのコマンド。

```shell
npm run gen:master             # マスタデータの再生成 (.repositories/api_start2 が要る)
npm run update:schema-fallback # 同梱する列カタログの取り直し
npm run check:schema-urls      # 列カタログ取得先の死活確認 (CIでも実行)
```

---

ライセンスはMITです（`LICENSE`）。同梱データの出典は`NOTICE.md`に挙げています。
