# 赤仮クエリビルダー

赤仮形式のCSVを絞り込む条件をGUIで組み立て、3つの出口に渡すための単一ページアプリ。
出口は logbook が読む JSON、Google スプレッドシートの `QUERY` 関数の `WHERE` 句、
そしてブラウザ内で手元のCSVに適用するプレビューの3つ。
Preact + Vite。列の定義は自前で持たず、実行時に akakari-schema から取る。

---

## 0. 最初に読む

**この文書がこのリポジトリの技術的な入口。** 追跡対象。設計判断の記録はクローンした人にも
見え、レビューにもかかる必要がある。

作業中の設計書や計画は `.claude/` に置く(`.gitignore` 済み)。実装が終わったら消す。
古い文書が残っている方が迷う。

| 知りたいこと | 読む場所 |
| --- | --- |
| 何をするツールか、どう使うか | `README.md` |
| 全体の設計、なぜこの形か、規約と手順 | この文書 |
| CSVの各列に何が入るか | [akakari-schema](https://github.com/hedgehog-cp/akakari-schema) |
| 同梱データの出典と著作権表示 | `NOTICE.md` |
| 判断の経緯 | `git log`(本文に根拠を書いてある) |

説明はこの文書に集める。ディレクトリ木や運用手順を `README.md` にも書くと、1つの改名で
複数の文書を直す羽目になる。`README.md` に手書きで残るのは対応するCSVファイル名の一覧
だけで、これは `src/smoke.test.ts` が `BATTLE_KEY` と突き合わせて縛る。

### 0.1 触る前に知っておくこと

- **`src/master/master.json` と `src/schema/fallback/*.json` を手で編集しない。**
  それぞれ `npm run gen:master` / `npm run update:schema-fallback` の生成物(→ 3.8)
- **列名をUIに書かない。** 列は実行時に akakari-schema から取る(`src/schema/fetch.ts`)。
  例外は「この列は特別扱いする」という判断そのもの(`海域` `マス` `日付` `表示装備N`
  `攻撃艦.装備N.属性`)と、初期表示の条件(`freshQuery()` の `クリティカル` `ダメージ`
  `攻撃艦`)だけ。いずれもモデル側の定数・正規表現に集約し、`ui/` には散らさない
- **`emptyQuery()` の意味を変えない。** 「出力条件なし」を表す値として
  パーサ・シリアライザ・各テストが依存している。初期表示用の条件が欲しいときは
  `freshQuery()` の方を触る(`src/model/types.ts`)
- **`RuleGroup` を使う画面は行キーに WeakMap の通し番号を使う。** インデックスを
  キーにすると SortableJS の DOM 操作と Preact の再描画がずれる(→ 3.2)
- **外部依存を足さない。** 実行時の依存は preact / prismjs / sortablejs と、
  `index.html` が読む Tailwind CDN だけ
- **プレビューは編集のたびに自動実行しない。** CSVは44万行を超えることがある(→ 2.6)

### 0.2 過去に踏んだ罠

同じ失敗を繰り返さないための記録。

| 罠 | 何が起きたか |
| --- | --- |
| **行キーにインデックスを使う** | SortableJS が動かしたDOMと Preact の再描画がずれ、並べ替えても見た目が変わらない・折りたたむとD&Dが壊れる、が両方起きた。WeakMap の通し番号に変えた。→ 3.2 |
| **デバウンスを「入力が止まったら流す」だけで書く** | テキストエリアの編集がフォーカスを失う瞬間に消え、ドロップした内容が400ms後に古い入力で上書きされた。blur とドロップで保留タイマーを明示的に片付ける |
| **リサイズをCSSクラスだけで追従させる** | 構文強調用の `pre` が `textarea` の手動リサイズについてこなかった。実測してインラインstyleで反映する |
| **`contentRect` を border-box のつもりで渡す** | `ResizeObserver` の `contentRect` は padding/border を含まない。border-box で高さを指定する側に渡すとその分だけ短くなる。`getBoundingClientRect()` を使う |
| **要素セレクタでフォントを統一する** | Tailwind の `.text-xs` はクラスセレクタなので `input, select, button { font-size: … }` に勝つ。統一したい箇所からはクラスを外す。→ 2.7 |
| **`flex-wrap` の無い行に日本語ボタンを並べる** | 幅が足りないとボタンが min-content(1文字幅)まで潰れ、「+ 属性」が「+ 属 / 性」と割れた。行は折り返し、潰したくない要素には `whitespace-nowrap` を付ける |
| **ビルド成果物をコミットする** | `docs/` に `dist` 相当を置いて配信していたため、差分がビルド結果で埋まった。GitHub Actions 配信に移した。→ 3.7 |
| **プレビューが古いことに気づかない** | 条件を編集しても表示は前回の実行結果のまま。仕様どおりだが「クエリが適用されていない」ように見える。条件を変えたら「再実行」。→ 5 |

---

## 1. 概要

### 1.1 目的

赤仮形式のCSVは155列あり、生の表計算ソフトで絞り込むのは現実的でない。かといって
logbook の JSON も `QUERY` の `WHERE` 句も手書きすると、列名の綴りと括弧の対応で間違える。
**条件を1つのモデルとして組み立て、3つの出口へ機械的に落とす**のがこのツールの役目。

| 出口 | 何に使うか | 実装 |
| --- | --- | --- |
| JSON | logbook のスクリプトフィルタに貼る | `src/serialize/hjson.ts` |
| Google Visualization Query | スプレッドシートの `QUERY(…, "select * where …")` に貼る | `src/serialize/gquery.ts` |
| プレビュー | 手元のCSVにその場で適用して結果を見る | `src/eval/compile.ts` + Worker |

入力も同じモデルへ戻せる。JSON を貼るかファイルを落とすと GUI の状態が復元される
(`src/parse/json.ts`)。

列の定義は[akakari-schema](https://github.com/hedgehog-cp/akakari-schema) に従う。
[falsification-search](https://github.com/hedgehog-cp/falsification-search) とは
画面の作法(配色・枠線・テーブル・200行ずつのページ送り)を揃えている。

### 1.2 用語

| 用語 | 意味 |
| --- | --- |
| 戦闘種別 (battle) | `赤仮砲撃戦` / `赤仮雷撃戦` / `赤仮夜戦`。列構成が違うので選び直すと列カタログも変わる |
| 列カタログ (catalog) | 列名・型・列挙値・値域・説明の一覧。akakari-schema の Table Schema から必要な項目だけ取り出したもの (`src/schema/catalog.ts`) |
| 出力節 (output) | hjson の `出力` に対応する条件木。`OutputNode` |
| 値条件 (value cond) | 1つの列に対する条件。一致・含む・正規表現・数値比較・AND/OR/NOT (`ValueCond`) |
| 装備スロット条件 | 「攻撃艦のいずれかのスロットが〜」のような、複数の装備列にまたがる条件。GUI 独自の表現 |
| 展開 (expand) | 装備スロット条件・表示装備条件を、素の列条件のAND/ORへ開くこと (`expandOutput`) |
| 畳み込み (fold) | 展開の逆。読み込んだ列条件の群を装備スロット条件へ戻すこと (`foldOutput`) |

### 1.3 hjson と QUERY の違い

同じモデルから作るが、表現できる範囲が違う。**GUI で組めるものが常に両方へ落ちるとは
限らない**ので、落ちなかったものは画面に列挙する。

| | JSON (logbook) | QUERY (Google) |
| --- | --- | --- |
| 列の指し方 | 列名 | `Col1` から始まる位置 |
| 空セルの数値比較 | 0 として比較する | 偽になる |
| 日時 | `日時` に開始・終了 | 日付列が日時値として取り込まれている場合のみ。既定では落とす |
| 攻撃艦装備 / 防御艦装備 | 表現できる | CSVに列が無いので落とす |

QUERY 側で落とした節は `GQueryResult.dropped`、意味がずれる箇所は `warnings` として
返し、`src/ui/result-pane.tsx` が赤字で出す。**黙って落とさない。**

---

## 2. 設計

### 2.1 全体の流れ

```txt
 akakari-schema              このリポジトリ                      出口
────────────────         ──────────────────────           ──────────────
 data/*.json ──fetch──→  schema/fetch.ts ──→ Column[] ─┐
                              ↑ 失敗時                  │
                         schema/fallback/*.json         │
                                                        ↓
  JSON貼り付け・D&D ──→ parse/json.ts ──→  Query (唯一の状態, app.tsx)
                             (fold)                 ↑
                                            ui/* ───┘ (組み立て)
                            ┌────────────────────┴──────────────────┐
                            ↓                    ↓                  ↓
                   serialize/hjson.ts   serialize/gquery.ts  eval/compile.ts
                        (expand)             (expand)           (expand)
                            ↓                    ↓                  ↓
                          JSON                WHERE句     eval/preview.worker.ts
                                                         (CSVをストリームで走査)
```

**`Query` が唯一の状態。** 画面・シリアライザ・評価器はすべてここを読む。
出力どうしが直接参照し合うことはない。

**展開は3つの出口それぞれの入口で行う。** `expandOutput` は冪等な純関数で、
`slot` / `displayItem` を含まない木をそのまま返す。共通化のために事前展開した状態を
持ち回ると、GUI が畳んだ形を保てなくなる。

### 2.2 責務の分離

| 単位 | 責務 | 知らないこと |
| --- | --- | --- |
| `src/model/` | 型・展開・畳み込み・妥当性検査 | 画面、CSV、出力形式 |
| `src/serialize/hjson.ts` | logbook の JSON を組む | 列カタログ(列名だけ知る) |
| `src/serialize/gquery.ts` | `WHERE` 句を組む | 画面。落とした節は戻り値で返すだけ |
| `src/parse/json.ts` | JSON を `Query` に戻す | 画面。警告は戻り値で返すだけ |
| `src/eval/compile.ts` | 行(`string[]`)を判定する述語を作る | ファイル入出力、Worker |
| `src/eval/csv.ts` | RFC4180 の読み書き | クエリ |
| `src/eval/preview.worker.ts` | ファイルをストリームで走査して集計 | 表示・ページ送り |
| `src/schema/` | 列カタログの取得とフォールバック | クエリ |
| `src/master/` | 装備名・艦名・海域名の引き当て | クエリ |
| `src/storage/` | localStorage の読み書き | 画面の構造 |
| `src/ui/` | 描画と操作 | hjson の書式、CSVの走査 |

`model/validate.ts` だけは列カタログとマスタの両方を見る。「この列にその列挙値は無い」
「その装備名は存在しない」を言うには両方要るため。

### 2.3 データモデル

```ts
Query = {
  battle: Battle                    // 戦闘種別。列カタログの選択にも使う
  dateRanges: DateRange[]           // OR で繋ぐ。yyyyMMddHHmmss の14桁
  output: OutputNode | null         // null は「絞り込まない」
  attackerItems: CountItemNode | null
  defenderItems: CountItemNode | null
}

OutputNode =
  | { kind: "group", op: "AND"|"OR"|"NOT", children }
  | { kind: "column", column, cond: ValueCond }
  | { kind: "slot", side, quantity, attrs }        // GUI 独自。展開して出す
  | { kind: "displayItem", quantity, cond }        // 同上
```

不変条件。

- `NOT` グループの子は1つ。UIも演算子を `NOT` に変えた時点で先頭以外を捨てる
- `output: null` と「空の `AND` グループ」は意味が違う。前者は絞り込みなし、
  後者は空であることを警告する対象(`empty-group`)
- `slot` の `attrs` に書けるのはCSVに列がある属性だけ(`名前` `改修` `熟練度`
  `搭載数` `戦闘後搭載数`)。装備の性能値は `CountItemNode` 側にしか無い

### 2.4 展開と畳み込み

`slot` / `displayItem` は hjson には無い概念なので、書き出す前に列条件へ開く。

| quantity | 展開結果 (`SLOT_COUNT` = 6) |
| --- | --- |
| いずれか (`any`) | 装備1〜6 の OR |
| すべて (`all`) | 装備1〜6 の AND |
| どれも満たさない (`none`) | 装備1〜6 の OR を NOT で包む |
| N個以上 (`atLeast`) | 6個からN個選ぶ全組合せの OR。各組はスロットの AND |

読み込み側 (`foldOutput`) はこの逆をやるが、**形が完全に一致するときだけ畳む。**
枝の側(攻撃艦/防御艦)が揃っていて、スロット番号を除いた条件の形が全枝で同一で、
スロットの集合が「全6個の単集合」または「C(6,N) そのもの」に一致する場合に限る。
1つでも欠けていれば素の列条件のまま残す。**畳めないものを無理に畳むと、
書き戻したときに元と違うクエリになる。** 往復は `src/model/fold.test.ts` が縛る。

### 2.5 3つの評価系をずらさない

同じクエリを logbook・Google・ブラウザ内の3箇所で評価する。判定がずれると
「プレビューでは出るのにスプレッドシートでは出ない」が起きる。基準は **logbook に合わせる。**

- **空文字は 0 として扱う** (`eval/compile.ts` の `asNumber`)。logbook の
  `BuiltinScriptFilter` がそうしているため。Google の QUERY は空セルを比較で偽にするので、
  「常に空欄」と説明された列に数値比較を掛けたときは QUERY 側で警告を出す
- **数値比較の閾値は `THRESHOLD = 0.0001`。** logbook と同じ値
- **正規表現は完全一致。** logbook の `matches()` と Google の `matches` が
  どちらも完全一致なので、`compile.ts` 側も `^(?:…)$` で包む

### 2.6 プレビューの実行方針

- **走査は Worker (`src/eval/preview.worker.ts`) で行い、ファイルはストリームで読む。**
  `File.stream()` → `TextDecoderStream` → `CsvParser`。44万行超のCSVをメモリに載せない
- **実行の起点はユーザの操作だけ。** ドロップ(またはクリックでのファイル選択)と
  「再実行」ボタン。条件を編集しても自動では走らない。例外は**戦闘種別の切り替え**で、
  ヘッダ不一致で弾かれた直後に限り、新しい列カタログが届いた時点で自動的に走らせ直す
  (`src/ui/preview-pane.tsx` の `props.columns` を見る effect)。
  成功済みの結果に対しては自動再実行しない
- **ヘッダは指紋ではなく列名の集合で照合する。** 不足と余分をそのまま画面に出せるため。
  世代の判別そのものは akakari-schema の仕事で、ここではやらない
- **画面に保持する一致行は先頭10,000行まで** (`PREVIEW_ROWS`)。1ページ200行なので50ページ分。
  155列×数十万行を配列で持つとメモリを食い潰す。コピーとダウンロードは全一致行を対象にする
  ため、ワーカーは別途CSV文字列(BOM付き・CRLF)を組んで返す
- **TSV はコピーを押した時に作る。** CSVとTSVの2本を常時抱えるとメモリが倍になるので、
  返ってきたCSV文字列を `CsvParser` で読み直して `formatTsvRow` で組み直す

### 2.7 画面の規約

- **左右2カラム + 全幅の通知帯。** 通知(下書き復元・列カタログのフォールバック・警告)は
  どちらのカラムにも属さない。左カラムに置くと、通知の有無で右の出力欄の開始位置がずれる
- **左の入力(戦闘種別・日時・出力)は1つの枠にまとめ、右の出力欄と1対1で向き合わせる。**
  右のテキストエリアの高さは左の枠の実測値に合わせる(`app.tsx` の `matchHeight`)
- **フォントは `src/styles.css` で統一する。** ネイティブのフォームコントロールは
  指定がないとOS既定のUIフォントで描かれ、本文と字面が揃わない。本文フォントを body に
  与え、コントロールに継承させる。等幅で見せたい出力欄だけクラス側で上書きする
- **見出しは姉妹サイトと同じ `text-purple-900`。** 配色(`bg-main` `bg-panel` `emp-1`〜`emp-4`)も
  `index.html` の Tailwind 設定で揃えている
- **AND/OR/NOT を色分けしない。** 演算子だけが原色で浮くため
- **条件の行はすべて `RuleGroup` に載せる。** 出力節・日時・装備条件・装備スロット条件が
  同じ操作感(折りたたみ・D&D並べ替え・追加ボタン)になる

---

## 3. 実装詳細

### 3.1 ファイル構成

```txt
README.md                    何をするツールか
DESIGN.md                    この文書
NOTICE.md                    同梱データの出典と著作権表示
index.html                   Tailwind CDN と配色の定義
vite.config.ts               ビルドと vitest の設定
src/
  main.tsx                   エントリ。styles.css を読む
  app.tsx                    画面全体の骨格と Query の保持
  styles.css                 本文フォントとフォームコントロールの統一
  model/
    types.ts                 Query / OutputNode / ValueCond と初期値
    expand.ts                装備スロット条件 → 列条件
    fold.ts                  列条件 → 装備スロット条件(往復用)
    validate.ts              列挙値・型・空条件などの警告
  serialize/
    hjson.ts                 logbook の JSON を組む
    gquery.ts                Google QUERY の WHERE 句を組む
  parse/
    json.ts                  JSON → Query(警告付き)
  eval/
    compile.ts               Query → 行の述語
    csv.ts                   RFC4180 のストリームパーサと書式化
    preview.worker.ts        CSVを走査して一致行を集める
  schema/
    fetch.ts                 列カタログの取得とフォールバック
    catalog.ts               Table Schema → 画面が使う Column
    fallback/*.json          現行3世代の列カタログ(生成物)
  master/
    load.ts                  マスタの読み出しと名前引き
    groups.ts                装備モーダルの大分類タブ
    master.json              装備・艦・海域の名前(生成物)
  storage/
    draft.ts                 下書きの自動保存
    templates.ts             名前付きテンプレート
  ui/
    rule-group.tsx           条件行の共通形(折りたたみ・D&D・追加ボタン)
    output-tree.tsx          出力節
    slot-node.tsx            装備スロット条件
    display-item-node.tsx    表示装備条件
    value-cond-editor.tsx    値条件(一致・含む・正規表現・数値比較)
    name-picker.tsx          装備名・艦名を選ぶモーダル
    result-pane.tsx          右の出力欄(JSON / QUERY・構文強調・読み込み)
    preview-pane.tsx         CSVプレビュー(D&D・ページ送り・行選択)
    …                        battle-select / date-section / warnings /
                             template-drawer / error-boundary ほか
tools/
  gen-master.mjs             api_start2 → master.json
  update-schema-fallback.mjs akakari-schema → schema/fallback/*.json
.github/workflows/
  deploy.yml                 テスト → ビルド → GitHub Pages
```

### 3.2 RuleGroup と行キー

条件行を持つUIは `RuleGroup<T>` に載せる。折りたたみ・SortableJS による並べ替え・
追加ボタン・空のときの警告文がここに1つだけある。

行の React キーは **オブジェクト参照に紐づく通し番号**(`WeakMap<T, number>`)を使う。

- 並べ替えは配列の順を変えるだけでオブジェクトの参照は変えないので、キーが保たれる。
  インデックスをキーにすると、SortableJS が動かしたDOMと Preact の再描画がずれて
  見た目が更新されなくなる
- 編集はスプレッド構文で新しいオブジェクトを作るため参照が変わる。そのままだと
  1文字打つたびに行が作り直されてフォーカスが外れるので、`onChildEdit` で
  旧オブジェクトのキーを新オブジェクトへ引き継ぐ

同じパターンを `output-tree.tsx` / `date-section.tsx` / `item-section.tsx` /
`slot-node.tsx` が持つ。新しく `RuleGroup` を使うときはこれを写す。

### 3.3 列カタログの取得とフォールバック

`fetchCatalog(battle)` が `{BASE}/data/{世代ID}.json` を取り、`toCatalog()` で
画面が使う項目だけに落とす。`BASE` の既定は akakari-schema の公開ページで、
`.env.local` に `VITE_SCHEMA_BASE=…` を置けば差し替えられる(このファイルはコミットしない)。

取得に失敗したときは `src/schema/fallback/` の同梱データに落ち、画面上部に
「同梱データを使用しています」と出す。**黙ってフォールバックしない。**
同じ戦闘種別の2回目以降はメモリキャッシュを返す。

世代IDは `src/model/types.ts` の `BATTLE_SCHEMA` に書いてある。akakari-schema に
新しい世代が出たらここと同梱データの両方を更新する(→ 6)。

### 3.4 マスタデータ

装備名・艦名・海域名の候補は `src/master/master.json` から引く。`api_start2` の
マスタから必要な項目(id・名前・カテゴリ・読み・艦種)だけを抜き出したもので、
生成日時を持っていて画面上部に出る。深海棲艦の判定は `api_id >= 1501`。

### 3.5 下書きとテンプレート

| キー | 内容 | 書き込み |
| --- | --- | --- |
| `akakari-query-builder:draft` | 直前の状態1件 | 変更の500ms後に自動保存 |
| `akakari-query-builder:templates` | 名前付きの保存 | 明示的な操作のみ |

どちらも `try/catch` で握り潰す。プライベートブラウズなどで `localStorage` が
使えない環境でもアプリ自体は動かす。復元したときは通知を出し、「破棄」で
`freshQuery()` に戻せる。

### 3.6 テストの前提

`vitest`、環境は `node`、対象は `src/**/*.test.ts`。**テストするのは純関数だけ。**
UI(`.tsx`)にはテストを置かない。代わりに、UIが依存するロジック(展開・畳み込み・
並べ替え・日付変換・海域入力の解釈)は `.ts` に切り出してテストする。

重点は「往復」と「3つの評価系の一致」。`fold.test.ts` は展開→畳み込みで元に戻ること、
`json.test.ts` は書き出し→読み込みで元に戻ること、`compile.test.ts` は
空文字や閾値の扱いが logbook と同じであることを見る。

### 3.7 CI と配信

`main` に push すると `.github/workflows/deploy.yml` が `npm ci` → `npm test` →
`npm run build` を実行し、`dist/` を GitHub Pages へ配信する。テストが落ちれば
配信されない。**ビルド成果物はコミットしない**(`dist/` は `.gitignore` 済み)。

リポジトリ設定の **Settings → Pages → Build and deployment → Source** は
`GitHub Actions` にしておくこと。`vite.config.ts` の `base: "./"` は、
Pages のサブパス配信で相対参照になるようにするためのもの。

### 3.8 更新手順

```shell
npm run update:schema-fallback   # akakari-schema から現行3世代を取り直す
npm run gen:master               # api_start2 から master.json を作り直す
```

`gen:master` はローカルに `.repositories/api_start2` のクローンが要る
(`.repositories/` はコミットしない)。どちらも生成物を上書きするだけなので、
差分を見てからコミットする。出典と上流のライセンスは `NOTICE.md` に書いてある。

### 3.9 履歴

もとは
[script-for-damage-formula-verification](https://github.com/hedgehog-cp/script-for-damage-formula-verification)
の `web/` として開発していたものを、2026-08-17 に独立したリポジトリへ分離した。
分離前のコミット履歴も引き継いでいる。

2026-08-20 に、1機能1コミットで刻んでいた45件を7件へまとめ直した。ファイルの内容は
変えていない。まとめる前の履歴はリポジトリ外の
`akakari-query-builder-before-rewrite.bundle` に保管してある。**この文書や
コミットメッセージから個々のコミットハッシュを参照しない。** まとめ直すたびに
壊れるため。

---

## 4. 既知の制約

- **攻撃艦装備 / 防御艦装備は QUERY にもプレビューにも落ちない。** 装備ID・装備カテゴリ・
  装備の性能値はCSVに列が無いため。落としたことは `dropped` / `ignored` として画面に出る。
  CSVだけで判定したいときは出力節の**装備スロット条件**を使う
- **その装備条件のUIは現在隠してある** (`app.tsx` の `FEATURES.itemSections`)。
  モデル・シリアライザ・パーサは残っているので、フラグを `true` に戻せば出る
- **プレビューの表は先頭10,000行まで。** それを超える一致行はページ送りで辿れない
  (コピーとダウンロードは全件)
- **日本語環境で出力されたCSVのみ。** 列名が他言語の場合はヘッダ照合で弾かれる。
  これは akakari-schema 側の制約と同じ
- **対応するのは赤仮系3種の現行世代だけ。** 過去世代と `砲撃戦.csv` 系統は扱わない
- **`QUERY` の日時は既定で落とす。** 日付列が文字列として取り込まれているスプレッドシートで
  `datetime` リテラルと比較すると何も一致しないため、チェックボックスで明示させている

## 5. 見送っている改善

いずれも正しさに影響しない。

- **条件を変えたときのプレビューの自動再実行。** 44万行の走査が編集のたびに始まるのを
  避けている。結果が古いことを画面で示す手もあるが、現状は「再実行」ボタンだけ
- **ページをまたぐ行選択。** 選択はページ送りでクリアする。見えていない行が
  選択されたままコピー対象になるより分かりやすいと判断した
- **表の仮想スクロール。** 1ページ200行なら素のテーブルで足りている
- **保存済みテンプレートの列名移行。** 古い列を指していれば警告は出るが、直すのは手作業

## 6. 将来の注意

裏を取れていない、あるいは上流に依存する。触るときに確かめる。

- **akakari-schema に新世代が出たときは2箇所を直す。** `BATTLE_SCHEMA`(世代ID)と
  同梱フォールバック(`npm run update:schema-fallback`)。前者だけ直すと、
  取得できない環境で古い列カタログのまま動く
- **列名が変わると、保存済みの下書き・テンプレートは古い列を指す。** 画面は
  「この戦闘種別に存在しません」と警告するが、自動では移行しない
- **logbook 側の hjson の仕様変更に追従が要る。** `装備数` と `条件` を必ず対で出す、
  空文字を 0 として比較する、といった前提は logbook の実装に合わせたもので、
  上流が変われば崩れる
- **Tailwind CDN は本番向けではない。** 依存を増やさないために今は許容している。
  読み込めない環境ではレイアウトが崩れる
