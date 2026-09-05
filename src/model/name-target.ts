/** その列に入る名前の種類。 */
export type NameTarget = { kind: "equip" | "ship" | "equipId" };

/** 列名から、そこに入る名前の種類を求める。名前を持たない列は null。 */
export function nameTargetOf(column: string): NameTarget | null {
  if (column === "攻撃艦.名前" || column === "防御艦.名前") return { kind: "ship" };
  if (/^艦名[1-6]$/.test(column)) return { kind: "ship" };
  if (/^(攻撃艦|防御艦)\.装備[1-6]\.名前$/.test(column)) return { kind: "equip" };
  if (/^表示装備[1-3]$/.test(column)) return { kind: "equip" };
  return null;
}
