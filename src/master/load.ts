import raw from "./master.json";

export type Equip = { id: number; name: string; type2: number };
export type EquipType = { id: number; name: string };
export type Ship = { id: number; name: string; yomi: string; stype: number };
export type ShipType = { id: number; name: string };
export type MapInfo = { area: number; no: number; name: string };
export type MapArea = { id: number; name: string };

/** 画面が使うマスタの全体。 */
export type Master = {
  generatedAt: string;
  equips: Equip[];
  equipTypes: EquipType[];
  ships: Ship[];
  shipTypes: ShipType[];
  maps: MapInfo[];
  mapAreas: MapArea[];
};

/** 同梱のマスタデータ。ビルド時に埋め込まれる。 */
export const master: Master = raw as Master;

/** 深海棲艦の api_id の下限。 */
export const ABYSSAL_MIN_SHIP_ID = 1501;

/** 深海棲艦かどうか。 */
export function isAbyssal(ship: Ship): boolean {
  return ship.id >= ABYSSAL_MIN_SHIP_ID;
}

/** マス列の "マップ:7-1" の 7-1 の部分。 */
export function mapNumber(m: MapInfo): string {
  return `${m.area}-${m.no}`;
}

/** 装備カテゴリIDを名前にする。マスタに無ければ「不明(ID)」。 */
export function equipTypeName(type2: number): string {
  return master.equipTypes.find((t) => t.id === type2)?.name ?? `不明(${type2})`;
}

/** マスタの艦種名の読み替え。同じ名前の艦種が並ぶと選びようがないので、区別できる名前にする。 */
const SHIP_TYPE_RENAMES = new Map<number, string>([
  [8, "巡洋戦艦"],
  [15, "補給艦(AP)"],
  [22, "補給艦(AO)"],
]);

/** 一覧に出さない艦種ID。属する艦が1隻もない。 */
const EMPTY_SHIP_TYPES = new Set<number>([12]);

/** 画面の絞り込みに出す艦種。読み替え済みで、空の艦種は除いてある。 */
export const shipTypes: ShipType[] = master.shipTypes
  .filter((t) => !EMPTY_SHIP_TYPES.has(t.id))
  .map((t) => ({ id: t.id, name: SHIP_TYPE_RENAMES.get(t.id) ?? t.name }));

/** 艦種IDを名前にする。マスタに無ければ「不明(ID)」。 */
export function shipTypeName(stype: number): string {
  const renamed = SHIP_TYPE_RENAMES.get(stype);
  if (renamed !== undefined) return renamed;
  return master.shipTypes.find((t) => t.id === stype)?.name ?? `不明(${stype})`;
}
