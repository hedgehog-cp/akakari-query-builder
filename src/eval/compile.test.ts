import { describe, it, expect } from "vitest";
import { compileQuery, THRESHOLD } from "./compile";
import { emptyQuery, type Query } from "../model/types";
import { serializeQuery } from "../serialize/hjson";

const HEADER = ["No.", "日付", "ランク", "クリティカル", "ダメージ", "攻撃艦.名前", "自索敵"];
const row = (...cells: string[]) => cells;

function pred(q: Query) {
  return compileQuery(q, HEADER).predicate;
}

function withOutput(output: Query["output"]): Query {
  return { ...emptyQuery("akakari-hougeki"), output };
}

describe("compileQuery", () => {
  it("条件が無ければすべて通す", () => {
    expect(pred(emptyQuery("akakari-hougeki"))(row("1"))).toBe(true);
  });

  it("文字列の一致", () => {
    const p = pred(
      withOutput({ kind: "column", column: "ランク", cond: { kind: "eq", values: ["勝利S"] } }),
    );
    expect(p(row("1", "", "勝利S", "", "", "", ""))).toBe(true);
    expect(p(row("1", "", "敗北E", "", "", "", ""))).toBe(false);
  });

  it("数値の一致は誤差閾値 0.0001 で判定する", () => {
    const p = pred(
      withOutput({ kind: "column", column: "ダメージ", cond: { kind: "eq", values: [10] } }),
    );
    expect(THRESHOLD).toBe(0.0001);
    expect(p(row("1", "", "", "", "10", "", ""))).toBe(true);
    expect(p(row("1", "", "", "", "10.00001", "", ""))).toBe(true);
    expect(p(row("1", "", "", "", "10.01", "", ""))).toBe(false);
  });

  it("空文字列は数値比較で 0 として扱われる", () => {
    const p = pred(
      withOutput({ kind: "column", column: "自索敵", cond: { kind: "cmp", op: "以下", value: 0 } }),
    );
    expect(p(row("1", "", "", "", "", "", ""))).toBe(true);
  });

  it("数値でパースできない文字列は数値比較で偽", () => {
    const p = pred(
      withOutput({ kind: "column", column: "ランク", cond: { kind: "cmp", op: "以上", value: 0 } }),
    );
    expect(p(row("1", "", "勝利S", "", "", "", ""))).toBe(false);
  });

  it("正規表現は完全一致", () => {
    const full = pred(
      withOutput({
        kind: "column",
        column: "攻撃艦.名前",
        cond: { kind: "regex", values: ["島風"] },
      }),
    );
    expect(full(row("1", "", "", "", "", "島風", ""))).toBe(true);
    expect(full(row("1", "", "", "", "", "島風改", ""))).toBe(false);

    const partial = pred(
      withOutput({
        kind: "column",
        column: "攻撃艦.名前",
        cond: { kind: "regex", values: [".*島風.*"] },
      }),
    );
    expect(partial(row("1", "", "", "", "", "島風改", ""))).toBe(true);
  });

  it("含む は部分一致", () => {
    const p = pred(
      withOutput({
        kind: "column",
        column: "攻撃艦.名前",
        cond: { kind: "contains", values: ["島風"] },
      }),
    );
    expect(p(row("1", "", "", "", "", "島風改", ""))).toBe(true);
  });

  it("AND / OR / NOT", () => {
    const p = pred(
      withOutput({
        kind: "group",
        op: "AND",
        children: [
          { kind: "column", column: "クリティカル", cond: { kind: "eq", values: [2] } },
          {
            kind: "group",
            op: "NOT",
            children: [
              { kind: "column", column: "ランク", cond: { kind: "eq", values: ["敗北E"] } },
            ],
          },
        ],
      }),
    );
    expect(p(row("1", "", "勝利S", "2", "", "", ""))).toBe(true);
    expect(p(row("1", "", "敗北E", "2", "", "", ""))).toBe(false);
    expect(p(row("1", "", "勝利S", "1", "", "", ""))).toBe(false);
  });

  it("複数値の一致はORになる", () => {
    const p = pred(
      withOutput({
        kind: "column",
        column: "クリティカル",
        cond: { kind: "eq", values: [1, 2] },
      }),
    );
    expect(p(row("1", "", "", "1", "", "", ""))).toBe(true);
    expect(p(row("1", "", "", "0", "", "", ""))).toBe(false);
  });

  it("装備節は評価できないので ignored に載り、判定に影響しない", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      attackerItems: {
        kind: "count",
        count: { kind: "cmp", op: "以上", value: 1 },
        cond: { kind: "attr", attr: "装備カテゴリ", cond: { kind: "eq", values: ["大口径主砲"] } },
      },
    };
    const c = compileQuery(q, HEADER);
    expect(c.ignored).toContain("攻撃艦装備");
    expect(c.predicate(row("1", "", "", "", "", "", ""))).toBe(true);
  });

  it("ヘッダに無い列は missingColumns に載り、その条件は常に偽", () => {
    const c = compileQuery(
      withOutput({
        kind: "column",
        column: "巡目",
        cond: { kind: "eq", values: [1] },
      }),
      HEADER,
    );
    expect(c.missingColumns).toContain("巡目");
    expect(c.predicate(row("1", "", "", "", "", "", ""))).toBe(false);
  });

  it("日時は 日付 列と突き合わせる", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      dateRanges: [{ start: "20240720000000", end: "20240721000000" }],
    };
    const p = compileQuery(q, HEADER).predicate;
    expect(p(row("1", "2024/07/20 12:34:56", "", "", "", "", ""))).toBe(true);
    expect(p(row("1", "2024/07/22 12:34:56", "", "", "", "", ""))).toBe(false);
  });

  it("日本語環境では時がゼロ埋めされない日付も読む", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      dateRanges: [{ start: "20240720000000", end: "20240721000000" }],
    };
    const p = compileQuery(q, HEADER).predicate;
    expect(p(row("1", "2024/07/20 9:05:00", "", "", "", "", ""))).toBe(true);
  });

  it("日付がパースできない行は日時条件を満たさない", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      dateRanges: [{ start: "20240720000000", end: null }],
    };
    const p = compileQuery(q, HEADER).predicate;
    expect(p(row("1", "", "", "", "", "", ""))).toBe(false);
  });

  it("装備スロット条件は展開されて評価される", () => {
    const header = [...HEADER, ...[1, 2, 3, 4, 5, 6].map((k) => `攻撃艦.装備${k}.名前`)];
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "slot",
        side: "攻撃艦",
        quantity: { kind: "any" },
        attrs: [{ attr: "名前", cond: { kind: "contains", values: ["46cm"] } }],
      },
    };
    const p = compileQuery(q, header).predicate;
    const base = ["1", "", "", "", "", "", ""];
    expect(p([...base, "", "", "46cm三連装砲", "", "", ""])).toBe(true);
    expect(p([...base, "", "", "", "", "", ""])).toBe(false);
  });

  it("表示装備条件は展開されて評価される", () => {
    const header = [...HEADER, "表示装備1", "表示装備2", "表示装備3"];
    const q: Query = withOutput({
      kind: "displayItem",
      quantity: { kind: "any" },
      cond: { kind: "contains", values: ["46cm"] },
    });
    const p = compileQuery(q, header).predicate;
    const base = ["1", "", "", "", "", "", ""];
    expect(p([...base, "", "", "46cm三連装砲"])).toBe(true);
    expect(p([...base, "", "", ""])).toBe(false);
  });
});

describe("hjson と評価器の整合", () => {
  it("同じモデルから出た条件で判定が食い違わない", () => {
    const q: Query = withOutput({
      kind: "group",
      op: "AND",
      children: [
        { kind: "column", column: "ダメージ", cond: { kind: "cmp", op: "以上", value: 10 } },
        { kind: "column", column: "ダメージ", cond: { kind: "cmp", op: "以下", value: 20 } },
      ],
    });
    // hjson は同一列への2条件を配列形式のANDで出す(キーが衝突しない)
    const json = JSON.parse(serializeQuery(q)) as { 出力: { AND: unknown[] } };
    expect(json.出力.AND).toHaveLength(2);

    const p = pred(q);
    expect(p(row("1", "", "", "", "9", "", ""))).toBe(false);
    expect(p(row("1", "", "", "", "15", "", ""))).toBe(true);
    expect(p(row("1", "", "", "", "21", "", ""))).toBe(false);
  });
});
