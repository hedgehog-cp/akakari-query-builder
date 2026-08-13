import { master, mapNumber } from "../master/load";

const CELL_RE = /^マップ:(\d+-\d+) セル:(\d+)$/;

/** スキーマの pattern ^マップ:\d+-\d+ セル:\d+$ を満たす文字列を組み立てる。 */
export function buildCell(mapNo: string, cell: string): string | null {
  if (!/^\d+-\d+$/.test(mapNo)) return null;
  if (!/^\d+$/.test(cell)) return null;
  return `マップ:${mapNo} セル:${cell}`;
}

export function parseCell(v: string): { mapNo: string; cell: string } | null {
  const m = CELL_RE.exec(v);
  return m === null ? null : { mapNo: m[1], cell: m[2] };
}

/** 海域名を optgroup 付きプルダウンで選ぶ。42件しかないのでモーダルは要らない。 */
export function MapAreaSelect(props: { value: string; onChange: (v: string) => void }) {
  const known = new Set(master.maps.map((m) => m.name));
  return (
    <select class="border border-gray-300 rounded px-1 max-w-[16rem]"
      value={props.value}
      onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}>
      <option value="">(選択)</option>
      {props.value !== "" && !known.has(props.value) && (
        <option value={props.value}>{props.value}(マスタに無い海域)</option>
      )}
      {master.mapAreas.map((area) => (
        <optgroup key={area.id} label={area.name}>
          {master.maps.filter((m) => m.area === area.id).map((m) => (
            <option key={`${m.area}-${m.no}`} value={m.name}>
              {mapNumber(m)} {m.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** マス列。海域を選ぶとマップ番号が入り、セル番号だけ入力すれば組み上がる。 */
export function CellInput(props: { value: string; onChange: (v: string) => void }) {
  const parsed = parseCell(props.value);
  const mapNo = parsed?.mapNo ?? "";
  const cell = parsed?.cell ?? "";
  const emit = (nextMap: string, nextCell: string) => {
    const built = buildCell(nextMap, nextCell);
    props.onChange(built ?? "");
  };
  return (
    <span class="flex flex-wrap items-center gap-1">
      <select class="border border-gray-300 rounded px-1 max-w-[14rem]" value={mapNo}
        onChange={(e) => emit((e.target as HTMLSelectElement).value, cell)}>
        <option value="">(海域)</option>
        {master.mapAreas.map((area) => (
          <optgroup key={area.id} label={area.name}>
            {master.maps.filter((m) => m.area === area.id).map((m) => (
              <option key={`${m.area}-${m.no}`} value={mapNumber(m)}>
                {mapNumber(m)} {m.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span class="text-xs">セル</span>
      <input type="number" min="0" class="border border-gray-300 rounded px-1 w-20" value={cell}
        onInput={(e) => emit(mapNo, (e.target as HTMLInputElement).value)} />
      <span class="text-xs text-gray-500">→ <code>{props.value === "" ? "(未設定)" : props.value}</code></span>
    </span>
  );
}
