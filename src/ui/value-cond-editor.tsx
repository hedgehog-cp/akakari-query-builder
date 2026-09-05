import { useState } from "preact/hooks";
import type { CompareOp, ValueCond } from "../model/types";
import type { Column } from "../schema/catalog";
import { NamePicker } from "./name-picker";
import type { NameTarget } from "./name-target";
import { isEmptyValueCond } from "../model/validate";
import { ChoiceChips } from "./choice-chips";
import { NameSuggestInput } from "./name-suggest";

/** 画面で選べる条件の種類。 */
export type CondOp = "一致" | "含む" | "正規表現" | CompareOp;

const OPS: CondOp[] = ["一致", "含む", "正規表現", "以上", "より大きい", "以下", "より小さい"];

/** 条件の値から、画面で選ばれている種類を求める。 */
export function condOp(cond: ValueCond): CondOp {
  switch (cond.kind) {
    case "eq":
      return "一致";
    case "contains":
      return "含む";
    case "regex":
      return "正規表現";
    case "cmp":
      return cond.op;
    case "group":
      return "一致";
  }
}

/** 種類を切り替えたときの初期値。列の型が分かるときはそれに合わせる。 */
export function defaultCond(op: CondOp, column: Column | undefined): ValueCond {
  if (op === "一致") return { kind: "eq", values: [] };
  if (op === "含む") return { kind: "contains", values: [""] };
  if (op === "正規表現") return { kind: "regex", values: [""] };
  return { kind: "cmp", op, value: column?.minimum ?? 0 };
}

/** 一致の値を、列の型に合わせて文字列か数値にする。 */
function coerce(raw: string, column: Column | undefined): string | number {
  if (column?.type === "integer") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

function EqEditor(props: {
  column: Column | undefined;
  values: (string | number)[];
  onChange: (v: (string | number)[]) => void;
  /** 艦名・装備名の列なら、入力中に候補を出す。 */
  suggest?: NameTarget | null;
}) {
  const col = props.column;
  const parse = (raw: string) =>
    raw === "" ? [] : raw.split(",").map((s) => coerce(s.trim(), col));

  // enum を持つ列: 値そのものを選ぶ
  if (col?.enum !== undefined) {
    return (
      <ChoiceChips
        choices={col.enum.map((v) => ({ value: v, label: v }))}
        values={props.values}
        onChange={props.onChange}
      />
    );
  }

  // categories を持つ列: 数値にラベルが付いているので、両方を出して選ばせる
  if (col?.categories !== undefined) {
    return (
      <ChoiceChips
        choices={col.categories.map((c) => ({ value: c.value, label: `${c.value}: ${c.label}` }))}
        values={props.values}
        onChange={props.onChange}
      />
    );
  }

  // 名前の列: 打っている途中に候補を出す
  if (props.suggest != null) {
    return (
      <NameSuggestInput
        target={props.suggest}
        class="flex-1 min-w-[8rem]"
        placeholder={col?.example ?? "値(カンマ区切りでOR)"}
        value={props.values.join(",")}
        onInput={(raw) => props.onChange(parse(raw))}
      />
    );
  }

  // それ以外: カンマ区切りの自由入力
  return (
    <input
      type="text"
      class="ctl border border-gray-300 rounded px-1 flex-1 min-w-[8rem]"
      placeholder={col?.example ?? "値(カンマ区切りでOR)"}
      value={props.values.join(",")}
      onInput={(e) => props.onChange(parse((e.target as HTMLInputElement).value))}
    />
  );
}

/** 1つの列に対する条件を編集する行。 */
export function ValueCondEditor(props: {
  column: Column | undefined;
  cond: ValueCond;
  onChange: (c: ValueCond) => void;
  /** 名前列などで「選択…」ボタンを出すときに渡す。 */
  pickerTarget?: NameTarget | null;
}) {
  const col = props.column;
  const op = condOp(props.cond);
  const [pickerOpen, setPickerOpen] = useState(false);
  const numPlaceholder =
    col?.minimum !== undefined && col.maximum !== undefined
      ? `${col.minimum}〜${col.maximum}`
      : "数値";

  return (
    <div
      // 枠と余白は妥当なときも同じだけ確保しておく。出たり消えたりするたびに
      // 行の大きさが変わると、値を入れ終えた瞬間に画面がガタつくため。
      class={`flex flex-wrap items-center gap-1 rounded border px-1 py-0.5 ${
        isEmptyValueCond(props.cond) ? "border-red-400 bg-red-50" : "border-transparent"
      }`}
    >
      <select
        class="ctl border border-gray-300 rounded px-1"
        value={op}
        onChange={(e) =>
          props.onChange(defaultCond((e.target as HTMLSelectElement).value as CondOp, col))
        }
      >
        {OPS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>

      {props.cond.kind === "eq" && (
        <EqEditor
          column={col}
          values={props.cond.values}
          suggest={props.pickerTarget}
          onChange={(v) => props.onChange({ kind: "eq", values: v })}
        />
      )}

      {(props.cond.kind === "contains" || props.cond.kind === "regex") && (
        <input
          type="text"
          class="ctl border border-gray-300 rounded px-1 flex-1 min-w-[8rem]"
          placeholder={props.cond.kind === "regex" ? "正規表現(完全一致)" : "部分一致する文字列"}
          value={props.cond.values[0] ?? ""}
          onInput={(e) =>
            props.onChange({
              kind: props.cond.kind === "regex" ? "regex" : "contains",
              values: [(e.target as HTMLInputElement).value],
            })
          }
        />
      )}

      {props.cond.kind === "cmp" && (
        <input
          type="number"
          class="ctl border border-gray-300 rounded px-1 w-24"
          placeholder={numPlaceholder}
          value={props.cond.value}
          onInput={(e) =>
            props.onChange({
              kind: "cmp",
              op: (props.cond as { op: CompareOp }).op,
              value: Number((e.target as HTMLInputElement).value),
            })
          }
        />
      )}

      {props.pickerTarget != null && props.cond.kind === "eq" && (
        <>
          <button
            type="button"
            class="ctl shrink-0 border border-emp-1 rounded px-2 hover:bg-emp-4"
            onClick={() => setPickerOpen(true)}
          >
            選択…
          </button>
          {pickerOpen && (
            <NamePicker
              target={props.pickerTarget}
              initial={props.cond.values}
              onPick={(values) => props.onChange({ kind: "eq", values })}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </>
      )}

      {props.cond.kind === "regex" && (
        <span class="text-xs text-gray-500">
          ※完全一致。部分一致は <code>.*</code> で挟む
        </span>
      )}
      {col?.pattern !== undefined && (
        <span class="text-xs text-gray-500">
          形式: <code>{col.pattern}</code>
        </span>
      )}
    </div>
  );
}
