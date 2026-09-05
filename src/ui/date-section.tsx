import type { DateRange } from "../model/types";
import { fromDateCode, toDateCode } from "./date";
import { RuleGroup } from "./rule-group";

/** RuleGroup の行キー。編集で新しいオブジェクトに置き換わってもキーを引き継ぐ
 * (RuleGroup を使う他の枠と同じパターン)。 */
const rangeKeys = new WeakMap<DateRange, number>();
let nextRangeKey = 0;
function keyOf(r: DateRange): number {
  let key = rangeKeys.get(r);
  if (key === undefined) {
    key = nextRangeKey++;
    rangeKeys.set(r, key);
  }
  return key;
}

function renderRange(r: DateRange, onChange: (r: DateRange) => void, onRemove: () => void) {
  const set = (key: "start" | "end", local: string) => {
    onChange({ ...r, [key]: local === "" ? null : toDateCode(local) });
  };
  return (
    <div class="flex items-center gap-2 py-0.5">
      <input
        type="datetime-local"
        step="1"
        class="border border-gray-300 rounded px-1"
        value={r.start === null ? "" : fromDateCode(r.start)}
        onInput={(e) => set("start", (e.target as HTMLInputElement).value)}
      />
      <span>〜</span>
      <input
        type="datetime-local"
        step="1"
        class="border border-gray-300 rounded px-1"
        value={r.end === null ? "" : fromDateCode(r.end)}
        onInput={(e) => set("end", (e.target as HTMLInputElement).value)}
      />
      <button type="button" class="text-gray-500 hover:text-red-600 px-1" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

/** 日時の範囲を並べる枠。範囲どうしは OR で結ばれる。 */
export function DateSection(props: { ranges: DateRange[]; onChange: (r: DateRange[]) => void }) {
  return (
    <section class="bg-bg-panel border border-gray-300 rounded p-3">
      <h2 class="font-bold text-purple-900 mb-2">日時</h2>
      <RuleGroup<DateRange>
        op="OR"
        opEditable={false}
        children={props.ranges}
        depth={0}
        onChildrenChange={props.onChange}
        addRuleActions={[
          {
            label: "+ 条件",
            onClick: () => props.onChange([...props.ranges, { start: null, end: null }]),
          },
        ]}
        renderChild={renderRange}
        keyOf={keyOf}
        onChildEdit={(prev, next) => {
          const k = rangeKeys.get(prev);
          if (k !== undefined) rangeKeys.set(next, k);
        }}
      />
    </section>
  );
}
