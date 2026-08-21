import { ITEM_ATTRS, type CountItemNode, type ItemAttr, type ItemCond } from "../model/types";
import { master } from "../master/load";
import { ValueCondEditor, defaultCond } from "./value-cond-editor";
import { RuleGroup } from "./rule-group";

/** 装備の条件は CSV の列ではないので、列メタは持たない。 */
const NO_COLUMN = undefined;

function newAttrCond(): ItemCond {
  return { kind: "attr", attr: "装備名", cond: defaultCond("一致", NO_COLUMN) };
}

/**
 * RuleGroup の行キー。オブジェクト参照ごとに一意な番号を割り当てて使い回す。
 * reorder() は配列内の要素を並べ替えるだけで個々のオブジェクトの参照は
 * 変えないため、ドラッグでの並べ替えでは同じキーが保たれる(SortableJSのDOM操作と
 * Preactの再描画がズレて見た目が更新されなくなる問題を防ぐ)。値や条件の編集は
 * スプレッド構文で新しいオブジェクトを作る(`{ ...cond, ... }` など)ため本来は
 * 別キーになってしまうが、RuleGroup の onChildEdit で旧オブジェクトのキーを
 * 新オブジェクトへ引き継いでいるため、編集のたびに行(=DOM)が作り直されて
 * 入力中のフォーカスが外れる、ということは起きない。ItemCond と CountItemNode
 * は別の型なので、WeakMap も型ごとに分けて持つ。
 */
const itemCondKeys = new WeakMap<ItemCond, number>();
let nextItemCondKey = 0;
function itemCondKeyOf(cond: ItemCond): number {
  let key = itemCondKeys.get(cond);
  if (key === undefined) {
    key = nextItemCondKey++;
    itemCondKeys.set(cond, key);
  }
  return key;
}

const countNodeKeys = new WeakMap<CountItemNode, number>();
let nextCountNodeKey = 0;
function countNodeKeyOf(node: CountItemNode): number {
  let key = countNodeKeys.get(node);
  if (key === undefined) {
    key = nextCountNodeKey++;
    countNodeKeys.set(node, key);
  }
  return key;
}

