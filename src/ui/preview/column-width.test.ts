import { describe, it, expect } from "vitest";
import { longestPerColumn, weightedLength } from "./column-width";

describe("weightedLength", () => {
  it("全角は2文字ぶんとして数える", () => {
    expect(weightedLength("abc")).toBe(3);
    expect(weightedLength("金剛")).toBe(4);
    expect(weightedLength("金剛2")).toBe(5);
  });

  it("空文字は0", () => {
    expect(weightedLength("")).toBe(0);
  });
});

describe("longestPerColumn", () => {
  it("列ごとに一番長く見える値を選ぶ", () => {
    const rows = [
      ["1", "金剛", "x"],
      ["100", "電", "xyz"],
    ];
    expect(longestPerColumn(3, rows)).toEqual(["100", "金剛", "xyz"]);
  });

  it("値の無い列は空のまま", () => {
    expect(longestPerColumn(2, [["a"]])).toEqual(["a", ""]);
  });

  it("列より長い行は余りを見ない", () => {
    expect(longestPerColumn(1, [["a", "bbbb"]])).toEqual(["a"]);
  });

  it("行が無ければすべて空", () => {
    expect(longestPerColumn(2, [])).toEqual(["", ""]);
  });
});
