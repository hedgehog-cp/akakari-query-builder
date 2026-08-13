import { describe, it, expect } from "vitest";
import { reorder } from "./reorder";

describe("reorder", () => {
  it("後ろへ移動する", () => {
    expect(reorder(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("前へ移動する", () => {
    expect(reorder(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("同じ位置への移動は変化しない", () => {
    expect(reorder(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("元の配列を書き換えない", () => {
    const src = ["a", "b", "c"];
    reorder(src, 0, 2);
    expect(src).toEqual(["a", "b", "c"]);
  });

  it("要素1個の配列でも動く", () => {
    expect(reorder(["a"], 0, 0)).toEqual(["a"]);
  });
});
