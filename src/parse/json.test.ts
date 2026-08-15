import { describe, it, expect } from "vitest";
import { parseQuery } from "./json";
import { serializeQuery } from "../serialize/hjson";
import { emptyQuery, type Query } from "../model/types";

const COLS = [
  "巡目", "クリティカル", "ダメージ", "ランク", "攻撃艦.名前",
  ...[1, 2, 3, 4, 5, 6].flatMap((k) => [`攻撃艦.装備${k}.名前`, `攻撃艦.装備${k}.改修`]),
  "表示装備1", "表示装備2", "表示装備3",
];

function roundTrip(q: Query): Query {
  return parseQuery(serializeQuery(q), COLS).query;
}

describe("parseQuery", () => {
  it("JSONの構文エラーは throw する", () => {
    expect(() => parseQuery("{", COLS)).toThrow();
  });

  it("種別が無ければ警告を出し、既定の戦闘種別にする", () => {
    const r = parseQuery('{"出力": null}', COLS);
    expect(r.query.battle).toBe("akakari-hougeki");
    expect(r.warnings.map((w) => w.message)).toContain("種別がありません");
  });

  it("種別から戦闘種別を復元する", () => {
    expect(parseQuery('{"種別": "赤仮夜戦"}', COLS).query.battle).toBe("akakari-midnight");
    expect(parseQuery('{"種別": "赤仮雷撃戦"}', COLS).query.battle).toBe("akakari-raigeki");
  });

  it("14桁でない日時は落として警告する", () => {
    const r = parseQuery('{"種別": "赤仮砲撃戦", "日時": {"開始": "2024072000"}}', COLS);
    expect(r.query.dateRanges).toEqual([]);
    expect(r.warnings.some((w) => w.message.includes("14桁"))).toBe(true);
  });

  it("未知の列名は落として警告する", () => {
    const r = parseQuery('{"種別": "赤仮砲撃戦", "出力": {"AND": [{"存在しない列": 1}]}}', COLS);
    expect(r.query.output).toEqual({ kind: "group", op: "AND", children: [] });
    expect(r.warnings.some((w) => w.message.includes("存在しない列"))).toBe(true);
  });

  it("ORの値が配列でなければ警告して単一要素として読む", () => {
    const r = parseQuery('{"種別": "赤仮砲撃戦", "出力": {"OR": {"巡目": 1}}}', COLS);
    expect(r.warnings.some((w) => w.message.includes("配列"))).toBe(true);
    expect(r.query.output).toEqual({
      kind: "group", op: "OR",
      children: [{ kind: "column", column: "巡目", cond: { kind: "eq", values: [1] } }],
    });
  });

  it("装備数と条件が対になっていなければ落として警告する", () => {
    const r = parseQuery('{"種別": "赤仮砲撃戦", "攻撃艦装備": {"装備数": 1}}', COLS);
    expect(r.query.attackerItems).toBeNull();
    expect(r.warnings.some((w) => w.message.includes("条件"))).toBe(true);
  });

  it("マップ形式のANDも読める(生成はしないが読む)", () => {
    const r = parseQuery('{"種別": "赤仮砲撃戦", "出力": {"巡目": 1, "クリティカル": 2}}', COLS);
    expect(r.query.output).toEqual({
      kind: "group", op: "AND",
      children: [
        { kind: "column", column: "巡目", cond: { kind: "eq", values: [1] } },
        { kind: "column", column: "クリティカル", cond: { kind: "eq", values: [2] } },
      ],
    });
  });

  it("展開後の装備スロット条件を糖衣に畳み戻す", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "slot", side: "攻撃艦", quantity: { kind: "atLeast", n: 2 },
        attrs: [{ attr: "名前", cond: { kind: "contains", values: ["46cm三連装砲"] } }],
      },
    };
    expect(roundTrip(q)).toEqual(q);
  });

  it("展開後の表示装備条件を糖衣に畳み戻す", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: { kind: "displayItem", quantity: { kind: "all" }, cond: { kind: "contains", values: ["46cm三連装砲"] } },
    };
    expect(roundTrip(q)).toEqual(q);
  });

  it("ラウンドトリップ: 入れ子3段", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "group", op: "AND",
        children: [
          { kind: "column", column: "攻撃艦.名前", cond: { kind: "contains", values: ["島風"] } },
          {
            kind: "group", op: "OR",
            children: [
              { kind: "column", column: "巡目", cond: { kind: "eq", values: [1] } },
              {
                kind: "group", op: "NOT",
                children: [{ kind: "column", column: "ランク", cond: { kind: "eq", values: ["敗北E"] } }],
              },
            ],
          },
        ],
      },
    };
    expect(roundTrip(q)).toEqual(q);
  });

  it("ラウンドトリップ: 同一列への複数条件", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "group", op: "AND",
        children: [
          { kind: "column", column: "ダメージ", cond: { kind: "cmp", op: "以上", value: 10 } },
          { kind: "column", column: "ダメージ", cond: { kind: "cmp", op: "以下", value: 20 } },
        ],
      },
    };
    expect(roundTrip(q)).toEqual(q);
  });

  it("ラウンドトリップ: 複数期間のOR", () => {
    const q: Query = {
      ...emptyQuery("akakari-raigeki"),
      dateRanges: [
        { start: "20240720000000", end: "20250101000000" },
        { start: "20250401000000", end: null },
      ],
    };
    expect(roundTrip(q)).toEqual(q);
  });

  it("ラウンドトリップ: 装備節", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      attackerItems: {
        kind: "count",
        count: { kind: "cmp", op: "以上", value: 1 },
        cond: {
          kind: "group", op: "AND",
          children: [
            { kind: "attr", attr: "装備カテゴリ", cond: { kind: "eq", values: ["大口径主砲"] } },
            { kind: "attr", attr: "改修", cond: { kind: "cmp", op: "以上", value: 7 } },
          ],
        },
      },
      defenderItems: { kind: "count", count: { kind: "eq", values: [0] }, cond: { kind: "exists" } },
    };
    expect(roundTrip(q)).toEqual(q);
  });
});
