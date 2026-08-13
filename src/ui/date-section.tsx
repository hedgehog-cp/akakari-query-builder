import type { DateRange } from "../model/types";
import { fromDateCode, toDateCode } from "./date";

export function DateSection(props: {
  ranges: DateRange[];
  onChange: (r: DateRange[]) => void;
}) {
  const set = (i: number, key: "start" | "end", local: string) => {
    const next = [...props.ranges];
    next[i] = { ...next[i], [key]: local === "" ? null : toDateCode(local) };
    props.onChange(next);
  };
  return (
    <section class="bg-bg-panel border border-gray-300 rounded p-3">
      <h2 class="font-bold mb-2">日時</h2>
      {props.ranges.length === 0 && (
        <p class="text-xs text-gray-500 mb-2">指定しない場合はすべての日時が対象になります。</p>
      )}
      {props.ranges.map((r, i) => (
        <div key={i} class="flex items-center gap-2 mb-1">
          <input
            type="datetime-local"
            step="1"
            class="border border-gray-300 rounded px-1"
            value={r.start === null ? "" : fromDateCode(r.start)}
            onInput={(e) => set(i, "start", (e.target as HTMLInputElement).value)}
          />
          <span>〜</span>
          <input
            type="datetime-local"
            step="1"
            class="border border-gray-300 rounded px-1"
            value={r.end === null ? "" : fromDateCode(r.end)}
            onInput={(e) => set(i, "end", (e.target as HTMLInputElement).value)}
          />
          <button
            type="button"
            class="text-gray-500 hover:text-red-600 px-1"
            onClick={() => props.onChange(props.ranges.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        class="border border-emp-1 rounded px-2 py-0.5 text-xs hover:bg-emp-4"
        onClick={() => props.onChange([...props.ranges, { start: null, end: null }])}
      >
        + 期間を追加(複数はORになります)
      </button>
    </section>
  );
}
