import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import Sortable from "sortablejs";
import { reorder } from "./reorder";
import { Caret } from "./collapsible";

/** グループの演算子。 */
export type GroupOp = "AND" | "OR" | "NOT";

/** ヘッダに並べる追加ボタン1つぶん。 */
export type AddRuleAction = { label: string; onClick: () => void };

/**
 * グループをまたいだドラッグ&ドロップの設定。木のルートが用意して全段に配る。
 *
 * 行き来できるのは同じ group 名を持つリスト同士だけ。木ごとに別の名前にしないと、
 * 型の違う別の木(装備条件など)へ落とせてしまう。
 */
export type RuleDnd = {
  group: string;
  /** この RuleGroup の子リストがルートから見てどこにあるか。 */
  path: number[];
  onMove: (from: number[], fromIndex: number, to: number[], toIndex: number) => void;
};

/** data 属性に入れたパスを読み戻す。ルートの子リストは空文字。 */
function parsePath(raw: string | undefined): number[] | null {
  if (raw === undefined) return null;
  if (raw === "") return [];
  const parts = raw.split(".").map(Number);
  return parts.every(Number.isInteger) ? parts : null;
}

const OP_LABEL: Record<GroupOp, string> = {
  AND: "AND",
  OR: "OR",
  NOT: "NOT",
};

/** 演算子を示す静的バッジ。opEditable=false の RuleGroup や、AND固定の
 * 装備条件の属性リストなど、切り替えさせたくない箇所で使う。
 * 演算子ごとの色分けはしない(画面の中で演算子だけが原色で浮くのを避ける)。 */
export function OpBadge(props: { op: GroupOp }) {
  return (
    <span class="ctl border border-gray-300 bg-gray-50 text-gray-700 rounded px-1 font-bold inline-flex items-center whitespace-nowrap">
      {OP_LABEL[props.op]}
    </span>
  );
}

const DEFAULT_EMPTY_MESSAGE = "空です。条件を追加するか削除してください";