function renderItemCond(
  cond: ItemCond,
  depth: number,
  onChange: (c: ItemCond) => void,
  onRemove: (() => void) | undefined,
) {
  if (cond.kind === "exists") {
    return (
      <div class="flex items-center gap-1 py-0.5">
        <span class="text-xs">装備が存在する</span>
        <button
          type="button"
          class="border border-emp-1 rounded px-2 py-0.5 hover:bg-emp-4"
          onClick={() => onChange(newAttrCond())}
        >
          条件を付ける
        </button>
        {onRemove !== undefined && (
          <button type="button" class="text-gray-500 hover:text-red-600 px-1" onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
    );
  }

  if (cond.kind === "attr") {
    const isCategory = cond.attr === "装備カテゴリ";
    return (
      <div class="flex flex-wrap items-center gap-1 py-0.5">
        <select
          class="border border-gray-300 rounded px-1"
          value={cond.attr}
          onChange={(e) =>
            onChange({
              kind: "attr",
              attr: (e.target as HTMLSelectElement).value as ItemAttr,
              cond: defaultCond("一致", NO_COLUMN),
            })
          }
        >
          {ITEM_ATTRS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <ValueCondEditor
          column={NO_COLUMN}
          cond={cond.cond}
          pickerTarget={
            cond.attr === "装備名"
              ? { kind: "equip" }
              : cond.attr === "装備ID"
                ? { kind: "equipId" }
                : null
          }
          onChange={(c) => onChange({ ...cond, cond: c })}
        />
        {isCategory && (
          <datalist id="equip-categories">
            {master.equipTypes.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        )}
        {onRemove !== undefined && (
          <button type="button" class="text-gray-500 hover:text-red-600 px-1" onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
    );
  }

  // group
  return (
    <RuleGroup<ItemCond>
      op={cond.op}
      children={cond.children}
      depth={depth}
      onOpChange={(op) => {
        const children = op === "NOT" ? cond.children.slice(0, 1) : cond.children;
        onChange({ kind: "group", op, children });
      }}
      onChildrenChange={(children) => onChange({ ...cond, children })}
      addRuleActions={[
        {
          label: "+ 条件",
          onClick: () => onChange({ ...cond, children: [...cond.children, newAttrCond()] }),
        },
      ]}
      onAddGroup={() =>
        onChange({
          ...cond,
          children: [...cond.children, { kind: "group", op: "OR", children: [] }],
        })
      }
      onRemove={onRemove}
      renderChild={(child, onChildChange, onChildRemove) =>
        renderItemCond(child, depth + 1, onChildChange, onChildRemove)
      }
      keyOf={itemCondKeyOf}
      onChildEdit={(prev, next) => {
        const k = itemCondKeys.get(prev);
        if (k !== undefined) itemCondKeys.set(next, k);
      }}
    />
  );
}

function renderCountNode(
  node: CountItemNode,
  depth: number,
  onChange: (n: CountItemNode) => void,
  onRemove: (() => void) | undefined,
) {
  if (node.kind === "count") {
    return (
      <div class="border border-gray-200 rounded p-2 my-1">
        <div class="flex flex-wrap items-center gap-1">
          <span class="text-xs">条件を満たすスロット数が</span>
          <ValueCondEditor
            column={NO_COLUMN}
            cond={node.count}
            onChange={(c) => onChange({ ...node, count: c })}
          />
          {onRemove !== undefined && (
            <button
              type="button"
              class="text-gray-500 hover:text-red-600 px-1 ml-auto"
              onClick={onRemove}
            >
              ✕
            </button>
          )}
        </div>
        <div class="pl-3">
          {renderItemCond(node.cond, depth + 1, (c) => onChange({ ...node, cond: c }), undefined)}
        </div>
      </div>
    );
  }

  return (
    <RuleGroup<CountItemNode>
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
          label: "+ 装備数の条件",
          onClick: () =>
            onChange({
              ...node,
              children: [
                ...node.children,
                {
                  kind: "count",
                  count: { kind: "cmp", op: "以上", value: 1 },
                  cond: { kind: "exists" },
                },
              ],
            }),
        },
      ]}
      onAddGroup={() =>
        onChange({
          ...node,
          children: [...node.children, { kind: "group", op: "OR", children: [] }],
        })
      }
      onRemove={onRemove}
      renderChild={(child, onChildChange, onChildRemove) =>
        renderCountNode(child, depth + 1, onChildChange, onChildRemove)
      }
      keyOf={countNodeKeyOf}
      onChildEdit={(prev, next) => {
        const k = countNodeKeys.get(prev);
        if (k !== undefined) countNodeKeys.set(next, k);
      }}
    />
  );
}

/** 攻撃艦・防御艦の装備条件をまとめる枠。 */
export function ItemSection(props: {
  title: "攻撃艦装備" | "防御艦装備";
  node: CountItemNode | null;
  onChange: (n: CountItemNode | null) => void;
}) {
  return (
    <section class="bg-bg-panel border border-gray-300 rounded p-3">
      <div class="flex items-center gap-2 mb-1">
        <h2 class="font-bold text-purple-900">{props.title}</h2>
        {props.node === null ? (
          <button
            type="button"
            class="border border-emp-1 rounded px-2 py-0.5 hover:bg-emp-4"
            onClick={() =>
              props.onChange({
                kind: "count",
                count: { kind: "cmp", op: "以上", value: 1 },
                cond: { kind: "exists" },
              })
            }
          >
            条件を付ける
          </button>
        ) : (
          <button
            type="button"
            class="text-xs text-gray-500 hover:text-red-600 ml-auto"
            onClick={() => {
              if (confirm(`${props.title}の条件をすべて消します。よろしいですか?`))
                props.onChange(null);
            }}
          >
            すべて消す
          </button>
        )}
      </div>
      <p class="text-xs text-gray-500 mb-1">
        この節は CSV の列だけでは評価できません(装備ID・カテゴリ・装備自体の性能は CSV
        に列がありません)。 プレビューでも QUERY 出力でも無視されます。 CSV で判定したい場合は
        <strong>出力節の「装備スロット条件」</strong>を使ってください。
      </p>
      <p class="text-xs text-gray-500 mb-2">
        数えるのはメイン1〜4スロットと増設の計5枠です。
        <strong>メイン5スロット目は数に入りません</strong>
        (logbook の実装がそうなっています)。装備スロット条件なら装備1〜6の6枠を見られます。
      </p>
      {props.node !== null && renderCountNode(props.node, 0, props.onChange, undefined)}
    </section>
  );
}
