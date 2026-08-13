import { SLOT_COUNT, type OutputNode, type Side, type SlotAttr, type SlotQuantity } from "../model/types";
import { combinations } from "../model/expand";
import type { Column } from "../schema/catalog";
import { ValueCondEditor, defaultCond } from "./value-cond-editor";

const SLOT_ATTRS: SlotAttr[] = ["名前", "改修", "熟練度", "搭載数", "戦闘後搭載数"];
const SIDES: Side[] = ["攻撃艦", "防御艦"];

type SlotNode = Extract<OutputNode, { kind: "slot" }>;

function quantityValue(q: SlotQuantity): string {
  return q.kind === "atLeast" ? `atLeast:${q.n}` : q.kind;
}

function parseQuantity(v: string): SlotQuantity {
  if (v.startsWith("atLeast:")) return { kind: "atLeast", n: Number(v.slice(8)) };
  if (v === "all") return { kind: "all" };
  if (v === "none") return { kind: "none" };
  return { kind: "any" };
}

function branchCount(q: SlotQuantity): number {
  switch (q.kind) {
    case "any":
    case "all":
    case "none":
      return SLOT_COUNT;
    case "atLeast":
      return combinations(SLOT_COUNT, q.n).length;
  }
}

export function SlotNodeEditor(props: {
  node: SlotNode;
  columns: Column[];
  onChange: (n: OutputNode) => void;
  onRemove?: () => void;
}) {
  const node = props.node;
  const colOf = (attr: SlotAttr): Column | undefined =>
    props.columns.find((c) => c.name === `${node.side}.装備1.${attr}`);

  return (
    <div class="border border-emp-1 rounded p-2 my-1 bg-emp-4/40">
      <div class="flex flex-wrap items-center gap-1">
        <span class="font-bold text-xs">装備スロット条件</span>
        <select class="border border-gray-300 rounded px-1" value={node.side}
          onChange={(e) => props.onChange({ ...node, side: (e.target as HTMLSelectElement).value as Side })}>
          {SIDES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select class="border border-gray-300 rounded px-1" value={quantityValue(node.quantity)}
          onChange={(e) => props.onChange({
            ...node, quantity: parseQuantity((e.target as HTMLSelectElement).value),
          })}>
          <option value="any">いずれかのスロットが</option>
          <option value="atLeast:2">2個以上のスロットが</option>
          <option value="atLeast:3">3個以上のスロットが</option>
          <option value="atLeast:4">4個以上のスロットが</option>
          <option value="atLeast:5">5個以上のスロットが</option>
          <option value="all">すべてのスロットが</option>
          <option value="none">どのスロットも満たさない</option>
        </select>
        <span class="text-xs">次を満たす</span>
        {props.onRemove !== undefined && (
          <button type="button" class="text-gray-500 hover:text-red-600 px-1 ml-auto"
            onClick={props.onRemove}>✕</button>
        )}
      </div>

      {node.attrs.map((a, i) => (
        <div key={i} class="flex flex-wrap items-center gap-1 pl-3 py-0.5">
          <select class="border border-gray-300 rounded px-1" value={a.attr}
            onChange={(e) => {
              const attr = (e.target as HTMLSelectElement).value as SlotAttr;
              const attrs = [...node.attrs];
              attrs[i] = { attr, cond: defaultCond("一致", colOf(attr)) };
              props.onChange({ ...node, attrs });
            }}>
            {SLOT_ATTRS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ValueCondEditor
            column={colOf(a.attr)}
            cond={a.cond}
            pickerTarget={a.attr === "名前" ? { kind: "equip" } : null}
            onChange={(cond) => {
              const attrs = [...node.attrs];
              attrs[i] = { ...attrs[i], cond };
              props.onChange({ ...node, attrs });
            }}
          />
          <button type="button" class="text-gray-500 hover:text-red-600 px-1"
            onClick={() => props.onChange({ ...node, attrs: node.attrs.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}

      <div class="flex items-center gap-2 pl-3">
        <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
          onClick={() => props.onChange({
            ...node,
            attrs: [...node.attrs, { attr: "名前", cond: defaultCond("含む", colOf("名前")) }],
          })}>
          + 属性
        </button>
        <span class="text-xs text-gray-500">
          装備1〜{SLOT_COUNT}(メイン5 + 増設1)。展開すると {branchCount(node.quantity)} 分岐になります。
        </span>
      </div>
    </div>
  );
}
