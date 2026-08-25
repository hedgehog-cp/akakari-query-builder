import { describe, it, expect } from "vitest";
import { serializeQuery, queryToJson } from "./json";
import { emptyQuery, type Query } from "../model/types";

describe("serializeQuery", () => {
  it("種別は常に出力される", () => {
    const q = emptyQuery("akakari-hougeki");
    expect(queryToJson(q)).toEqual({ 種別: "赤仮砲撃戦" });
  });

  it("赤仮夜戦の種別キーは 赤仮夜戦(CSVのファイル名は赤仮夜戦戦)", () => {
    expect(queryToJson(emptyQuery("akakari-midnight"))).toEqual({ 種別: "赤仮夜戦" });
  });

  it("日時は14桁で出力し、複数期間は配列でORになる", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      dateRanges: [
        { start: "20240720000000", end: "20250101000000" },
        { start: "20250401000000", end: null },
      ],
    };
    expect(queryToJson(q)).toEqual({
      種別: "赤仮砲撃戦",
      日時: [{ 開始: "20240720000000", 終了: "20250101000000" }, { 開始: "20250401000000" }],
    });
  });

  it("期間が1つならマップで出力する", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      dateRanges: [{ start: "20240720000000", end: null }],
    };
    expect(queryToJson(q)).toMatchObject({ 日時: { 開始: "20240720000000" } });
  });

  it("論理ノードは常に配列形式で出す", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "group",
        op: "AND",
        children: [
          { kind: "column", column: "クリティカル", cond: { kind: "eq", values: [1] } },
          {
            kind: "group",
            op: "OR",
            children: [
              { kind: "column", column: "巡目", cond: { kind: "eq", values: [1] } },
              { kind: "column", column: "巡目", cond: { kind: "eq", values: [2] } },
            ],
          },
        ],
      },
    };
    expect(queryToJson(q)).toMatchObject({
      出力: {
        AND: [{ クリティカル: 1 }, { OR: [{ 巡目: 1 }, { 巡目: 2 }] }],
      },
    });
  });

  it("同じ列への複数条件が配列形式のANDでキー衝突せずに出せる", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "group",
        op: "AND",
        children: [
          { kind: "column", column: "ダメージ", cond: { kind: "cmp", op: "以上", value: 10 } },
          { kind: "column", column: "ダメージ", cond: { kind: "cmp", op: "以下", value: 20 } },
        ],
      },
    };
    expect(queryToJson(q)).toMatchObject({
      出力: { AND: [{ ダメージ: { 以上: 10 } }, { ダメージ: { 以下: 20 } }] },
    });
  });

  it("NOTグループは配列ではなく単一の子を取る", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "group",
        op: "NOT",
        children: [{ kind: "column", column: "ランク", cond: { kind: "eq", values: ["敗北E"] } }],
      },
    };
    expect(queryToJson(q)).toMatchObject({ 出力: { NOT: { ランク: "敗北E" } } });
  });

  it("一致は1件なら直値、複数なら配列", () => {
    const one: ValueCondCase = { kind: "eq", values: ["島風"] };
    const many: ValueCondCase = { kind: "eq", values: ["島風", "雪風"] };
    expect(colJson(one)).toEqual({ 攻撃艦: "島風" });
    expect(colJson(many)).toEqual({ 攻撃艦: ["島風", "雪風"] });
  });

  it("装備数と条件は必ず対で出力される", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      attackerItems: {
        kind: "count",
        count: { kind: "cmp", op: "以上", value: 1 },
        cond: { kind: "attr", attr: "装備カテゴリ", cond: { kind: "eq", values: ["大口径主砲"] } },
      },
    };
    expect(queryToJson(q)).toMatchObject({
      攻撃艦装備: { 装備数: { 以上: 1 }, 条件: { 装備カテゴリ: "大口径主砲" } },
    });
  });

  it("装備の存在だけを見る条件は null になる", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      defenderItems: {
        kind: "count",
        count: { kind: "eq", values: [0] },
        cond: { kind: "exists" },
      },
    };
    expect(queryToJson(q)).toMatchObject({ 防御艦装備: { 装備数: 0, 条件: null } });
  });

  it("装備スロット条件は展開されてから出力される", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "slot",
        side: "攻撃艦",
        quantity: { kind: "any" },
        attrs: [{ attr: "名前", cond: { kind: "contains", values: ["46cm三連装砲"] } }],
      },
    };
    const json = queryToJson(q) as { 出力: { OR: unknown[] } };
    expect(json.出力.OR).toHaveLength(6);
    expect(json.出力.OR[0]).toEqual({ "攻撃艦.装備1.名前": { 含む: "46cm三連装砲" } });
  });

  it("表示装備条件は展開されてから出力される", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "displayItem",
        quantity: { kind: "any" },
        cond: { kind: "contains", values: ["46cm三連装砲"] },
      },
    };
    const json = queryToJson(q) as { 出力: { OR: unknown[] } };
    expect(json.出力.OR).toHaveLength(3);
    expect(json.出力.OR[0]).toEqual({ 表示装備1: { 含む: "46cm三連装砲" } });
  });

  it("serializeQuery は2スペース字下げのJSON文字列を返す", () => {
    const text = serializeQuery(emptyQuery("akakari-raigeki"));
    expect(text).toBe('{\n  "種別": "赤仮雷撃戦"\n}');
    expect(() => JSON.parse(text)).not.toThrow();
  });
});

// テスト補助
type ValueCondCase = import("../model/types").ValueCond;
function colJson(cond: ValueCondCase) {
  const q = {
    ...emptyQuery("akakari-hougeki"),
    output: { kind: "column" as const, column: "攻撃艦", cond },
  };
  return (queryToJson(q) as Record<string, unknown>).出力;
}
