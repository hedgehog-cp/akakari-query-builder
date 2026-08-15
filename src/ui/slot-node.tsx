import { SLOT_COUNT, type OutputNode, type Side, type SlotAttr, type SlotAttrCond, type SlotQuantity } from "../model/types";
import { combinations } from "../model/expand";
import type { Column } from "../schema/catalog";
import { ValueCondEditor, defaultCond } from "./value-cond-editor";
import { RuleGroup } from "./rule-group";

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

/** RuleGroup の行キー。output-tree.tsx / date-section.tsx と同じパターン。 */
const attrKeys = new WeakMap<SlotAttrCond, number>();
let nextAttrKey = 0;
function keyOf(a: SlotAttrCond): number {
  let key = attrKeys.get(a);
  if (key === undefined) {
    key = nextAttrKey++;
    attrKeys.set(a, key);
  }
  return key;
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
    <div class="border-l-2 border-emp-1 pl-2 ml-1 my-1">
      <div class="text-xs font-bold text-gray-600">装備スロット条件</div>
      <RuleGroup<SlotAttrCond>
        op="AND"
        opEditable={false}
        emptyMessage="属性が設定されていません"
        children={node.attrs}
        depth={0}
        onChildrenChange={(attrs) => props.onChange({ ...node, attrs })}
        addRuleActions={[{
          label: "+ 属性",
          onClick: () => props.onChange({
            ...node, attrs: [...node.attrs, { attr: "名前", cond: defaultCond("含む", colOf("名前")) }],
          }),
        }]}
        headerExtra={
          <>
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
            <span class="text-xs text-gray-500">
              (装備1〜{SLOT_COUNT}、展開すると{branchCount(node.quantity)}分岐)
            </span>
          </>
        }
        renderChild={(a, onChange, onRemove) => (
          <div class="flex flex-wrap items-center gap-1 py-0.5">
            <select class="border border-gray-300 rounded px-1" value={a.attr}
              onChange={(e) => {
                const attr = (e.target as HTMLSelectElement).value as SlotAttr;
                onChange({ attr, cond: defaultCond("一致", colOf(attr)) });
              }}>
              {SLOT_ATTRS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <ValueCondEditor
              column={colOf(a.attr)}
              cond={a.cond}
              pickerTarget={a.attr === "名前" ? { kind: "equip" } : null}
              onChange={(cond) => onChange({ ...a, cond })}
            />
            {onRemove !== undefined && (
              <button type="button" class="text-gray-500 hover:text-red-600 px-1" onClick={onRemove}>✕</button>
            )}
          </div>
        )}
        keyOf={keyOf}
        onChildEdit={(prev, next) => {
          const k = attrKeys.get(prev);
          if (k !== undefined) attrKeys.set(next, k);
        }}
        onRemove={props.onRemove}
      />
    </div>
  );
}
