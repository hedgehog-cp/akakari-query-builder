import type { OutputNode, Side, SlotAttr, SlotAttrCond } from "./types";
import { SLOT_COUNT } from "./types";

export function slotColumn(side: Side, slot: number, attr: SlotAttr): string {
  return `${side}.装備${slot}.${attr}`;
}

/** 1..n から k 個選ぶ組を昇順で返す。 */
export function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const buf: number[] = [];
  const walk = (start: number) => {
    if (buf.length === k) {
      out.push([...buf]);
      return;
    }
    for (let i = start; i <= n; i++) {
      buf.push(i);
      walk(i + 1);
      buf.pop();
    }
  };
  walk(1);
  return out;
}

/** スロット1つ分の条件。属性が複数ならANDでまとめる。 */
function slotBranch(side: Side, slot: number, attrs: SlotAttrCond[]): OutputNode {
  const cols: OutputNode[] = attrs.map((a) => ({
    kind: "column",
    column: slotColumn(side, slot, a.attr),
    cond: a.cond,
  }));
  return cols.length === 1 ? cols[0] : { kind: "group", op: "AND", children: cols };
}

/** 複数スロットのANDをまとめる。 */
function andOf(nodes: OutputNode[]): OutputNode {
  return nodes.length === 1 ? nodes[0] : { kind: "group", op: "AND", children: nodes };
}

export function expandOutput(node: OutputNode): OutputNode {
  switch (node.kind) {
    case "column":
      return node;
    case "group":
      return { kind: "group", op: node.op, children: node.children.map(expandOutput) };
    case "slot": {
      const all = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);
      const branch = (k: number) => slotBranch(node.side, k, node.attrs);
      switch (node.quantity.kind) {
        case "any":
          return { kind: "group", op: "OR", children: all.map(branch) };
        case "all":
          return { kind: "group", op: "AND", children: all.map(branch) };
        case "none":
          return {
            kind: "group",
            op: "NOT",
            children: [{ kind: "group", op: "OR", children: all.map(branch) }],
          };
        case "atLeast": {
          const sets = combinations(SLOT_COUNT, node.quantity.n);
          return {
            kind: "group",
            op: "OR",
            children: sets.map((s) => andOf(s.map(branch))),
          };
        }
      }
    }
  }
}
