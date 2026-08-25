import { useEffect, useState } from "preact/hooks";
import { master, mapNumber } from "../master/load";

const CELL_RE = /^マップ:(\d+-\d+) セル:(\d+)$/;

/** 1つの条件で組み上げるセルの上限。範囲指定の書き間違いで巨大な列を作らないための歯止め。 */
const MAX_CELLS = 200;

/** スキーマの pattern ^マップ:\d+-\d+ セル:\d+$ を満たす文字列を組み立てる。 */
export function buildCell(mapNo: string, cell: string): string | null {
  if (!/^\d+-\d+$/.test(mapNo)) return null;
  if (!/^\d+$/.test(cell)) return null;
  return `マップ:${mapNo} セル:${cell}`;
}

/** buildCell の逆。形が違えば null。 */
export function parseCell(v: string): { mapNo: string; cell: string } | null {
  const m = CELL_RE.exec(v);
  return m === null ? null : { mapNo: m[1], cell: m[2] };
}

/**
 * セル番号の書き方 "4,5,7-9" を展開する。重複は先に出た方を残す。
 * 数として読めない断片(入力途中の "," や "7-" など)は黙って落とす。
 */
export function parseCellSpec(spec: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (n: number) => {
    const s = String(n);
    if (seen.has(s) || out.length >= MAX_CELLS) return;
    seen.add(s);
    out.push(s);
  };
  for (const part of spec.split(",")) {
    const t = part.trim();
    if (t === "") continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(t);
    if (range !== null) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > to) continue;
      for (let n = from; n <= to; n++) push(n);
      continue;
    }
    if (/^\d+$/.test(t)) push(Number(t));
  }
  return out;
}

/** 海域1つとセル番号の書き方から、一致条件に入れる値の並びを組み立てる。 */
export function buildCells(mapNo: string, spec: string): string[] {
  if (!/^\d+-\d+$/.test(mapNo)) return [];
  return parseCellSpec(spec).map((c) => `マップ:${mapNo} セル:${c}`);
}

/** buildCells の逆。空、または同じ海域のマスだけの並びなら分解できる。混在や別形式なら null。 */
export function parseCells(
  values: readonly (string | number)[],
): { mapNo: string; cells: string[] } | null {
  if (values.length === 0) return { mapNo: "", cells: [] };
  const parsed = values.map((v) => parseCell(String(v)));
  const first = parsed[0];
  if (first === null) return null;
  const cells: string[] = [];
  for (const p of parsed) {
    if (p === null || p.mapNo !== first.mapNo) return null;
    cells.push(p.cell);
  }
  return { mapNo: first.mapNo, cells };
}

/** マス列の入力途中の状態。海域だけ、セル番号だけ、という半端な状態を持てる。 */
export type CellDraft = { mapNo: string; cells: string };

/**
 * 外から来た値の並びと手元の下書きを突き合わせ、次に使うべき下書きを返す。
 *
 * マス列の値は「マップ:X-Y セル:Z」という1本の文字列なので、海域だけ選んだ状態も
 * セル番号だけ入れた状態も値としては空になる。下書きを持たずに値だけから描くと、
 * 片方を入れた瞬間に空値で描き直されて入力が消えてしまう。そのため下書きが
 * 組み上げる並びと外の並びが食い違うときだけ取り込み直す。
 */
export function syncCellsDraft(draft: CellDraft, values: readonly (string | number)[]): CellDraft {
  const built = buildCells(draft.mapNo, draft.cells);
  if (built.length === values.length && built.every((v, i) => v === String(values[i])))
    return draft;
  const parsed = parseCells(values);
  return parsed === null ? draft : { mapNo: parsed.mapNo, cells: parsed.cells.join(",") };
}

/** 海域名を optgroup 付きプルダウンで選ぶ。件数が少ないのでモーダルは要らない。 */
export function MapAreaSelect(props: { value: string; onChange: (v: string) => void }) {
  const known = new Set(master.maps.map((m) => m.name));
  return (
    <select
      class="ctl border border-gray-300 rounded px-1 max-w-[16rem]"
      value={props.value}
      onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}
    >
      <option value="">(選択)</option>
      {props.value !== "" && !known.has(props.value) && (
        <option value={props.value}>{props.value}(マスタに無い海域)</option>
      )}
      {master.mapAreas.map((area) => (
        <optgroup key={area.id} label={area.name}>
          {master.maps
            .filter((m) => m.area === area.id)
            .map((m) => (
              <option key={`${m.area}-${m.no}`} value={m.name}>
                {mapNumber(m)} {m.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

/** マス列。海域を選び、セル番号を "4,5,7-9" のように並べるとその数だけORで並ぶ。 */
export function CellInput(props: {
  values: readonly (string | number)[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState<CellDraft>(() =>
    syncCellsDraft({ mapNo: "", cells: "" }, props.values),
  );
  // 外から値が差し替わったとき(テンプレート読み込みなど)だけ下書きを取り込み直す。
  const joined = props.values.join("\n");
  useEffect(() => {
    setDraft((d) => syncCellsDraft(d, props.values));
    // props.values は毎描画で新しい配列になるため、中身を繋いだ文字列で見張る。
  }, [joined]);
  const emit = (next: CellDraft) => {
    setDraft(next);
    props.onChange(buildCells(next.mapNo, next.cells));
  };
  return (
    <span class="flex items-center gap-1">
      <select
        class="ctl border border-gray-300 rounded px-1 max-w-[10rem]"
        value={draft.mapNo}
        onChange={(e) => emit({ ...draft, mapNo: (e.target as HTMLSelectElement).value })}
      >
        <option value="">(海域)</option>
        {master.mapAreas.map((area) => (
          <optgroup key={area.id} label={area.name}>
            {master.maps
              .filter((m) => m.area === area.id)
              .map((m) => (
                <option key={`${m.area}-${m.no}`} value={mapNumber(m)}>
                  {mapNumber(m)} {m.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <span class="text-xs shrink-0">セル</span>
      <input
        type="text"
        class="ctl border border-gray-300 rounded px-1 w-28"
        placeholder="4,5,7-9"
        title="カンマ区切りでOR、ハイフンで範囲"
        value={draft.cells}
        onInput={(e) => emit({ ...draft, cells: (e.target as HTMLInputElement).value })}
      />
    </span>
  );
}
