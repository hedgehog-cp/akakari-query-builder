import type {
  DisplayItemQuantity,
  OutputNode,
  Side,
  SlotAttr,
  SlotAttrCond,
  SlotQuantity,
  ValueCond,
} from "./types";
import { SLOT_COUNT } from "./types";
import { combinations, DISPLAY_ITEM_COUNT } from "./expand";

const SLOT_ATTRS: SlotAttr[] = ["名前", "改修", "熟練度", "搭載数", "戦闘後搭載数"];
const SIDES: Side[] = ["攻撃艦", "防御艦"];

type Parsed = { side: Side; slot: number; attr: SlotAttr };

/** "攻撃艦.装備1.名前" を分解する。装備列でなければ null。 */
function parseSlotColumn(column: string): Parsed | null {
  const m = /^(攻撃艦|防御艦)\.装備([1-9]\d*)\.(.+)$/.exec(column);
  if (m === null) return null;
  const side = m[1] as Side;
  const slot = Number(m[2]);
  const attr = m[3] as SlotAttr;
  if (!SIDES.includes(side)) return null;
  if (slot < 1 || slot > SLOT_COUNT) return null;
  if (!SLOT_ATTRS.includes(attr)) return null;
  return { side, slot, attr };
}

/** 1つの枝(列条件、または列条件のANDグループ)を {side, slot, attrs} に読む。 */
function readBranch(node: OutputNode): { side: Side; slot: number; attrs: SlotAttrCond[] } | null {
  const cols: OutputNode[] =
    node.kind === "column"
      ? [node]
      : node.kind === "group" && node.op === "AND"
        ? node.children
        : [];
  if (cols.length === 0) return null;

  const attrs: SlotAttrCond[] = [];
  let side: Side | null = null;
  let slot: number | null = null;

  for (const c of cols) {
    if (c.kind !== "column") return null;
    const p = parseSlotColumn(c.column);
    if (p === null) return null;
    if (side === null) side = p.side;
    else if (side !== p.side) return null; // 攻撃艦と防御艦が混ざっている
    if (slot === null) slot = p.slot;
    else if (slot !== p.slot) return null; // 1つの枝が複数スロットを跨いでいる
    attrs.push({ attr: p.attr, cond: c.cond });
  }
  if (side === null || slot === null) return null;
  return { side, slot, attrs };
}

/** スロット番号を除いた条件の形。枝の間でこれが一致していなければ畳まない。 */
function shape(attrs: SlotAttrCond[]): string {
  return JSON.stringify(attrs);
}

function sameSets(a: number[][], b: number[][]): boolean {
  const key = (s: number[][]) =>
    s
      .map((x) => [...x].sort((p, q) => p - q).join(","))
      .sort()
      .join("|");
  return key(a) === key(b);
}

/** OR/AND グループを装備スロット条件に畳めるなら畳む。 */
function tryFoldGroup(node: OutputNode): OutputNode | null {
  if (node.kind !== "group") return null;
  if (node.op !== "OR" && node.op !== "AND") return null;
  if (node.children.length === 0) return null;

  // 各枝を読む。1つでも読めなければ畳まない。
  type Branch = { side: Side; slots: number[]; attrs: SlotAttrCond[] };
  const branches: Branch[] = [];
  for (const child of node.children) {
    const one = readBranch(child);
    if (one !== null) {
      branches.push({ side: one.side, slots: [one.slot], attrs: one.attrs });
      continue;
    }
    // N個以上 の枝は「複数スロットのAND」になっている
    if (child.kind !== "group" || child.op !== "AND") return null;
    if (child.children.length === 0) return null;
    const parts = child.children.map(readBranch);
    if (parts.some((p) => p === null)) return null;
    const ps = parts as { side: Side; slot: number; attrs: SlotAttrCond[] }[];
    const side = ps[0].side;
    if (ps.some((p) => p.side !== side)) return null;
    const first = shape(ps[0].attrs);
    if (ps.some((p) => shape(p.attrs) !== first)) return null;
    branches.push({ side, slots: ps.map((p) => p.slot), attrs: ps[0].attrs });
  }

  const side = branches[0].side;
  if (branches.some((b) => b.side !== side)) return null;
  const form = shape(branches[0].attrs);
  if (branches.some((b) => shape(b.attrs) !== form)) return null;

  const attrs = branches[0].attrs;
  const sets = branches.map((b) => b.slots);
  const allSlots = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);

  if (sets.every((s) => s.length === 1)) {
    if (
      !sameSets(
        sets,
        allSlots.map((k) => [k]),
      )
    )
      return null;
    const quantity: SlotQuantity = node.op === "OR" ? { kind: "any" } : { kind: "all" };
    return { kind: "slot", side, quantity, attrs };
  }

  // N個以上 は OR のみ
  if (node.op !== "OR") return null;
  const n = sets[0].length;
  if (sets.some((s) => s.length !== n)) return null;
  if (!sameSets(sets, combinations(SLOT_COUNT, n))) return null;
  return { kind: "slot", side, quantity: { kind: "atLeast", n }, attrs };
}

/** "表示装備1" を分解する。表示装備列でなければ null。 */
function readDisplayItemColumn(column: string): number | null {
  const m = /^表示装備([1-3])$/.exec(column);
  return m === null ? null : Number(m[1]);
}

/** OR/AND グループを表示装備条件に畳めるなら畳む。属性は1つ(cond)だけなので
 * tryFoldGroup よりずっと単純: 表示装備1〜3が重複なく揃い、条件が全枝で
 * 一致していれば畳める。 */
function tryFoldDisplayItemGroup(node: OutputNode): OutputNode | null {
  if (node.kind !== "group") return null;
  if (node.op !== "OR" && node.op !== "AND") return null;
  if (node.children.length !== DISPLAY_ITEM_COUNT) return null;

  const seen = new Set<number>();
  let cond: ValueCond | null = null;
  for (const child of node.children) {
    if (child.kind !== "column") return null;
    const n = readDisplayItemColumn(child.column);
    if (n === null) return null;
    seen.add(n);
    if (cond === null) cond = child.cond;
    else if (JSON.stringify(cond) !== JSON.stringify(child.cond)) return null;
  }
  if (seen.size !== DISPLAY_ITEM_COUNT) return null;

  const quantity: DisplayItemQuantity = node.op === "OR" ? { kind: "any" } : { kind: "all" };
  return { kind: "displayItem", quantity, cond: cond! };
}

/** expandOutput の逆。展開された木を、畳めるところだけ元の条件へ戻す。 */
export function foldOutput(node: OutputNode): OutputNode {
  switch (node.kind) {
    case "column":
    case "slot":
    case "displayItem":
      return node;
    case "group": {
      // NOT(OR(...)) は どれも満たさない
      if (node.op === "NOT" && node.children.length === 1) {
        const inner = node.children[0];
        if (inner.kind === "group" && inner.op === "OR") {
          const folded = tryFoldGroup(inner);
          if (folded !== null && folded.kind === "slot" && folded.quantity.kind === "any") {
            return {
              kind: "slot",
              side: folded.side,
              quantity: { kind: "none" },
              attrs: folded.attrs,
            };
          }
        }
        return { kind: "group", op: "NOT", children: [foldOutput(inner)] };
      }
      const foldedSlot = tryFoldGroup(node);
      if (foldedSlot !== null) return foldedSlot;
      const foldedDisplayItem = tryFoldDisplayItemGroup(node);
      if (foldedDisplayItem !== null) return foldedDisplayItem;
      return { kind: "group", op: node.op, children: node.children.map(foldOutput) };
    }
  }
}