/** AND/OR/NOT でくくった子の並び。子の中身の描画は呼び出し側に任せる。 */
export function RuleGroup<T>(props: {
  op: GroupOp;
  children: T[];
  onOpChange?: (op: GroupOp) => void;
  onChildrenChange: (children: T[]) => void;
  /** 1行の中身の描画。子がグループならここで再帰的に RuleGroup を呼び出す。
   * index は入れ子のグループに配るパスを組み立てるために渡している。 */
  renderChild: (
    child: T,
    onChange: (c: T) => void,
    onRemove: () => void,
    index: number,
  ) => ComponentChildren;
  addRuleActions: AddRuleAction[];
  onAddGroup?: () => void;
  onRemove?: () => void;
  depth: number;
  /** 行の React key を決める。省略時はインデックスを使う(D&D 中の内部状態はインデックスに紐付く)。 */
  keyOf?: (item: T, index: number) => string | number;
  /** 子オブジェクトが編集で新しいオブジェクトに置き換わる直前に呼ばれる。
   * WeakMap ベースの keyOf を使う呼び出し側は、ここで旧オブジェクトの
   * キーを新オブジェクトに引き継ぎ、編集のたびに行が作り直される
   * (=フォーカスが外れる)のを防ぐ。 */
  onChildEdit?: (prev: T, next: T) => void;
  /** false なら演算子を編集不可の静的バッジにする(日時のOR固定など)。既定 true。 */
  opEditable?: boolean;
  /** 子が空のときの案内文。null で非表示(既定の空状態が正常な場合に使う)。
   * 省略時は既定文言を表示する。 */
  emptyMessage?: string | null;
  /** グループをまたいだ移動を許すときに渡す。省略時はこのリスト内の並べ替えだけ。 */
  dnd?: RuleDnd;
  /** ヘッダ行に追加ボタン群の後・空メッセージや✕ボタンの前に差し込む内容。
   * 装備条件の側/数量セレクトなど、RuleGroup自身が知らない専用コントロールを
   * ヘッダに混ぜ込むために使う。 */
  headerExtra?: ComponentChildren;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // SortableJS の onEnd はマウント時に1度だけ設定するため、
  // 常に最新の children / onChildrenChange / dnd を参照できるよう ref に逃がす。
  // パスは並べ替えで変わりうるので ref ではなくリストの data 属性から読む。
  const stateRef = useRef({
    children: props.children,
    onChildrenChange: props.onChildrenChange,
    dnd: props.dnd,
  });
  stateRef.current = {
    children: props.children,
    onChildrenChange: props.onChildrenChange,
    dnd: props.dnd,
  };

  useEffect(() => {
    const el = listRef.current;
    if (el === null) return;
    const dndGroup = props.dnd?.group;
    const sortable = Sortable.create(el, {
      handle: ".rule-drag-handle",
      animation: 150,
      // 入れ子のリストへ落とすときの判定。既定値のままだと、内側のリストの上に
      // 来てもなかなか受け取ってくれない。
      swapThreshold: 0.65,
      fallbackOnBody: true,
      group:
        dndGroup === undefined
          ? undefined
          : {
              name: dndGroup,
              pull: true,
              // NOT は子を1つしか持てないので、埋まっているグループには入れさせない。
              put: (to) => (to.el as HTMLElement).dataset.ruleFull !== "1",
            },
      onEnd: (evt) => {
        const { from, to, oldIndex, newIndex } = evt;
        if (oldIndex === undefined || newIndex === undefined) return;
        if (from === to) {
          if (oldIndex === newIndex) return;
          const { children, onChildrenChange } = stateRef.current;
          onChildrenChange(reorder(children, oldIndex, newIndex));
          return;
        }
        const dnd = stateRef.current.dnd;
        if (dnd === undefined) return;
        // SortableJS が動かした DOM をいったん元に戻してから状態を更新する。
        // Preact は自分が置いた DOM しか把握していないため、他所のリストへ
        // 移されたままにすると行が二重に残ったり消えたりする。
        from.insertBefore(evt.item, from.children[oldIndex] ?? null);
        const fromPath = parsePath((from as HTMLElement).dataset.rulePath);
        const toPath = parsePath((to as HTMLElement).dataset.rulePath);
        if (fromPath === null || toPath === null) return;
        dnd.onMove(fromPath, oldIndex, toPath, newIndex);
      },
    });
    return () => sortable.destroy();
  }, []);

  const isNot = props.op === "NOT";
  const setChild = (i: number, child: T) => {
    props.onChildEdit?.(props.children[i], child);
    const next = [...props.children];
    next[i] = child;
    props.onChildrenChange(next);
  };
  const removeChild = (i: number) =>
    props.onChildrenChange(props.children.filter((_, j) => j !== i));

  return (
    <div class={props.depth === 0 ? "" : "border-l-2 border-emp-1 pl-2 ml-1"}>
      {/* 幅が足りないときは要素ごと折り返す。flex-wrap がないと日本語の
          ボタン文字が1文字幅まで潰れて「+ 属 / 性」のように割れる。 */}
      <div class="flex flex-wrap items-center gap-1 py-0.5">
        <button
          type="button"
          // 見出しの三角より一回り小さくして、節と条件のどちらの開閉かを見分けやすくする。
          class="ctl text-[0.625rem] text-gray-500 hover:text-gray-800 w-4 inline-flex items-center justify-center"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "展開" : "折りたたむ"}
        >
          <Caret open={!collapsed} />
        </button>
        {props.opEditable === false ? (
          <OpBadge op={props.op} />
        ) : (
          <select
            class="ctl border border-gray-300 rounded px-1 font-bold shrink-0"
            value={props.op}
            onChange={(e) => props.onOpChange?.((e.target as HTMLSelectElement).value as GroupOp)}
          >
            <option value="AND">{OP_LABEL.AND}</option>
            <option value="OR">{OP_LABEL.OR}</option>
            <option value="NOT">{OP_LABEL.NOT}</option>
          </select>
        )}
        {(!isNot || props.children.length === 0) && (
          <>
            {props.addRuleActions.map((a) => (
              <button
                key={a.label}
                type="button"
                class="ctl border border-emp-1 rounded px-2 hover:bg-emp-4 whitespace-nowrap shrink-0"
                onClick={a.onClick}
              >
                {a.label}
              </button>
            ))}
            {props.onAddGroup !== undefined && (
              <button
                type="button"
                class="ctl border border-emp-1 rounded px-2 hover:bg-emp-4 whitespace-nowrap shrink-0"
                onClick={props.onAddGroup}
              >
                + グループ
              </button>
            )}
          </>
        )}
        {props.headerExtra}
        {props.children.length === 0 &&
          (props.emptyMessage === undefined ? DEFAULT_EMPTY_MESSAGE : props.emptyMessage) !==
            null && (
            <span class="text-xs text-red-600 whitespace-nowrap">
              {props.emptyMessage === undefined ? DEFAULT_EMPTY_MESSAGE : props.emptyMessage}
            </span>
          )}
        {props.onRemove !== undefined && (
          <button
            type="button"
            class="ctl text-gray-500 hover:text-red-600 px-1 ml-auto"
            onClick={props.onRemove}
          >
            ✕
          </button>
        )}
      </div>
      {/* 空のグループは高さが無くなり、他所からドラッグしてきた行を受け取れない。
          D&D を許している間だけ、落とし先として分かる高さの枠を残す。 */}
      <div
        ref={listRef}
        class={
          collapsed
            ? "hidden"
            : props.dnd !== undefined && props.children.length === 0
              ? "min-h-6 border border-dashed border-gray-300 rounded"
              : ""
        }
        data-rule-path={props.dnd === undefined ? undefined : props.dnd.path.join(".")}
        data-rule-full={isNot && props.children.length > 0 ? "1" : undefined}
      >
        {props.children.map((c, i) => (
          <div key={props.keyOf ? props.keyOf(c, i) : i} class="flex items-start gap-1">
            <span
              class="rule-drag-handle ctl cursor-grab text-gray-400 px-1 select-none inline-flex items-center"
              title="ドラッグで並べ替え"
            >
              ⋮⋮
            </span>
            <div class="flex-1 min-w-0">
              {props.renderChild(
                c,
                (n) => setChild(i, n),
                () => removeChild(i),
                i,
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
