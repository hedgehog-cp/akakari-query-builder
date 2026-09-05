import { describe, it, expect } from "vitest";
import { nameTargetOf } from "./name-target";

describe("nameTargetOf", () => {
  it("艦名の列は艦船モーダル", () => {
    expect(nameTargetOf("攻撃艦.名前")).toEqual({ kind: "ship" });
    expect(nameTargetOf("防御艦.名前")).toEqual({ kind: "ship" });
    expect(nameTargetOf("艦名1")).toEqual({ kind: "ship" });
    expect(nameTargetOf("艦名6")).toEqual({ kind: "ship" });
  });

  it("装備名の列は装備モーダル", () => {
    expect(nameTargetOf("攻撃艦.装備1.名前")).toEqual({ kind: "equip" });
    expect(nameTargetOf("防御艦.装備6.名前")).toEqual({ kind: "equip" });
    expect(nameTargetOf("表示装備1")).toEqual({ kind: "equip" });
    expect(nameTargetOf("表示装備3")).toEqual({ kind: "equip" });
  });

  it("それ以外は null", () => {
    expect(nameTargetOf("ダメージ")).toBeNull();
    expect(nameTargetOf("攻撃艦.装備1.改修")).toBeNull();
    expect(nameTargetOf("敵艦隊")).toBeNull();
  });
});
