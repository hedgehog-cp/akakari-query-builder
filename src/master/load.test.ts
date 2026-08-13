import { describe, it, expect } from "vitest";
import { master, ABYSSAL_MIN_SHIP_ID, mapNumber } from "./load";

describe("master", () => {
  it("件数が揃っている", () => {
    expect(master.equips).toHaveLength(741);
    expect(master.equipTypes).toHaveLength(62);
    expect(master.ships).toHaveLength(1751);
    expect(master.shipTypes).toHaveLength(22);
    expect(master.maps).toHaveLength(42);
    expect(master.mapAreas).toHaveLength(8);
  });

  it("装備はカテゴリIDを持つ", () => {
    const e = master.equips.find((x) => x.id === 1);
    expect(e).toEqual({ id: 1, name: "12cm単装砲", type2: 1 });
    expect(master.equipTypes.find((t) => t.id === 1)?.name).toBe("小口径主砲");
  });

  it("深海棲艦は api_id 1501 以上", () => {
    expect(ABYSSAL_MIN_SHIP_ID).toBe(1501);
    const abyssal = master.ships.find((s) => s.id === 1501);
    expect(abyssal?.name).toBe("駆逐イ級");
  });

  it("艦は読みを持つ", () => {
    expect(master.ships.find((s) => s.id === 1)?.yomi).not.toBe("");
  });

  it("海域名からマップ番号が引ける", () => {
    const m = master.maps.find((x) => x.name === "ブルネイ泊地沖");
    expect(m).toBeDefined();
    expect(mapNumber(m!)).toBe("7-1");
  });

  it("組み立てたマスがスキーマの pattern を満たす", () => {
    const m = master.maps.find((x) => x.name === "ブルネイ泊地沖")!;
    const cell = `マップ:${mapNumber(m)} セル:4`;
    expect(new RegExp("^マップ:\\d+-\\d+ セル:\\d+$").test(cell)).toBe(true);
  });
});
