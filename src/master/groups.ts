/** 装備モーダルの大分類タブ1つぶん。 */
export type EquipGroup = { label: string; typeIds: number[] };

/** 装備モーダルの大分類タブ。値は api_mst_slotitem_equiptype の api_id。
 * 先頭の「すべて」は絞り込みなしを表す既定のタブ(typeIds は使わない)。 */
export const EQUIP_GROUPS: EquipGroup[] = [
  { label: "すべて", typeIds: [] },
  { label: "砲", typeIds: [1, 2, 3, 4, 38, 95] },
  { label: "魚雷・潜航艇", typeIds: [5, 22, 32] },
  { label: "艦載機", typeIds: [6, 7, 8, 9, 56, 57, 58, 59, 91, 94] },
  { label: "水上機", typeIds: [10, 11, 45] },
  { label: "陸上機", typeIds: [47, 48, 49, 53, 41] },
  { label: "電探", typeIds: [12, 13, 93] },
  { label: "対潜", typeIds: [14, 15, 25, 26, 40] },
  { label: "その他", typeIds: [] }, // 上記のいずれにも属さないカテゴリを入れる
];

const CLASSIFIED = new Set(EQUIP_GROUPS.flatMap((g) => g.typeIds));

/** 「その他」に落ちるカテゴリIDかどうか。 */
export function isOther(typeId: number): boolean {
  return !CLASSIFIED.has(typeId);
}

/** カテゴリIDがそのタブに属するか。「すべて」は全部、「その他」は未分類。 */
export function inEquipGroup(group: EquipGroup, typeId: number): boolean {
  if (group.label === "すべて") return true;
  if (group.label === "その他") return isOther(typeId);
  return group.typeIds.includes(typeId);
}
