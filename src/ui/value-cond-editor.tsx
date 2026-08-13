import { useState } from "preact/hooks";
import type { CompareOp, ValueCond } from "../model/types";
import type { Column } from "../schema/catalog";
import { NamePicker } from "./name-picker";
import type { NameTarget } from "./name-target";
import { isEmptyValueCond } from "../model/validate";

export type CondOp = "一致" | "含む" | "正規表現" | CompareOp;

const OPS: CondOp[] = ["一致", "含む", "正規表現", "以上", "より大きい", "以下", "より小さい"];

export function condOp(cond: ValueCond): CondOp {
  switch (cond.kind) {
    case "eq": return "一致";
    case "contains": return "含む";
    case "regex": return "正規表現";
    case "cmp": return cond.op;
    case "group": return "一致";
  }
}

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
}) {
  const col = props.column;

  // enum を持つ列: 複数選択のチップ
  if (col?.enum !== undefined) {
    const picked = new Set(props.values.map(String));
    return (
      <div class="flex flex-wrap gap-1">
        {col.enum.map((v) => (
          <button
            key={v}
            type="button"
            class={`border rounded px-1.5 py-0.5 text-xs ${
              picked.has(v) ? "bg-emp-2 border-emp-1" : "border-gray-300 hover:bg-emp-4"
            }`}
            onClick={() => {
              const next = picked.has(v)
                ? props.values.filter((x) => String(x) !== v)
                : [...props.values, v];
              props.onChange(next);
            }}
          >
            {v}
          </button>
        ))}
      </div>
    );
  }

  // categories を持つ列: ラベル付きの選択肢
  if (col?.categories !== undefined) {
    const picked = new Set(props.values.map(Number));
    return (
      <div class="flex flex-wrap gap-1">
        {col.categories.map((c) => (
          <button
            key={c.value}
            type="button"
            class={`border rounded px-1.5 py-0.5 text-xs ${
              picked.has(c.value) ? "bg-emp-2 border-emp-1" : "border-gray-300 hover:bg-emp-4"
            }`}
            onClick={() => {
              const next = picked.has(c.value)
                ? props.values.filter((x) => Number(x) !== c.value)
                : [...props.values, c.value];
              props.onChange(next);
            }}
          >
            {c.value}: {c.label}
          </button>
        ))}
      </div>
    );
  }

  // それ以外: カンマ区切りの自由入力
  return (
    <input
      type="text"
      class="border border-gray-300 rounded px-1 flex-1 min-w-[8rem]"
      placeholder={col?.example ?? "値(カンマ区切りでOR)"}
      value={props.values.join(",")}
      onInput={(e) => {
        const raw = (e.target as HTMLInputElement).value;
        const parts = raw === "" ? [] : raw.split(",").map((s) => coerce(s.trim(), col));
        props.onChange(parts);
      }}
    />
  );
}

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
    <div class={`flex flex-wrap items-center gap-1 ${
      isEmptyValueCond(props.cond) ? "border border-red-400 bg-red-50 rounded px-1 py-0.5" : ""
    }`}>
      <select
        class="border border-gray-300 rounded px-1"
        value={op}
        onChange={(e) => props.onChange(defaultCond((e.target as HTMLSelectElement).value as CondOp, col))}
      >
        {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>

      {props.cond.kind === "eq" && (
        <EqEditor column={col} values={props.cond.values}
          onChange={(v) => props.onChange({ kind: "eq", values: v })} />
      )}

      {(props.cond.kind === "contains" || props.cond.kind === "regex") && (
        <input
          type="text"
          class="border border-gray-300 rounded px-1 flex-1 min-w-[8rem]"
          placeholder={props.cond.kind === "regex" ? "正規表現(完全一致)" : "部分一致する文字列"}
          value={props.cond.values[0] ?? ""}
          onInput={(e) => props.onChange({
            kind: props.cond.kind === "regex" ? "regex" : "contains",
            values: [(e.target as HTMLInputElement).value],
          })}
        />
      )}

      {props.cond.kind === "cmp" && (
        <input
          type="number"
          class="border border-gray-300 rounded px-1 w-24"
          placeholder={numPlaceholder}
          value={props.cond.value}
          onInput={(e) => props.onChange({
            kind: "cmp",
            op: (props.cond as { op: CompareOp }).op,
            value: Number((e.target as HTMLInputElement).value),
          })}
        />
      )}

      {props.pickerTarget != null && props.cond.kind === "eq" && (
        <>
          <button type="button" class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
            onClick={() => setPickerOpen(true)}>選択…</button>
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
        <span class="text-xs text-gray-500">※完全一致。部分一致は <code>.*</code> で挟む</span>
      )}
      {col?.pattern !== undefined && (
        <span class="text-xs text-gray-500">形式: <code>{col.pattern}</code></span>
      )}
    </div>
  );
}
