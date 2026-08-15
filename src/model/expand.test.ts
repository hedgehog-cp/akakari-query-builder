import { describe, it, expect } from "vitest";
import { combinations, displayItemColumn, expandOutput, slotColumn } from "./expand";
import type { DisplayItemQuantity, OutputNode } from "./types";

const nameIs = (v: string) => ({ kind: "eq" as const, values: [v] });

function slot(quantity: OutputNode extends { kind: "slot" } ? never : any): OutputNode {
  return {
    kind: "slot",
    side: "攻撃艦",
    quantity,
    attrs: [{ attr: "名前", cond: nameIs("46cm三連装砲") }],
  };
}

describe("slotColumn", () => {
  it("列名を組み立てる", () => {
    expect(slotColumn("攻撃艦", 1, "名前")).toBe("攻撃艦.装備1.名前");
    expect(slotColumn("防御艦", 6, "改修")).toBe("防御艦.装備6.改修");
  });
});

describe("combinations", () => {
  it("6スロットからN個選ぶ組の数", () => {
    expect(combinations(6, 1)).toHaveLength(6);
    expect(combinations(6, 2)).toHaveLength(15);
    expect(combinations(6, 3)).toHaveLength(20);
    expect(combinations(6, 4)).toHaveLength(15);
    expect(combinations(6, 5)).toHaveLength(6);
    expect(combinations(6, 6)).toHaveLength(1);
  });

  it("1始まりの昇順で返す", () => {
    expect(combinations(3, 2)).toEqual([[1, 2], [1, 3], [2, 3]]);
  });
});

describe("expandOutput", () => {
  it("いずれか は6分岐のORになる", () => {
    const r = expandOutput(slot({ kind: "any" }));
    expect(r).toEqual({
      kind: "group",
      op: "OR",
      children: [1, 2, 3, 4, 5, 6].map((k) => ({
        kind: "column",
        column: `攻撃艦.装備${k}.名前`,
        cond: nameIs("46cm三連装砲"),
      })),
    });
  });

  it("すべて は6分岐のANDになる", () => {
    const r = expandOutput(slot({ kind: "all" })) as { op: string; children: unknown[] };
    expect(r.op).toBe("AND");
    expect(r.children).toHaveLength(6);
  });

  it("どれも満たさない は NOT で包まれた OR になる", () => {
    const r = expandOutput(slot({ kind: "none" })) as {
      kind: string; op: string; children: { op: string; children: unknown[] }[];
    };
    expect(r.op).toBe("NOT");
    expect(r.children).toHaveLength(1);
    expect(r.children[0].op).toBe("OR");
    expect(r.children[0].children).toHaveLength(6);
  });

  it("N個以上 は C(6,N) 分岐のOR、各枝はN個のAND", () => {
    const r = expandOutput(slot({ kind: "atLeast", n: 3 })) as {
      op: string; children: { op: string; children: unknown[] }[];
    };
    expect(r.op).toBe("OR");
    expect(r.children).toHaveLength(20);
    expect(r.children[0].op).toBe("AND");
    expect(r.children[0].children).toHaveLength(3);
  });

  it("属性が複数ならスロットごとにANDでまとめる", () => {
    const node: OutputNode = {
      kind: "slot",
      side: "攻撃艦",
      quantity: { kind: "any" },
      attrs: [
        { attr: "名前", cond: { kind: "contains", values: ["46cm三連装砲"] } },
        { attr: "改修", cond: { kind: "cmp", op: "以上", value: 7 } },
      ],
    };
    const r = expandOutput(node) as { op: string; children: { op: string; children: unknown[] }[] };
    expect(r.op).toBe("OR");
    expect(r.children).toHaveLength(6);
    expect(r.children[0].op).toBe("AND");
    expect(r.children[0].children).toEqual([
      { kind: "column", column: "攻撃艦.装備1.名前", cond: { kind: "contains", values: ["46cm三連装砲"] } },
      { kind: "column", column: "攻撃艦.装備1.改修", cond: { kind: "cmp", op: "以上", value: 7 } },
    ]);
  });

  it("入れ子の中の slot も展開される", () => {
    const node: OutputNode = {
      kind: "group",
      op: "AND",
      children: [
        { kind: "column", column: "クリティカル", cond: { kind: "eq", values: [1] } },
        slot({ kind: "any" }),
      ],
    };
    const r = expandOutput(node) as { children: { kind: string }[] };
    expect(r.children[1].kind).toBe("group");
  });

  it("slot を含まない木はそのまま返る", () => {
    const node: OutputNode = { kind: "column", column: "巡目", cond: { kind: "eq", values: [1] } };
    expect(expandOutput(node)).toEqual(node);
  });
});

describe("displayItemColumn", () => {
  it("列名を組み立てる", () => {
    expect(displayItemColumn(1)).toBe("表示装備1");
    expect(displayItemColumn(3)).toBe("表示装備3");
  });
});

describe("expandOutput (displayItem)", () => {
  const node = (quantity: DisplayItemQuantity): OutputNode => ({
    kind: "displayItem", quantity, cond: { kind: "contains", values: ["46cm三連装砲"] },
  });

  it("いずれか は3分岐のORになる", () => {
    const r = expandOutput(node({ kind: "any" }));
    expect(r).toEqual({
      kind: "group", op: "OR",
      children: [1, 2, 3].map((k) => ({
        kind: "column", column: `表示装備${k}`, cond: { kind: "contains", values: ["46cm三連装砲"] },
      })),
    });
  });

  it("すべて は3分岐のANDになる", () => {
    const r = expandOutput(node({ kind: "all" })) as { op: string; children: unknown[] };
    expect(r.op).toBe("AND");
    expect(r.children).toHaveLength(3);
  });
});
