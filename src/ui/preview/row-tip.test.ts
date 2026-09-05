import { describe, it, expect } from "vitest";
import { highlightsOf, tipValue } from "./row-tip";

const header = [
  "No.",
  "会敵",
  "自陣形",
  "クリティカル",
  "ダメージ",
  "攻撃艦.名前",
  "攻撃艦.装備1.名前",
  "攻撃艦.装備1.改修",
  "攻撃艦.装備2.名前",
  "防御艦.ID",
  "防御艦.名前",
];

describe("highlightsOf", () => {
  it("塊ごとに分けて並べる", () => {
    const groups = highlightsOf(header);
    expect(groups.map((g) => g.map((l) => l.label))).toEqual([
      ["会敵", "自陣形"],
      ["クリティカル", "ダメージ"],
      ["攻撃艦.名前", "", ""],
      ["防御艦.ID", "防御艦.名前"],
    ]);
  });

  it("装備は名前の列ごとに1行、改修の列を連れて出す", () => {
    const equips = highlightsOf(header)[2].slice(1);
    expect(equips.map((l) => l.column)).toEqual([6, 8]);
    expect(equips[0].improve).toBe(7);
    expect(equips[1].improve).toBeUndefined();
  });

  it("艦の名前は太くする", () => {
    const groups = highlightsOf(header);
    expect(groups[2][0].strong).toBe(true);
    expect(groups[3][1].strong).toBe(true);
    expect(groups[0][0].strong).toBe(false);
  });

  it("CSV に無い列は飛ばし、塊ごと空なら出さない", () => {
    const groups = highlightsOf(["No.", "ダメージ"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((l) => l.label)).toEqual(["ダメージ"]);
  });
});

describe("tipValue", () => {
  const row = ["", "", "", "", "", "金剛", "12.7cm連装砲", "7", "電探", "", ""];

  it("改修されていれば ★+N を添える", () => {
    expect(tipValue(row, 6, 7)).toBe("12.7cm連装砲 ★+7");
  });

  it("改修の列が無ければそのまま", () => {
    expect(tipValue(row, 8, undefined)).toBe("電探");
  });

  it("空の枠には何も添えない", () => {
    expect(tipValue(row, 9, 7)).toBe("");
  });

  it("改修が0や数でないときは添えない", () => {
    expect(tipValue(["装備", "0"], 0, 1)).toBe("装備");
    expect(tipValue(["装備", ""], 0, 1)).toBe("装備");
  });
});
