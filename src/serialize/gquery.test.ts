import { describe, it, expect } from "vitest";
import { toGoogleQuery } from "./gquery";
import { emptyQuery, type Query } from "../model/types";
import type { Column } from "../model/column";

const COLUMNS: Column[] = [
  { name: "No.", type: "integer" },
  { name: "日付", type: "string" },
  { name: "ランク", type: "string" },
  { name: "クリティカル", type: "integer" },
  { name: "ダメージ", type: "integer" },
  { name: "攻撃艦.名前", type: "string" },
  { name: "自索敵", type: "string", description: "この形式では常に空欄." },
];

const run = (q: Query, includeDate = false) => toGoogleQuery(q, COLUMNS, { includeDate });

describe("toGoogleQuery", () => {
  it("条件が無ければ空文字列", () => {
    expect(run(emptyQuery("akakari-hougeki")).query).toBe("");
  });

  it("列参照は1始まりのCol番号", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: { kind: "column", column: "クリティカル", cond: { kind: "eq", values: [1] } },
    };
    expect(run(q).query).toBe("where Col4 = 1");
  });

  it("文字列はシングルクォートで囲む", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: { kind: "column", column: "ランク", cond: { kind: "eq", values: ["勝利S"] } },
    };
    expect(run(q).query).toBe("where Col3 = '勝利S'");
  });

  it("シングルクォートは2つ重ねてエスケープする", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: { kind: "column", column: "攻撃艦.名前", cond: { kind: "eq", values: ["a'b"] } },
    };
    expect(run(q).query).toBe("where Col6 = 'a''b'");
  });

  it("複数の一致はORで囲む", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: { kind: "column", column: "クリティカル", cond: { kind: "eq", values: [1, 2] } },
    };
    expect(run(q).query).toBe("where (Col4 = 1 or Col4 = 2)");
  });

  it("含む は contains、正規表現は matches", () => {
    const c: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "column",
        column: "攻撃艦.名前",
        cond: { kind: "contains", values: ["島風"] },
      },
    };
    expect(run(c).query).toBe("where Col6 contains '島風'");
    const r: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "column",
        column: "攻撃艦.名前",
        cond: { kind: "regex", values: [".*島風.*"] },
      },
    };
    expect(run(r).query).toBe("where Col6 matches '.*島風.*'");
  });

  it("数値比較を写す", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "group",
        op: "AND",
        children: [
          { kind: "column", column: "ダメージ", cond: { kind: "cmp", op: "以上", value: 10 } },
          {
            kind: "column",
            column: "ダメージ",
            cond: { kind: "cmp", op: "より小さい", value: 20 },
          },
        ],
      },
    };
    expect(run(q).query).toBe("where (Col5 >= 10 and Col5 < 20)");
  });

  it("AND / OR / NOT を写す", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
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
      },
    };
    expect(run(q).query).toBe("where (Col4 = 2 and not (Col3 = '敗北E'))");
  });

  it("装備スロット条件は展開されて変換できる", () => {
    const cols: Column[] = [
      ...COLUMNS,
      ...[1, 2, 3, 4, 5, 6].map((k) => ({ name: `攻撃艦.装備${k}.名前`, type: "string" as const })),
    ];
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "slot",
        side: "攻撃艦",
        quantity: { kind: "any" },
        attrs: [{ attr: "名前", cond: { kind: "contains", values: ["46cm"] } }],
      },
    };
    const r = toGoogleQuery(q, cols, { includeDate: false });
    expect(r.query).toContain("Col8 contains '46cm'");
    expect(r.query.match(/contains/g)).toHaveLength(6);
  });

  it("表示装備条件は展開されて変換できる", () => {
    const cols: Column[] = [
      ...COLUMNS,
      ...[1, 2, 3].map((k) => ({ name: `表示装備${k}`, type: "string" as const })),
    ];
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: {
        kind: "displayItem",
        quantity: { kind: "any" },
        cond: { kind: "contains", values: ["46cm"] },
      },
    };
    const r = toGoogleQuery(q, cols, { includeDate: false });
    expect(r.query).toContain("contains '46cm'");
    expect(r.query.match(/contains/g)).toHaveLength(3);
  });

  it("装備節は変換できないので dropped に載る", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      attackerItems: {
        kind: "count",
        count: { kind: "cmp", op: "以上", value: 1 },
        cond: { kind: "attr", attr: "装備カテゴリ", cond: { kind: "eq", values: ["大口径主砲"] } },
      },
    };
    const r = run(q);
    expect(r.dropped).toContain("攻撃艦装備");
    expect(r.query).toBe("");
  });

  it("日時は既定で載せない", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      dateRanges: [{ start: "20240720000000", end: null }],
    };
    expect(run(q).query).toBe("");
    expect(run(q).dropped).toContain("日時");
  });

  it("日時を載せると datetime リテラルになる", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      dateRanges: [{ start: "20240720000000", end: "20250101123456" }],
    };
    expect(run(q, true).query).toBe(
      "where (Col2 >= datetime '2024-07-20 00:00:00' and Col2 <= datetime '2025-01-01 12:34:56')",
    );
  });

  it("空になりうる列への数値比較を警告する", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: { kind: "column", column: "自索敵", cond: { kind: "cmp", op: "以下", value: 0 } },
    };
    expect(run(q).warnings.join("")).toContain("空セル");
  });

  it("列がカタログに無ければ落として警告する", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      output: { kind: "column", column: "存在しない列", cond: { kind: "eq", values: [1] } },
    };
    const r = run(q);
    expect(r.query).toBe("");
    expect(r.warnings.join("")).toContain("存在しない列");
  });
});
