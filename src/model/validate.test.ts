import { describe, it, expect } from "vitest";
import { validateQuery } from "./validate";
import { emptyQuery, type Query } from "./types";
import type { Column } from "../schema/catalog";

const COLUMNS: Column[] = [
  { name: "ランク", type: "string", enum: ["勝利S", "敗北E"] },
  { name: "クリティカル", type: "integer", minimum: 0, maximum: 2 },
  { name: "マス", type: "string", pattern: "^マップ:\\d+-\\d+ セル:\\d+$" },
  { name: "自索敵", type: "string", description: "この形式では常に空欄. 書き出し側が値を出力しない." },
  { name: "攻撃艦.名前", type: "string" },
  { name: "ダメージ", type: "integer", minimum: 0 },
];

function withOutput(node: Query["output"]): Query {
  return { ...emptyQuery("akakari-hougeki"), output: node };
}

const codes = (q: Query) => validateQuery(q, COLUMNS).map((w) => w.code);

describe("validateQuery", () => {
  it("enum に無い値を警告する", () => {
    expect(codes(withOutput({
      kind: "column", column: "ランク", cond: { kind: "eq", values: ["大勝利"] },
    }))).toContain("enum");
  });

  it("enum にある値は警告しない", () => {
    expect(codes(withOutput({
      kind: "column", column: "ランク", cond: { kind: "eq", values: ["勝利S"] },
    }))).not.toContain("enum");
  });

  it("整数列に非整数を警告する", () => {
    expect(codes(withOutput({
      kind: "column", column: "クリティカル", cond: { kind: "eq", values: [1.5] },
    }))).toContain("integer");
  });

  it("pattern に合わない値を警告する", () => {
    expect(codes(withOutput({
      kind: "column", column: "マス", cond: { kind: "eq", values: ["7-1"] },
    }))).toContain("pattern");
  });

  it("常に空欄の列への数値比較を警告する", () => {
    expect(codes(withOutput({
      kind: "column", column: "自索敵", cond: { kind: "cmp", op: "以下", value: 0 },
    }))).toContain("empty-numeric");
  });

  it("正規表現に完全一致の注意を出す", () => {
    expect(codes(withOutput({
      kind: "column", column: "攻撃艦.名前", cond: { kind: "regex", values: ["島風"] },
    }))).toContain("regex-full-match");
  });

  it("選択中の戦闘種別に無い列を警告する", () => {
    expect(codes(withOutput({
      kind: "column", column: "巡目", cond: { kind: "eq", values: [1] },
    }))).toContain("unknown-column");
  });

  it("マスタに無い艦名を警告する", () => {
    expect(codes(withOutput({
      kind: "column", column: "攻撃艦.名前", cond: { kind: "eq", values: ["存在しない艦"] },
    }))).toContain("unknown-name");
  });

  it("マスタにある艦名は警告しない", () => {
    expect(codes(withOutput({
      kind: "column", column: "攻撃艦.名前", cond: { kind: "eq", values: ["島風"] },
    }))).not.toContain("unknown-name");
  });

  it("問題のないクエリでは警告が出ない", () => {
    expect(validateQuery(withOutput({
      kind: "column", column: "ダメージ", cond: { kind: "cmp", op: "以上", value: 10 },
    }), COLUMNS)).toEqual([]);
  });
});

describe("空グループ・空条件の検出", () => {
  it("子が0件のグループを警告する", () => {
    expect(codes(withOutput({ kind: "group", op: "AND", children: [] }))).toContain("empty-group");
  });

  it("値が空の一致条件を警告する", () => {
    expect(codes(withOutput({
      kind: "column", column: "ランク", cond: { kind: "eq", values: [] },
    }))).toContain("empty-value");
  });

  it("値が空文字列だけの含む条件を警告する", () => {
    expect(codes(withOutput({
      kind: "column", column: "攻撃艦.名前", cond: { kind: "contains", values: [""] },
    }))).toContain("empty-value");
  });

  it("入れ子のグループも検査する", () => {
    const q = withOutput({
      kind: "group", op: "AND",
      children: [{ kind: "group", op: "OR", children: [] }],
    });
    expect(codes(q)).toContain("empty-group");
  });

  it("属性が空の装備スロット条件を警告する", () => {
    expect(codes(withOutput({
      kind: "slot", side: "攻撃艦", quantity: { kind: "any" }, attrs: [],
    }))).toContain("empty-group");
  });

  it("値が埋まっていれば警告しない", () => {
    expect(codes(withOutput({
      kind: "column", column: "ランク", cond: { kind: "eq", values: ["勝利S"] },
    }))).not.toContain("empty-value");
  });

  it("攻撃艦装備の空グループも警告する", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      attackerItems: { kind: "group", op: "AND", children: [] },
    };
    expect(validateQuery(q, COLUMNS).map((w) => w.code)).toContain("empty-group");
  });

  it("装備数の条件が空なら警告する", () => {
    const q: Query = {
      ...emptyQuery("akakari-hougeki"),
      attackerItems: { kind: "count", count: { kind: "eq", values: [] }, cond: { kind: "exists" } },
    };
    expect(validateQuery(q, COLUMNS).map((w) => w.code)).toContain("empty-value");
  });

  it("値が空の表示装備条件を警告する", () => {
    expect(codes(withOutput({
      kind: "displayItem", quantity: { kind: "any" }, cond: { kind: "contains", values: [""] },
    }))).toContain("empty-value");
  });
});
