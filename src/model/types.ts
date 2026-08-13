export type Battle = "akakari-hougeki" | "akakari-raigeki" | "akakari-midnight";

/** hjson の 種別 に書く値。赤仮には 砲撃戦 と 赤仮砲撃戦 の2系統があるので略さない。 */
export const BATTLE_KEY: Record<Battle, string> = {
  "akakari-hougeki": "赤仮砲撃戦",
  "akakari-raigeki": "赤仮雷撃戦",
  "akakari-midnight": "赤仮夜戦",
};

/** akakari-schema サイト上の版ID(拡張子なし)。 */
export const BATTLE_SCHEMA: Record<Battle, string> = {
  "akakari-hougeki": "akakari-hougeki-2024-07-20",
  "akakari-raigeki": "akakari-raigeki-2024-07-20",
  "akakari-midnight": "akakari-midnight-2024-07-20",
};

export const BATTLE_LABEL: Record<Battle, string> = BATTLE_KEY;

/** CSV の 装備1〜装備6。メイン5枠 + 増設1枠。 */
export const SLOT_COUNT = 6;

export type CompareOp = "以上" | "より大きい" | "以下" | "より小さい";

export type ValueCond =
  | { kind: "eq"; values: (string | number)[] }
  | { kind: "contains"; values: string[] }
  | { kind: "regex"; values: string[] }
  | { kind: "cmp"; op: CompareOp; value: number }
  | { kind: "group"; op: "AND" | "OR" | "NOT"; children: ValueCond[] };

export type Side = "攻撃艦" | "防御艦";

/** CSV に列がある装備属性だけ。 */
export type SlotAttr = "名前" | "改修" | "熟練度" | "搭載数" | "戦闘後搭載数";

export type SlotQuantity =
  | { kind: "any" }
  | { kind: "atLeast"; n: number }
  | { kind: "all" }
  | { kind: "none" };

export type SlotAttrCond = { attr: SlotAttr; cond: ValueCond };

export type OutputNode =
  | { kind: "group"; op: "AND" | "OR" | "NOT"; children: OutputNode[] }
  | { kind: "column"; column: string; cond: ValueCond }
  | { kind: "slot"; side: Side; quantity: SlotQuantity; attrs: SlotAttrCond[] };

export type ItemAttr =
  | "装備名" | "装備ID" | "装備カテゴリ" | "api_type2"
  | "熟練度" | "改修" | "搭載数"
  | "装甲" | "火力" | "雷装" | "爆装" | "対空" | "対潜"
  | "命中" | "回避" | "索敵" | "射程";

export const ITEM_ATTRS: ItemAttr[] = [
  "装備名", "装備ID", "装備カテゴリ", "api_type2",
  "熟練度", "改修", "搭載数",
  "装甲", "火力", "雷装", "爆装", "対空", "対潜",
  "命中", "回避", "索敵", "射程",
];

export type ItemCond =
  | { kind: "group"; op: "AND" | "OR" | "NOT"; children: ItemCond[] }
  | { kind: "attr"; attr: ItemAttr; cond: ValueCond }
  | { kind: "exists" };

export type CountItemNode =
  | { kind: "group"; op: "AND" | "OR" | "NOT"; children: CountItemNode[] }
  | { kind: "count"; count: ValueCond; cond: ItemCond };

/** yyyyMMddHHmmss の14桁。null は指定なし。 */
export type DateRange = { start: string | null; end: string | null };

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
