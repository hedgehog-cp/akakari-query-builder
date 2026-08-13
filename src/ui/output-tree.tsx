import type { OutputNode } from "../model/types";
import type { Column } from "../schema/catalog";
import { COMMON_COLUMNS } from "../schema/common-columns";
import { ValueCondEditor, defaultCond } from "./value-cond-editor";
import { SlotNodeEditor } from "./slot-node";
import { nameTargetOf } from "./name-target";
import { CellInput, MapAreaSelect } from "./map-input";

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

export function OutputTree(props: {
  node: OutputNode;
  columns: Column[];
  onChange: (n: OutputNode) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  const depth = props.depth ?? 0;
  const node = props.node;

  if (node.kind === "column") {
    const col = props.columns.find((c) => c.name === node.column);
    return (
      <div class="flex flex-wrap items-center gap-1 py-0.5">
        <ColumnSelect
          columns={props.columns}
          value={node.column}
          onChange={(name) => {
            const next = props.columns.find((c) => c.name === name);
            props.onChange({ kind: "column", column: name, cond: defaultCond("一致", next) });
          }}
        />
        {node.column === "海域" && node.cond.kind === "eq" ? (
          <MapAreaSelect
            value={String(node.cond.values[0] ?? "")}
            onChange={(v) => props.onChange({ ...node, cond: { kind: "eq", values: v === "" ? [] : [v] } })}
          />
        ) : node.column === "マス" && node.cond.kind === "eq" ? (
          <CellInput
            value={String(node.cond.values[0] ?? "")}
            onChange={(v) => props.onChange({ ...node, cond: { kind: "eq", values: v === "" ? [] : [v] } })}
          />
        ) : (
          <ValueCondEditor
            column={col}
            cond={node.cond}
            pickerTarget={nameTargetOf(node.column)}
            onChange={(cond) => props.onChange({ ...node, cond })}
          />
        )}
        {props.onRemove !== undefined && (
          <button type="button" class="text-gray-500 hover:text-red-600 px-1"
            onClick={props.onRemove}>✕</button>
        )}
      </div>
    );
  }

  if (node.kind === "slot") {
    return (
      <SlotNodeEditor
        node={node}
        columns={props.columns}
        onChange={props.onChange}
        onRemove={props.onRemove}
      />
    );
  }

  const isNot = node.op === "NOT";
  const setChild = (i: number, child: OutputNode) => {
    const children = [...node.children];
    children[i] = child;
    props.onChange({ ...node, children });
  };
  const removeChild = (i: number) =>
    props.onChange({ ...node, children: node.children.filter((_, j) => j !== i) });

  return (
    <div class={depth === 0 ? "" : "border-l-2 border-emp-1 pl-2 ml-1"}>
      <div class="flex items-center gap-1 py-0.5">
        <select
          class="border border-gray-300 rounded px-1"
          value={node.op}
          onChange={(e) => {
            const op = (e.target as HTMLSelectElement).value as "AND" | "OR" | "NOT";
            // NOT は子を1つだけ持つ
            const children = op === "NOT" ? node.children.slice(0, 1) : node.children;
            props.onChange({ kind: "group", op, children });
          }}
        >
          <option value="AND">すべて満たす (AND)</option>
          <option value="OR">いずれか満たす (OR)</option>
          <option value="NOT">満たさない (NOT)</option>
        </select>
        {(!isNot || node.children.length === 0) && (
          <>
            <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
              onClick={() => props.onChange({ ...node, children: [...node.children, newColumnNode(props.columns)] })}>
              + 条件
            </button>
            <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
              onClick={() => props.onChange({
                ...node,
                children: [...node.children, { kind: "group", op: "OR", children: [] }],
              })}>
              + グループ
            </button>
            <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
              onClick={() => props.onChange({
                ...node,
                children: [...node.children, {
                  kind: "slot", side: "攻撃艦", quantity: { kind: "any" },
                  attrs: [{ attr: "名前", cond: { kind: "contains", values: [""] } }],
                }],
              })}>
              + 装備スロット条件
            </button>
          </>
        )}
        {props.onRemove !== undefined && (
          <button type="button" class="text-gray-500 hover:text-red-600 px-1 ml-auto"
            onClick={props.onRemove}>✕</button>
        )}
      </div>
      {node.children.map((c, i) => (
        <OutputTree
          key={i}
          node={c}
          columns={props.columns}
          depth={depth + 1}
          onChange={(n) => setChild(i, n)}
          onRemove={() => removeChild(i)}
        />
      ))}
    </div>
  );
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
            onClick={() => props.onChange(null)}>すべて消す</button>
        )}
      </div>
      {props.node === null
        ? <p class="text-xs text-gray-500">指定しない場合はすべての行が対象になります。</p>
        : <OutputTree node={props.node} columns={props.columns} onChange={props.onChange} />}
    </section>
  );
}
