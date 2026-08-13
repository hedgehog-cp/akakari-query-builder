import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import Sortable from "sortablejs";
import { reorder } from "./reorder";

export type GroupOp = "AND" | "OR" | "NOT";

export type AddRuleAction = { label: string; onClick: () => void };

const OP_LABEL: Record<GroupOp, string> = {
  AND: "すべて満たす (AND)",
  OR: "いずれか満たす (OR)",
  NOT: "満たさない (NOT)",
};

/** 演算子ごとの色。画像で示された操作感に合わせ、種類が一目でわかるようにする。 */
const OP_COLOR: Record<GroupOp, string> = {
  AND: "bg-blue-100 border-blue-400 text-blue-900",
  OR: "bg-amber-100 border-amber-500 text-amber-900",
  NOT: "bg-rose-100 border-rose-400 text-rose-900",
};

/**
 * 「+ 条件」ボタン。actions が2つ以上あれば「+ 条件 ▾」の分割ボタンにして、
 * 「+ 装備スロット条件」のような副次的な追加操作を同じボタンから選べるようにする。
 */
function AddRuleButton(props: { actions: AddRuleAction[] }) {
  const [open, setOpen] = useState(false);
  if (props.actions.length === 1) {
    return (
      <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
        onClick={props.actions[0].onClick}>
        {props.actions[0].label}
      </button>
    );
  }
  return (
    <div class="relative">
      <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
        onClick={() => setOpen(true)}>
        {props.actions[0].label} ▾
      </button>
      {open && (
        <>
          <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div class="absolute left-0 top-full mt-1 z-50 bg-bg-panel border border-gray-300 rounded shadow-lg whitespace-nowrap">
            {props.actions.map((a) => (
              <button key={a.label} type="button"
                class="block w-full text-left px-3 py-1 text-xs hover:bg-emp-4"
                onClick={() => { a.onClick(); setOpen(false); }}>
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function RuleGroup<T>(props: {
  op: GroupOp;
  children: T[];
  onOpChange: (op: GroupOp) => void;
  onChildrenChange: (children: T[]) => void;
  /** 1行の中身の描画。子がグループならここで再帰的に RuleGroup を呼び出す。 */
  renderChild: (child: T, onChange: (c: T) => void, onRemove: () => void) => ComponentChildren;
  addRuleActions: AddRuleAction[];
  onAddGroup: () => void;
  onRemove?: () => void;
  depth: number;
  /** 行の React key を決める。省略時はインデックスを使う(D&D 中の内部状態はインデックスに紐付く)。 */
  keyOf?: (item: T, index: number) => string | number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // SortableJS の onEnd はマウント時に1度だけ設定するため、
  // 常に最新の children / onChildrenChange を参照できるよう ref に逃がす。
  const stateRef = useRef({ children: props.children, onChildrenChange: props.onChildrenChange });
  stateRef.current = { children: props.children, onChildrenChange: props.onChildrenChange };

  useEffect(() => {
    const el = listRef.current;
    if (el === null) return;
    const sortable = Sortable.create(el, {
      handle: ".rule-drag-handle",
      animation: 150,
      onEnd: (evt) => {
        if (evt.oldIndex === undefined || evt.newIndex === undefined) return;
        if (evt.oldIndex === evt.newIndex) return;
        const { children, onChildrenChange } = stateRef.current;
        onChildrenChange(reorder(children, evt.oldIndex, evt.newIndex));
      },
    });
    return () => sortable.destroy();
  }, []);

  const isNot = props.op === "NOT";
  const setChild = (i: number, child: T) => {
    const next = [...props.children];
    next[i] = child;
    props.onChildrenChange(next);
  };
  const removeChild = (i: number) =>
    props.onChildrenChange(props.children.filter((_, j) => j !== i));

  return (
    <div class={props.depth === 0 ? "" : "border-l-2 border-emp-1 pl-2 ml-1"}>
      <div class="flex items-center gap-1 py-0.5">
        <button type="button"
          class="text-gray-500 hover:text-gray-800 w-4 text-center"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "展開" : "折りたたむ"}>
          {collapsed ? "▸" : "▾"}
        </button>
        <select
          class={`border rounded px-1 text-xs font-bold ${OP_COLOR[props.op]}`}
          value={props.op}
          onChange={(e) => props.onOpChange((e.target as HTMLSelectElement).value as GroupOp)}
        >
          <option value="AND">{OP_LABEL.AND}</option>
          <option value="OR">{OP_LABEL.OR}</option>
          <option value="NOT">{OP_LABEL.NOT}</option>
        </select>
        {(!isNot || props.children.length === 0) && (
          <>
            <AddRuleButton actions={props.addRuleActions} />
            <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
              onClick={props.onAddGroup}>
              + グループ
            </button>
          </>
        )}
        {props.children.length === 0 && (
          <span class="text-xs text-red-600">空です。条件を追加するか削除してください</span>
        )}
        {props.onRemove !== undefined && (
          <button type="button" class="text-gray-500 hover:text-red-600 px-1 ml-auto"
            onClick={props.onRemove}>✕</button>
        )}
      </div>
      <div ref={listRef} class={collapsed ? "hidden" : ""}>
        {props.children.map((c, i) => (
          <div key={props.keyOf ? props.keyOf(c, i) : i} class="flex items-start gap-1">
            <span class="rule-drag-handle cursor-grab text-gray-400 px-1 py-1 select-none"
              title="ドラッグで並べ替え">⋮⋮</span>
            <div class="flex-1 min-w-0">
              {props.renderChild(c, (n) => setChild(i, n), () => removeChild(i))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
