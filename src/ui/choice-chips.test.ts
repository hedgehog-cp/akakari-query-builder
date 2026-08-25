import { describe, it, expect } from "vitest";
import { summaryLabel } from "./choice-chips";

describe("summaryLabel", () => {
  it("選んでいなければそう出す", () => {
    expect(summaryLabel([])).toBe("未選択");
  });

  it("選択中は件数だけを出す", () => {
    expect(summaryLabel(["勝利S"])).toBe("1件");
    expect(summaryLabel(["勝利S", "勝利A"])).toBe("2件");
  });
});
