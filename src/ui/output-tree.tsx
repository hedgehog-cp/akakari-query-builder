import type { OutputNode } from "../model/types";
import type { Column } from "../schema/catalog";
import { ValueCondEditor, defaultCond } from "./value-cond-editor";
import { SlotNodeEditor } from "./slot-node";
import { DisplayItemNodeEditor } from "./display-item-node";
import { nameTargetOf } from "./name-target";
import { CellInput, MapAreaSelect, parseCells } from "./map-input";
import { RuleGroup, type RuleDnd } from "./rule-group";
import { moveNode, type TreeAdapter } from "./tree-move";

function ColumnSelect(props: {
  columns: Column[];
  value: string;
  onChange: (name: string) => void;
}) {
  const known = new Set(props.columns.map((c) => c.name));
  const missing = !known.has(props.value);
  return (
    <select
      class={`ctl shrink-0 border rounded px-1 max-w-[16rem] ${missing ? "border-red-500 bg-red-50" : "border-gray-300"}`}
      value={props.value}
      onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}
    >
      {missing && <option value={props.value}>{props.value}(この戦闘種別に存在しません)</option>}
      {props.columns.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function newColumnNode(columns: Column[]): OutputNode {
  const first = columns[0]?.name ?? "";
  return { kind: "column", column: first, cond: defaultCond("一致", columns[0]) };
}

function newSlotNode(): OutputNode {
  return {
    kind: "slot",
    side: "攻撃艦",
    quantity: { kind: "any" },
    attrs: [{ attr: "名前", cond: { kind: "contains", values: [""] } }],
  };
}

function newDisplayItemNode(): OutputNode {
  return {
    kind: "displayItem",
    quantity: { kind: "any" },
    cond: { kind: "contains", values: [""] },
  };
}

/**
 * RuleGroup の行キー。オブジェクト参照ごとに一意な番号を割り当てて使い回す。
 * reorder() は配列内の要素を並べ替えるだけで個々の OutputNode オブジェクトの参照は
 * 変えないため、ドラッグでの並べ替えでは同じキーが保たれる(SortableJSのDOM操作と
 * Preactの再描画がズレて見た目が更新されなくなる問題を防ぐ)。列や条件値の編集は
 * スプレッド構文で新しいオブジェクトを作る(`{ ...node, cond }` など)ため本来は
 * 別キーになってしまうが、RuleGroup の onChildEdit で旧オブジェクトのキーを
 * 新オブジェクトへ引き継いでいるため、編集のたびに行(=DOM)が作り直されて
 * 入力中のフォーカスが外れる、ということは起きない。
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

/**
 * 木をまたいだ移動でグループを作り直すときに使う。行キーを引き継ぐのは
 * onChildEdit と同じ理由で、移動していないグループの行が作り直されて
 * 折りたたみ状態やドラッグの下準備が飛ぶのを防ぐため。
 */
const outputAdapter: TreeAdapter<OutputNode> = {
  childrenOf: (n) => (n.kind === "group" ? n.children : null),
  withChildren: (n, children) => {
    if (n.kind !== "group") return n;
    const next: OutputNode = { ...n, children };
    const k = nodeKeys.get(n);
    if (k !== undefined) nodeKeys.set(next, k);
    return next;
  },
};

/** グループをまたいだ D&D の名前。出力節の木は画面に1つなので固定でよい。 */
const DND_GROUP = "output-node";

function renderNode(
  node: OutputNode,
  columns: Column[],
  depth: number,
  onChange: (n: OutputNode) => void,
  onRemove: (() => void) | undefined,
  dnd: Omit<RuleDnd, "path"> | undefined,
  path: number[],
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
            onChange={(v) =>
              onChange({ ...node, cond: { kind: "eq", values: v === "" ? [] : [v] } })
            }
          />
        ) : node.column === "マス" &&
          node.cond.kind === "eq" &&
          // 海域が混ざった並びは専用UIでは表せないので、素の条件エディタに任せる。
          parseCells(node.cond.values) !== null ? (
          <CellInput
            values={node.cond.values}
            onChange={(v) => onChange({ ...node, cond: { kind: "eq", values: v } })}
          />
        ) : (
          // 中身にあわせて縮む枠に入れる。行いっぱいに広げると、条件が短いときでも
          // 妥当でないことを示す赤枠が右端まで伸びてしまう。min-w-0 は、狭いときに
          // 削除ボタンだけが次の行へ落ちないよう、ここが縮めるようにするため。
          <div class="min-w-0">
            <ValueCondEditor
              column={col}
              cond={node.cond}
              pickerTarget={nameTargetOf(node.column)}
              onChange={(cond) => onChange({ ...node, cond })}
            />
          </div>
        )}
        {onRemove !== undefined && (
          <button
            type="button"
            class="ctl text-gray-500 hover:text-red-600 px-1 shrink-0"
            onClick={onRemove}
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  if (node.kind === "slot") {
    return <SlotNodeEditor node={node} columns={columns} onChange={onChange} onRemove={onRemove} />;
  }

  if (node.kind === "displayItem") {
    return (
      <DisplayItemNodeEditor
        node={node}
        columns={columns}
        onChange={onChange}
        onRemove={onRemove}
      />
    );
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
        {
          label: "+ 条件",
          onClick: () =>
            onChange({ ...node, children: [...node.children, newColumnNode(columns)] }),
        },
        {
          label: "+ 装備条件",
          onClick: () => onChange({ ...node, children: [...node.children, newSlotNode()] }),
        },
        {
          label: "+ 表示装備条件",
          onClick: () => onChange({ ...node, children: [...node.children, newDisplayItemNode()] }),
        },
      ]}
      onAddGroup={() =>
        onChange({
          ...node,
          children: [...node.children, { kind: "group", op: "OR", children: [] }],
        })
      }
      onRemove={onRemove}
      dnd={dnd === undefined ? undefined : { ...dnd, path }}
      renderChild={(child, onChildChange, onChildRemove, index) =>
        renderNode(child, columns, depth + 1, onChildChange, onChildRemove, dnd, [...path, index])
      }
      keyOf={keyOf}
      onChildEdit={(prev, next) => {
        const k = nodeKeys.get(prev);
        if (k !== undefined) nodeKeys.set(next, k);
      }}
    />
  );
}

