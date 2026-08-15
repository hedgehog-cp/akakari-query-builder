import { describe, it, expect } from "vitest";
import { expandOutput } from "./expand";
import { foldOutput } from "./fold";
import type { DisplayItemQuantity, OutputNode, SlotQuantity, ValueCond } from "./types";

function slotNode(quantity: SlotQuantity, side: "攻撃艦" | "防御艦" = "攻撃艦"): OutputNode {
  return {
    kind: "slot",
    side,
    quantity,
    attrs: [
      { attr: "名前", cond: { kind: "contains", values: ["46cm三連装砲"] } },
      { attr: "改修", cond: { kind: "cmp", op: "以上", value: 7 } },
    ],
  };
}

describe("foldOutput", () => {
  const quantities: SlotQuantity[] = [
    { kind: "any" },
    { kind: "all" },
    { kind: "none" },
    { kind: "atLeast", n: 2 },
    { kind: "atLeast", n: 3 },
    { kind: "atLeast", n: 6 },
  ];

  for (const q of quantities) {
    it(`fold(expand(x)) === x : ${JSON.stringify(q)}`, () => {
      const x = slotNode(q);
      expect(foldOutput(expandOutput(x))).toEqual(x);
    });
  }

  it("防御艦側も畳める", () => {
    const x = slotNode({ kind: "any" }, "防御艦");
    expect(foldOutput(expandOutput(x))).toEqual(x);
  });

  it("入れ子の中でも畳める", () => {
    const x: OutputNode = {
      kind: "group",
      op: "AND",
      children: [
        { kind: "column", column: "クリティカル", cond: { kind: "eq", values: [1] } },
        slotNode({ kind: "any" }),
      ],
    };
    const expanded: OutputNode = {
      kind: "group",
      op: "AND",
      children: [
        { kind: "column", column: "クリティカル", cond: { kind: "eq", values: [1] } },
        expandOutput(slotNode({ kind: "any" })),
      ],
    };
    expect(foldOutput(expanded)).toEqual(x);
  });

  // 畳めてはいけない4ケース
  it("スロット番号が飛んでいたら畳まない", () => {
    const full = expandOutput(slotNode({ kind: "any" })) as { children: OutputNode[] };
    const broken: OutputNode = { kind: "group", op: "OR", children: full.children.slice(0, 5) };
    expect(foldOutput(broken)).toEqual(broken);
  });

  it("条件の値がスロットごとに違ったら畳まない", () => {
    const full = expandOutput(slotNode({ kind: "any" })) as { children: OutputNode[] };
    const children = [...full.children];
    children[2] = {
      kind: "group",
      op: "AND",
      children: [
        { kind: "column", column: "攻撃艦.装備3.名前", cond: { kind: "contains", values: ["51cm連装砲"] } },
        { kind: "column", column: "攻撃艦.装備3.改修", cond: { kind: "cmp", op: "以上", value: 7 } },
      ],
    };
    const broken: OutputNode = { kind: "group", op: "OR", children };
    expect(foldOutput(broken)).toEqual(broken);
  });

  it("攻撃艦と防御艦が混ざっていたら畳まない", () => {
    const full = expandOutput(slotNode({ kind: "any" })) as { children: OutputNode[] };
    const children = [...full.children];
    children[1] = {
      kind: "group",
      op: "AND",
      children: [
        { kind: "column", column: "防御艦.装備2.名前", cond: { kind: "contains", values: ["46cm三連装砲"] } },
        { kind: "column", column: "防御艦.装備2.改修", cond: { kind: "cmp", op: "以上", value: 7 } },
      ],
    };
    const broken: OutputNode = { kind: "group", op: "OR", children };
    expect(foldOutput(broken)).toEqual(broken);
  });

  it("N個以上の部分集合が欠けていたら畳まない", () => {
    const full = expandOutput(slotNode({ kind: "atLeast", n: 2 })) as { children: OutputNode[] };
    const broken: OutputNode = { kind: "group", op: "OR", children: full.children.slice(0, 14) };
    expect(foldOutput(broken)).toEqual(broken);
  });

  it("装備列でない普通のORは畳まない", () => {
    const node: OutputNode = {
      kind: "group",
      op: "OR",
      children: [
        { kind: "column", column: "巡目", cond: { kind: "eq", values: [1] } },
        { kind: "column", column: "巡目", cond: { kind: "eq", values: [2] } },
      ],
    };
    expect(foldOutput(node)).toEqual(node);
  });
});

describe("foldOutput (displayItem)", () => {
  const quantities: DisplayItemQuantity[] = [{ kind: "any" }, { kind: "all" }];
  for (const q of quantities) {
    it(`fold(expand(x)) === x : ${JSON.stringify(q)}`, () => {
      const x: OutputNode = {
        kind: "displayItem", quantity: q, cond: { kind: "contains", values: ["46cm三連装砲"] },
      };
      expect(foldOutput(expandOutput(x))).toEqual(x);
    });
  }

  it("手書きのOR/ANDグループも表示装備条件に畳める", () => {
    const cond: ValueCond = { kind: "eq", values: ["電探"] };
    const group: OutputNode = {
      kind: "group", op: "OR",
      children: [1, 2, 3].map((k) => ({ kind: "column", column: `表示装備${k}`, cond })),
    };
    expect(foldOutput(group)).toEqual({ kind: "displayItem", quantity: { kind: "any" }, cond });
  });
});
