import generations from "../schema/generations.json";

/** 対応する赤仮CSVの種類。 */
export type Battle = "akakari-hougeki" | "akakari-raigeki" | "akakari-midnight";

/** 出力JSONの 種別 に書く値。赤仮には 砲撃戦 と 赤仮砲撃戦 の2系統があるので略さない。 */
export const BATTLE_KEY: Record<Battle, string> = {
  "akakari-hougeki": "赤仮砲撃戦",
  "akakari-raigeki": "赤仮雷撃戦",
  "akakari-midnight": "赤仮夜戦",
};

/**
 * akakari-schema サイト上の版ID(拡張子なし)。
 *
 * 実体は generations.json にある。新しい世代に移るときに直す場所を1か所に
 * するためで、画面・同梱データの更新・取得先の死活確認はすべてそこを見る。
 * keys が Battle と食い違えば、この代入で型エラーになる。
 */
export const BATTLE_SCHEMA: Record<Battle, string> = generations.ids;

export const BATTLE_LABEL: Record<Battle, string> = BATTLE_KEY;

/** CSV の 装備1〜装備6。メイン5枠 + 増設1枠。 */
export const SLOT_COUNT = 6;

/** 数値の大小比較。 */
export type CompareOp = "以上" | "より大きい" | "以下" | "より小さい";

/** 1つの列に対する条件。 */
export type ValueCond =
  | { kind: "eq"; values: (string | number)[] }
  | { kind: "contains"; values: string[] }
  | { kind: "regex"; values: string[] }
  | { kind: "cmp"; op: CompareOp; value: number }
  | { kind: "group"; op: "AND" | "OR" | "NOT"; children: ValueCond[] };

/** 装備条件をどちらの艦に当てるか。 */
export type Side = "攻撃艦" | "防御艦";

/** CSV に列がある装備属性だけ。 */
export type SlotAttr = "名前" | "改修" | "熟練度" | "搭載数" | "戦闘後搭載数";

/** 装備スロット条件を何枠に当てるか。 */
export type SlotQuantity =
  { kind: "any" } | { kind: "atLeast"; n: number } | { kind: "all" } | { kind: "none" };

export type SlotAttrCond = { attr: SlotAttr; cond: ValueCond };

/** 表示装備条件を何枠に当てるか。 */
export type DisplayItemQuantity = { kind: "any" } | { kind: "all" };

/** 出力節の木。列条件を AND/OR/NOT と装備まわりの条件で組む。 */
export type OutputNode =
  | { kind: "group"; op: "AND" | "OR" | "NOT"; children: OutputNode[] }
  | { kind: "column"; column: string; cond: ValueCond }
  | { kind: "slot"; side: Side; quantity: SlotQuantity; attrs: SlotAttrCond[] }
  | { kind: "displayItem"; quantity: DisplayItemQuantity; cond: ValueCond };

/** 装備条件で指定できる属性。 */
export type ItemAttr =
  | "装備名"
  | "装備ID"
  | "装備カテゴリ"
  | "api_type2"
  | "熟練度"
  | "改修"
  | "搭載数"
  | "装甲"
  | "火力"
  | "雷装"
  | "爆装"
  | "対空"
  | "対潜"
  | "命中"
  | "回避"
  | "索敵"
  | "射程";

export const ITEM_ATTRS: ItemAttr[] = [
  "装備名",
  "装備ID",
  "装備カテゴリ",
  "api_type2",
  "熟練度",
  "改修",
  "搭載数",
  "装甲",
  "火力",
  "雷装",
  "爆装",
  "対空",
  "対潜",
  "命中",
  "回避",
  "索敵",
  "射程",
];

/** 装備1つに対する条件。 */
export type ItemCond =
  | { kind: "group"; op: "AND" | "OR" | "NOT"; children: ItemCond[] }
  | { kind: "attr"; attr: ItemAttr; cond: ValueCond }
  | { kind: "exists" };

/** 装備の個数に対する条件。 */
export type CountItemNode =
  | { kind: "group"; op: "AND" | "OR" | "NOT"; children: CountItemNode[] }
  | { kind: "count"; count: ValueCond; cond: ItemCond };

/** yyyyMMddHHmmss の14桁。null は指定なし。 */
export type DateRange = { start: string | null; end: string | null };

/** 画面が扱うクエリの全体。 */
export type Query = {
  battle: Battle;
  dateRanges: DateRange[];
  output: OutputNode | null;
  attackerItems: CountItemNode | null;
  defenderItems: CountItemNode | null;
};

export function emptyQuery(battle: Battle): Query {
  return {
    battle,
    dateRanges: [],
    output: null,
    attackerItems: null,
    defenderItems: null,
  };
}

/**
 * アプリ起動時(下書きが無い場合)と「破棄」ボタンで使う初期値。
 * emptyQuery() は「出力条件なし」を表す値としてパーサ・シリアライザ・各テストで
 * 使われているため変更しない(出力キーの無いJSONの読み込みが暗黙にフィルタ付きに
 * なってしまうのを避ける)。
 */
export function freshQuery(battle: Battle): Query {
  return {
    ...emptyQuery(battle),
    output: {
      kind: "group",
      op: "AND",
      children: [
        {
          kind: "column",
          column: "クリティカル",
          cond: { kind: "cmp", op: "より大きい", value: 0 },
        },
        { kind: "column", column: "ダメージ", cond: { kind: "cmp", op: "より大きい", value: 0 } },
        { kind: "column", column: "攻撃艦", cond: { kind: "eq", values: ["自軍"] } },
      ],
    },
  };
}
