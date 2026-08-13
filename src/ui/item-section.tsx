import { ITEM_ATTRS, type CountItemNode, type ItemAttr, type ItemCond } from "../model/types";
import { master } from "../master/load";
import { ValueCondEditor, defaultCond } from "./value-cond-editor";

/** 装備の条件は CSV の列ではないので、列メタは持たない。 */
const NO_COLUMN = undefined;

function ItemCondEditor(props: {
  cond: ItemCond;
  onChange: (c: ItemCond) => void;
  onRemove?: () => void;
}) {
  const cond = props.cond;

  if (cond.kind === "exists") {
    return (
      <div class="flex items-center gap-1 py-0.5">
        <span class="text-xs">装備が存在する</span>
        <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
          onClick={() => props.onChange({ kind: "attr", attr: "装備名", cond: defaultCond("一致", NO_COLUMN) })}>
          条件を付ける
        </button>
        {props.onRemove !== undefined && (
          <button type="button" class="text-gray-500 hover:text-red-600 px-1" onClick={props.onRemove}>✕</button>
        )}
      </div>
    );
  }

  if (cond.kind === "attr") {
    const isCategory = cond.attr === "装備カテゴリ";
    return (
      <div class="flex flex-wrap items-center gap-1 py-0.5">
        <select class="border border-gray-300 rounded px-1" value={cond.attr}
          onChange={(e) => props.onChange({
            kind: "attr",
            attr: (e.target as HTMLSelectElement).value as ItemAttr,
            cond: defaultCond("一致", NO_COLUMN),
          })}>
          {ITEM_ATTRS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <ValueCondEditor column={NO_COLUMN} cond={cond.cond}
          pickerTarget={
            cond.attr === "装備名" ? { kind: "equip" }
            : cond.attr === "装備ID" ? { kind: "equipId" }
            : null
          }
          onChange={(c) => props.onChange({ ...cond, cond: c })} />
        {isCategory && (
          <datalist id="equip-categories">
            {master.equipTypes.map((t) => <option key={t.id} value={t.name} />)}
          </datalist>
        )}
        {props.onRemove !== undefined && (
          <button type="button" class="text-gray-500 hover:text-red-600 px-1" onClick={props.onRemove}>✕</button>
        )}
      </div>
    );
  }

  // group
  return (
    <div class="border-l-2 border-emp-1 pl-2 ml-1">
      <div class="flex items-center gap-1 py-0.5">
        <select class="border border-gray-300 rounded px-1" value={cond.op}
          onChange={(e) => {
            const op = (e.target as HTMLSelectElement).value as "AND" | "OR" | "NOT";
            props.onChange({ kind: "group", op, children: op === "NOT" ? cond.children.slice(0, 1) : cond.children });
          }}>
          <option value="AND">すべて満たす (AND)</option>
          <option value="OR">いずれか満たす (OR)</option>
          <option value="NOT">満たさない (NOT)</option>
        </select>
        {(cond.op !== "NOT" || cond.children.length === 0) && (
          <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
            onClick={() => props.onChange({
              ...cond,
              children: [...cond.children, { kind: "attr", attr: "装備名", cond: defaultCond("一致", NO_COLUMN) }],
            })}>
            + 条件
          </button>
        )}
        {props.onRemove !== undefined && (
          <button type="button" class="text-gray-500 hover:text-red-600 px-1 ml-auto" onClick={props.onRemove}>✕</button>
        )}
      </div>
      {cond.children.map((c, i) => (
        <ItemCondEditor key={i} cond={c}
          onChange={(n) => {
            const children = [...cond.children];
            children[i] = n;
            props.onChange({ ...cond, children });
          }}
          onRemove={() => props.onChange({ ...cond, children: cond.children.filter((_, j) => j !== i) })} />
      ))}
    </div>
  );
}

function CountNodeEditor(props: {
  node: CountItemNode;
  onChange: (n: CountItemNode) => void;
  onRemove?: () => void;
}) {
  const node = props.node;
  if (node.kind === "count") {
    return (
      <div class="border border-gray-200 rounded p-2 my-1">
        <div class="flex flex-wrap items-center gap-1">
          <span class="text-xs">条件を満たすスロット数が</span>
          <ValueCondEditor column={NO_COLUMN} cond={node.count}
            onChange={(c) => props.onChange({ ...node, count: c })} />
          {props.onRemove !== undefined && (
            <button type="button" class="text-gray-500 hover:text-red-600 px-1 ml-auto" onClick={props.onRemove}>✕</button>
          )}
        </div>
        <div class="pl-3">
          <ItemCondEditor cond={node.cond} onChange={(c) => props.onChange({ ...node, cond: c })} />
        </div>
      </div>
    );
  }
  return (
    <div class="border-l-2 border-emp-1 pl-2 ml-1">
      <div class="flex items-center gap-1 py-0.5">
        <select class="border border-gray-300 rounded px-1" value={node.op}
          onChange={(e) => {
            const op = (e.target as HTMLSelectElement).value as "AND" | "OR" | "NOT";
            props.onChange({ kind: "group", op, children: op === "NOT" ? node.children.slice(0, 1) : node.children });
          }}>
          <option value="AND">すべて満たす (AND)</option>
          <option value="OR">いずれか満たす (OR)</option>
          <option value="NOT">満たさない (NOT)</option>
        </select>
        <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
          onClick={() => props.onChange({
            ...node,
            children: [...node.children, {
              kind: "count",
              count: { kind: "cmp", op: "以上", value: 1 },
              cond: { kind: "exists" },
            }],
          })}>
          + 装備数の条件
        </button>
      </div>
      {node.children.map((c, i) => (
        <CountNodeEditor key={i} node={c}
          onChange={(n) => {
            const children = [...node.children];
            children[i] = n;
            props.onChange({ ...node, children });
          }}
          onRemove={() => props.onChange({ ...node, children: node.children.filter((_, j) => j !== i) })} />
      ))}
    </div>
  );
}

export function ItemSection(props: {
  title: "攻撃艦装備" | "防御艦装備";
  node: CountItemNode | null;
  onChange: (n: CountItemNode | null) => void;
}) {
  return (
    <section class="bg-bg-panel border border-gray-300 rounded p-3">
      <div class="flex items-center gap-2 mb-1">
        <h2 class="font-bold">{props.title}</h2>
        {props.node === null ? (
          <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
            onClick={() => props.onChange({
              kind: "count",
              count: { kind: "cmp", op: "以上", value: 1 },
              cond: { kind: "exists" },
            })}>
            条件を付ける
          </button>
        ) : (
          <button type="button" class="text-xs text-gray-500 hover:text-red-600 ml-auto"
            onClick={() => props.onChange(null)}>すべて消す</button>
        )}
      </div>
      <p class="text-xs text-gray-500 mb-1">
        この節は CSV の列だけでは評価できません(装備ID・カテゴリ・装備自体の性能は CSV に列がありません)。
        プレビューでも QUERY 出力でも無視されます。
        CSV で判定したい場合は<strong>出力節の「装備スロット条件」</strong>を使ってください。
      </p>
      <p class="text-xs text-gray-500 mb-2">
        数えるのはメイン1〜4スロットと増設の計5枠です。<strong>メイン5スロット目は数に入りません</strong>
        (logbook の実装がそうなっています)。装備スロット条件なら装備1〜6の6枠を見られます。
      </p>
      {props.node !== null && (
        <CountNodeEditor node={props.node} onChange={props.onChange} />
      )}
    </section>
  );
}
