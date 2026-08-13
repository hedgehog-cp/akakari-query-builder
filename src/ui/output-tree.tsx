import type { OutputNode } from "../model/types";
import type { Column } from "../schema/catalog";
import { COMMON_COLUMNS } from "../schema/common-columns";
import { ValueCondEditor, defaultCond } from "./value-cond-editor";
import { SlotNodeEditor } from "./slot-node";
import { nameTargetOf } from "./name-target";
import { CellInput, MapAreaSelect } from "./map-input";
import { RuleGroup } from "./rule-group";

function ColumnSelect(props: {
  columns: Column[];
  value: string;
  onChange: (name: string) => void;
}) {
  const known = new Set(props.columns.map((c) => c.name));
  const common = COMMON_COLUMNS.filter((n) => known.has(n));
  const commonSet = new Set(common);
  const rest = props.columns.map((c) => c.name).filter((n) => !commonSet.has(n));
  const missing = !known.has(props.value);
  return (
    <select
      class={`border rounded px-1 max-w-[16rem] ${missing ? "border-red-500 bg-red-50" : "border-gray-300"}`}
      value={props.value}
      onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}
    >
      {missing && <option value={props.value}>{props.value}(この戦闘種別に存在しません)</option>}
      <optgroup label="検証でよく使う列">
        {common.map((n) => <option key={n} value={n}>{n}</option>)}
      </optgroup>
      <optgroup label="すべての列">
        {rest.map((n) => <option key={n} value={n}>{n}</option>)}
      </optgroup>
    </select>
  );
}

function newColumnNode(columns: Column[]): OutputNode {
  const first = columns[0]?.name ?? "";
  return { kind: "column", column: first, cond: defaultCond("一致", columns[0]) };
}

function newSlotNode(): OutputNode {
  return {
    kind: "slot", side: "攻撃艦", quantity: { kind: "any" },
    attrs: [{ attr: "名前", cond: { kind: "contains", values: [""] } }],
  };
}

/**
 * RuleGroup の行キー。オブジェクト参照ごとに一意な番号を割り当てて使い回す。
 * reorder() は配列内の要素を並べ替えるだけで個々の OutputNode オブジェクトの参照は
 * 変えないため、ドラッグでの並べ替えでは同じキーが保たれる(SortableJSのDOM操作と
 * Preactの再描画がズレて見た目が更新されなくなる問題を防ぐ)。一方、列や条件値の
 * 編集はスプレッド構文で新しいオブジェクトを作る(`{ ...node, cond }` など)ため、
 * 内容が変わった行には新しいキーが振られる。
 */
const nodeKeys = new WeakMap<OutputNode, number>();
let nextNodeKey = 0;
function keyOf(node: OutputNode): number {
  let key = nodeKeys.get(node);
  if (key === undefined) {
    key = nextNodeKey++;
    nodeKeys.set(node, key);
  }
  return key;
}

function renderNode(
  node: OutputNode,
  columns: Column[],
  depth: number,
  onChange: (n: OutputNode) => void,
  onRemove: (() => void) | undefined,
) {
  if (node.kind === "column") {
    const col = columns.find((c) => c.name === node.column);
    return (
      <div class="flex flex-wrap items-center gap-1 py-0.5">
        <ColumnSelect
          columns={columns}
          value={node.column}
          onChange={(name) => {
            const next = columns.find((c) => c.name === name);
            onChange({ kind: "column", column: name, cond: defaultCond("一致", next) });
          }}
        />
        {node.column === "海域" && node.cond.kind === "eq" ? (
          <MapAreaSelect
            value={String(node.cond.values[0] ?? "")}
            onChange={(v) => onChange({ ...node, cond: { kind: "eq", values: v === "" ? [] : [v] } })}
          />
        ) : node.column === "マス" && node.cond.kind === "eq" ? (
          <CellInput
            value={String(node.cond.values[0] ?? "")}
            onChange={(v) => onChange({ ...node, cond: { kind: "eq", values: v === "" ? [] : [v] } })}
          />
        ) : (
          <ValueCondEditor
            column={col}
            cond={node.cond}
            pickerTarget={nameTargetOf(node.column)}
            onChange={(cond) => onChange({ ...node, cond })}
          />
        )}
        {onRemove !== undefined && (
          <button type="button" class="text-gray-500 hover:text-red-600 px-1" onClick={onRemove}>✕</button>
        )}
      </div>
    );
  }

  if (node.kind === "slot") {
    return <SlotNodeEditor node={node} columns={columns} onChange={onChange} onRemove={onRemove} />;
  }

  return (
    <RuleGroup<OutputNode>
      op={node.op}
      children={node.children}
      depth={depth}
      onOpChange={(op) => {
        const children = op === "NOT" ? node.children.slice(0, 1) : node.children;
        onChange({ kind: "group", op, children });
      }}
      onChildrenChange={(children) => onChange({ ...node, children })}
      addRuleActions={[
        { label: "+ 条件", onClick: () => onChange({ ...node, children: [...node.children, newColumnNode(columns)] }) },
        { label: "+ 装備スロット条件", onClick: () => onChange({ ...node, children: [...node.children, newSlotNode()] }) },
      ]}
      onAddGroup={() => onChange({ ...node, children: [...node.children, { kind: "group", op: "OR", children: [] }] })}
      onRemove={onRemove}
      renderChild={(child, onChildChange, onChildRemove) =>
        renderNode(child, columns, depth + 1, onChildChange, onChildRemove)
      }
      keyOf={keyOf}
    />
  );
}

export function OutputTree(props: {
  node: OutputNode;
  columns: Column[];
  onChange: (n: OutputNode) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  return <>{renderNode(props.node, props.columns, props.depth ?? 0, props.onChange, props.onRemove)}</>;
}

export function OutputSection(props: {
  node: OutputNode | null;
  columns: Column[];
  onChange: (n: OutputNode | null) => void;
}) {
  return (
    <section class="bg-bg-panel border border-gray-300 rounded p-3">
      <div class="flex items-center gap-2 mb-2">
        <h2 class="font-bold">出力</h2>
        {props.node === null ? (
          <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
            onClick={() => props.onChange({ kind: "group", op: "AND", children: [] })}>
            条件を組み立てる
          </button>
        ) : (
          <button type="button" class="text-xs text-gray-500 hover:text-red-600 ml-auto"
            onClick={() => {
              if (confirm("出力条件をすべて消します。よろしいですか?")) props.onChange(null);
            }}>
            すべて消す
          </button>
        )}
      </div>
      {props.node === null
        ? <p class="text-xs text-gray-500">指定しない場合はすべての行が対象になります。</p>
        : <OutputTree node={props.node} columns={props.columns} onChange={props.onChange} />}
    </section>
  );
}
