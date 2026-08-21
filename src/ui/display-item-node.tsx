import { DISPLAY_ITEM_COUNT } from "../model/expand";
import type { DisplayItemQuantity, OutputNode } from "../model/types";
import type { Column } from "../schema/catalog";
import { ValueCondEditor } from "./value-cond-editor";

type DisplayItemNode = Extract<OutputNode, { kind: "displayItem" }>;

function quantityValue(q: DisplayItemQuantity): string {
  return q.kind;
}
function parseQuantity(v: string): DisplayItemQuantity {
  return v === "all" ? { kind: "all" } : { kind: "any" };
}

/** 表示装備の条件(いずれか / すべて)を編集する行。 */
export function DisplayItemNodeEditor(props: {
  node: DisplayItemNode;
  columns: Column[];
  onChange: (n: OutputNode) => void;
  onRemove?: () => void;
}) {
  const node = props.node;
  const col = props.columns.find((c) => c.name === "表示装備1");

  return (
    <div class="border-l-2 border-emp-1 pl-2 ml-1 my-1">
      <div class="flex flex-wrap items-center gap-1 py-0.5">
        <span class="font-bold text-xs">表示装備条件</span>
        <select
          class="border border-gray-300 rounded px-1"
          value={quantityValue(node.quantity)}
          onChange={(e) =>
            props.onChange({
              ...node,
              quantity: parseQuantity((e.target as HTMLSelectElement).value),
            })
          }
        >
          <option value="any">いずれかが</option>
          <option value="all">すべてが</option>
        </select>
        <span class="text-xs">次を満たす</span>
        <ValueCondEditor
          column={col}
          cond={node.cond}
          pickerTarget={{ kind: "equip" }}
          onChange={(cond) => props.onChange({ ...node, cond })}
        />
        {props.onRemove !== undefined && (
          <button
            type="button"
            class="text-gray-500 hover:text-red-600 px-1 ml-auto"
            onClick={props.onRemove}
          >
            ✕
          </button>
        )}
      </div>
      <p class="text-xs text-gray-500">
        表示装備1〜{DISPLAY_ITEM_COUNT}。展開すると {DISPLAY_ITEM_COUNT} 分岐になります。
      </p>
    </div>
  );
}
