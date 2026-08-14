import raw from "./master.json";

export type Equip = { id: number; name: string; type2: number };
export type EquipType = { id: number; name: string };
export type Ship = { id: number; name: string; yomi: string; stype: number };
export type ShipType = { id: number; name: string };
export type MapInfo = { area: number; no: number; name: string };
export type MapArea = { id: number; name: string };

export type Master = {
  generatedAt: string;
  equips: Equip[];
  equipTypes: EquipType[];
  ships: Ship[];
  shipTypes: ShipType[];
  maps: MapInfo[];
  mapAreas: MapArea[];
};

export const master: Master = raw as Master;

/** 深海棲艦の api_id の下限。 */
export const ABYSSAL_MIN_SHIP_ID = 1501;

export function isAbyssal(ship: Ship): boolean {
  return ship.id >= ABYSSAL_MIN_SHIP_ID;
}

/** マス列の "マップ:7-1" の 7-1 の部分。 */
export function mapNumber(m: MapInfo): string {
  return `${m.area}-${m.no}`;
}

export function equipTypeName(type2: number): string {
  return master.equipTypes.find((t) => t.id === type2)?.name ?? `不明(${type2})`;
}

export function shipTypeName(stype: number): string {
  return master.shipTypes.find((t) => t.id === stype)?.name ?? `不明(${stype})`;
}
