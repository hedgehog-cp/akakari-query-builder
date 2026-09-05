/** 名前を太くする列。札の中で目印になるもの。 */
const STRONG_COLUMNS = new Set(["攻撃艦.名前", "防御艦.名前"]);

/** 装備の並びをここに広げる、という印。名前ごとに1行ずつ、見出しは付けない。 */
const EQUIPS = "\u0000equips";

const EQUIP_COLUMN = /^攻撃艦\.装備\d+\.名前$/;

/**
 * 行にカーソルを合わせたときに出す列。横に送らずに1行の意味を掴めるように、
 * 塊ごとに区切って並べる。CSV に無い列は黙って飛ばす。
 */
const HIGHLIGHT_GROUPS: readonly (readonly string[])[] = [
  ["会敵", "自陣形"],
  ["クリティカル", "ダメージ"],
  ["攻撃艦.名前", EQUIPS],
  ["防御艦.ID", "防御艦.名前"],
];

/** 札に出す値。改修されている装備には ★+N を添える。 */
export function tipValue(row: string[], column: number, improve: number | undefined): string {
  const value = row[column] ?? "";
  if (value === "" || improve === undefined) return value;
  const level = Number(row[improve] ?? "");
  return Number.isFinite(level) && level >= 1 ? `${value} ★+${level}` : value;
}

/** 札の1行。装備の行は見出しを持たず、改修値を後ろに添える。 */
export type TipLine = { label: string; column: number; strong: boolean; improve?: number };

export function highlightsOf(header: string[]): TipLine[][] {
  const index = new Map(header.map((name, i) => [name, i]));
  const groups: TipLine[][] = [];
  for (const names of HIGHLIGHT_GROUPS) {
    const lines: TipLine[] = [];
    for (const name of names) {
      if (name === EQUIPS) {
        for (let i = 0; i < header.length; i++) {
          if (!EQUIP_COLUMN.test(header[i])) continue;
          lines.push({
            label: "",
            column: i,
            strong: false,
            improve: index.get(header[i].replace(".名前", ".改修")),
          });
        }
        continue;
      }
      const i = index.get(name);
      if (i !== undefined) lines.push({ label: name, column: i, strong: STRONG_COLUMNS.has(name) });
    }
    if (lines.length > 0) groups.push(lines);
  }
  return groups;
}
