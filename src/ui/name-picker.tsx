import { useMemo, useState } from "preact/hooks";
import { master, equipTypeName, isAbyssal, shipTypeName, ABYSSAL_MIN_SHIP_ID } from "../master/load";
import { EQUIP_GROUPS, isOther } from "../master/groups";
import type { NameTarget } from "./name-target";

type Row = { id: number; name: string; sub: string };

function useEquipRows(groupIndex: number, typeId: number | null, q: string): Row[] {
  return useMemo(() => {
    const group = EQUIP_GROUPS[groupIndex];
    const inGroup = (t: number) =>
      group.label === "その他" ? isOther(t) : group.typeIds.includes(t);
    return master.equips
      .filter((e) => inGroup(e.type2))
      .filter((e) => typeId === null || e.type2 === typeId)
      .filter((e) => q === "" || e.name.includes(q))
      .map((e) => ({ id: e.id, name: e.name, sub: equipTypeName(e.type2) }));
  }, [groupIndex, typeId, q]);
}

function useShipRows(abyssal: boolean, stype: number | null, q: string): Row[] {
  return useMemo(() => {
    return master.ships
      .filter((s) => isAbyssal(s) === abyssal)
      .filter((s) => stype === null || s.stype === stype)
      // 装備マスタに読みは無いが、艦は読みでも引ける
      .filter((s) => q === "" || s.name.includes(q) || s.yomi.includes(q))
      .map((s) => ({ id: s.id, name: s.name, sub: shipTypeName(s.stype) }));
  }, [abyssal, stype, q]);
}

export function NamePicker(props: {
  target: NameTarget;
  initial: (string | number)[];
  onPick: (values: (string | number)[]) => void;
  onClose: () => void;
}) {
  const isEquip = props.target.kind !== "ship";
  const [groupIndex, setGroupIndex] = useState(0);
  const [abyssal, setAbyssal] = useState(false);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<(string | number)[]>(props.initial);

  const equipRows = useEquipRows(groupIndex, typeId, q);
  const shipRows = useShipRows(abyssal, typeId, q);
  const rows = isEquip ? equipRows : shipRows;

  const subTypes = isEquip
    ? master.equipTypes.filter((t) =>
        EQUIP_GROUPS[groupIndex].label === "その他"
          ? isOther(t.id)
          : EQUIP_GROUPS[groupIndex].typeIds.includes(t.id))
    : master.shipTypes;

  const valueOf = (r: Row): string | number =>
    props.target.kind === "equipId" ? r.id : r.name;

  const toggle = (r: Row) => {
    const v = valueOf(r);
    setPicked(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]);
  };

  return (
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={props.onClose}>
      <div class="bg-bg-panel rounded shadow-lg w-[min(900px,95vw)] h-[min(600px,90vh)] flex flex-col p-3"
        onClick={(e) => e.stopPropagation()}>
        <div class="flex items-center gap-2 mb-2">
          <h3 class="font-bold">{isEquip ? "装備を選ぶ" : "艦を選ぶ"}</h3>
          <input type="text" class="border border-gray-300 rounded px-2 flex-1"
            placeholder={isEquip ? "名前で絞り込む" : "名前または読みで絞り込む"}
            value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          <button type="button" class="text-gray-500 hover:text-red-600 px-1" onClick={props.onClose}>✕</button>
        </div>

        <div class="flex gap-1 mb-2 flex-wrap">
          {isEquip
            ? EQUIP_GROUPS.map((g, i) => (
                <button key={g.label} type="button"
                  class={`border rounded px-2 py-0.5 text-xs ${
                    i === groupIndex ? "bg-emp-2 border-emp-1" : "border-gray-300 hover:bg-emp-4"}`}
                  onClick={() => { setGroupIndex(i); setTypeId(null); }}>{g.label}</button>
              ))
            : [false, true].map((a) => (
                <button key={String(a)} type="button"
                  class={`border rounded px-2 py-0.5 text-xs ${
                    a === abyssal ? "bg-emp-2 border-emp-1" : "border-gray-300 hover:bg-emp-4"}`}
                  onClick={() => { setAbyssal(a); setTypeId(null); }}>
                  {a ? `深海棲艦 (api_id ${ABYSSAL_MIN_SHIP_ID}以上)` : "自軍"}
                </button>
              ))}
        </div>

        <div class="flex gap-2 flex-1 min-h-0">
          <ul class="w-48 overflow-auto border border-gray-200 rounded text-xs">
            <li>
              <button type="button" class={`w-full text-left px-2 py-1 ${typeId === null ? "bg-emp-4" : ""}`}
                onClick={() => setTypeId(null)}>すべて</button>
            </li>
            {subTypes.map((t) => (
              <li key={t.id}>
                <button type="button" class={`w-full text-left px-2 py-1 ${typeId === t.id ? "bg-emp-4" : ""}`}
                  onClick={() => setTypeId(t.id)}>{t.name}</button>
              </li>
            ))}
          </ul>
          <ul class="flex-1 overflow-auto border border-gray-200 rounded text-xs">
            {rows.map((r) => {
              const v = valueOf(r);
              const on = picked.includes(v);
              return (
                <li key={r.id}>
                  <label class={`flex items-center gap-2 px-2 py-1 cursor-pointer ${on ? "bg-emp-4" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(r)} />
                    <span class="text-gray-400 w-12 shrink-0">{r.id}</span>
                    <span class="flex-1">{r.name}</span>
                    <span class="text-gray-400">{r.sub}</span>
                  </label>
                </li>
              );
            })}
            {rows.length === 0 && <li class="px-2 py-1 text-gray-500">該当なし</li>}
          </ul>
        </div>

        <div class="flex items-center gap-2 mt-2">
          <span class="text-xs text-gray-500">{picked.length} 件選択中</span>
          <span class="text-xs text-gray-500">
            改造艦は別名です。<code>島風</code> を選んでも <code>島風改</code> は拾いません。
          </span>
          <button type="button" class="border border-gray-300 rounded px-3 py-1 text-xs ml-auto"
            onClick={props.onClose}>キャンセル</button>
          <button type="button" class="border border-emp-1 bg-emp-2 rounded px-3 py-1 text-xs"
            onClick={() => { props.onPick(picked); props.onClose(); }}>確定</button>
        </div>
      </div>
    </div>
  );
}