/** 出力節の木を再帰的に描く。 */
export function OutputTree(props: {
  node: OutputNode;
  columns: Column[];
  onChange: (n: OutputNode) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  const dnd = {
    group: DND_GROUP,
    onMove: (from: number[], fromIndex: number, to: number[], toIndex: number) =>
      props.onChange(moveNode(props.node, from, fromIndex, to, toIndex, outputAdapter)),
  };
  return (
    <>
      {renderNode(
        props.node,
        props.columns,
        props.depth ?? 0,
        props.onChange,
        props.onRemove,
        dnd,
        [],
      )}
    </>
  );
}

/** 出力節の枠。木が空のときは条件なしを表す。 */
export function OutputSection(props: {
  node: OutputNode | null;
  columns: Column[];
  onChange: (n: OutputNode | null) => void;
}) {
  return (
    // 左列の最後の枠。余った高さを吸って右の出力欄と下端を揃えるため h-full。
    <section class="bg-bg-panel border border-gray-300 rounded p-3 h-full">
      <div class="flex items-center gap-2 mb-2">
        <h2 class="font-bold text-purple-900">出力</h2>
        {props.node === null ? (
          <button
            type="button"
            class="ctl border border-emp-1 rounded px-2 hover:bg-emp-4"
            onClick={() => props.onChange({ kind: "group", op: "AND", children: [] })}
          >
            条件を組み立てる
          </button>
        ) : (
          <button
            type="button"
            class="text-xs text-gray-500 hover:text-red-600 ml-auto"
            onClick={() => {
              if (confirm("出力条件をすべて消します。よろしいですか?")) props.onChange(null);
            }}
          >
            すべて消す
          </button>
        )}
      </div>
      {props.node === null ? (
        <p class="text-xs text-gray-500">指定しない場合はすべての行が対象になります。</p>
      ) : (
        <OutputTree node={props.node} columns={props.columns} onChange={props.onChange} />
      )}
    </section>
  );
}
