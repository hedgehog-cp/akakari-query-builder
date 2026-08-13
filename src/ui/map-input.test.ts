import { describe, it, expect } from "vitest";
import { buildCell, parseCell } from "./map-input";

const PATTERN = new RegExp("^マップ:\\d+-\\d+ セル:\\d+$");

describe("buildCell", () => {
  it("スキーマの pattern を満たす文字列を組み立てる", () => {
    const v = buildCell("7-1", "4");
    expect(v).toBe("マップ:7-1 セル:4");
    expect(PATTERN.test(v!)).toBe(true);
  });

  it("空なら null", () => {
    expect(buildCell("", "4")).toBeNull();
    expect(buildCell("7-1", "")).toBeNull();
  });

  it("形式が違えば null", () => {
    expect(buildCell("7", "4")).toBeNull();
    expect(buildCell("7-1", "a")).toBeNull();
  });
});

describe("parseCell", () => {
  it("分解する", () => {
    expect(parseCell("マップ:7-1 セル:4")).toEqual({ mapNo: "7-1", cell: "4" });
  });

  it("形式が違えば null", () => {
    expect(parseCell("7-1")).toBeNull();
    expect(parseCell("")).toBeNull();
  });

  it("往復する", () => {
    const s = "マップ:1-5 セル:12";
    const p = parseCell(s)!;
    expect(buildCell(p.mapNo, p.cell)).toBe(s);
  });
});
