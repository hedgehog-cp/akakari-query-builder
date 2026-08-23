import { describe, it, expect } from "vitest";
import {
  buildCell,
  buildCells,
  parseCell,
  parseCellSpec,
  parseCells,
  syncCellsDraft,
} from "./map-input";

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

describe("parseCellSpec", () => {
  it("カンマと範囲を展開する", () => {
    expect(parseCellSpec("4,5,7-9")).toEqual(["4", "5", "7", "8", "9"]);
  });

  it("重複と読めない断片を落とす", () => {
    expect(parseCellSpec("4, 4 ,x,,7-")).toEqual(["4"]);
    expect(parseCellSpec("9-7")).toEqual([]);
  });

  it("範囲が大きすぎても上限で止まる", () => {
    expect(parseCellSpec("1-100000")).toHaveLength(200);
  });
});

describe("buildCells / parseCells", () => {
  it("海域とセルの並びから値の並びを作る", () => {
    expect(buildCells("7-1", "4,5")).toEqual(["マップ:7-1 セル:4", "マップ:7-1 セル:5"]);
  });

  it("海域が決まっていなければ空", () => {
    expect(buildCells("", "4")).toEqual([]);
  });

  it("同じ海域の並びは分解できる", () => {
    expect(parseCells(["マップ:7-1 セル:4", "マップ:7-1 セル:5"])).toEqual({
      mapNo: "7-1",
      cells: ["4", "5"],
    });
    expect(parseCells([])).toEqual({ mapNo: "", cells: [] });
  });

  it("海域が混ざる並びや別形式は分解できない", () => {
    expect(parseCells(["マップ:7-1 セル:4", "マップ:1-5 セル:4"])).toBeNull();
    expect(parseCells(["7-1"])).toBeNull();
  });
});

describe("syncCellsDraft", () => {
  it("片方だけ埋まった下書きを外の空値で潰さない", () => {
    const draft = { mapNo: "7-1", cells: "" };
    expect(syncCellsDraft(draft, [])).toBe(draft);
    const typing = { mapNo: "", cells: "4" };
    expect(syncCellsDraft(typing, [])).toBe(typing);
  });

  it("下書きが組み上げた並びと一致する外の値なら据え置く", () => {
    const draft = { mapNo: "7-1", cells: "4,5,7-9" };
    expect(syncCellsDraft(draft, buildCells("7-1", "4,5,7-9"))).toBe(draft);
  });

  it("外から別の値が入れば取り込む", () => {
    expect(syncCellsDraft({ mapNo: "7-1", cells: "" }, ["マップ:1-5 セル:12"])).toEqual({
      mapNo: "1-5",
      cells: "12",
    });
  });

  it("外から消されれば下書きも消す", () => {
    expect(syncCellsDraft({ mapNo: "7-1", cells: "4" }, [])).toEqual({ mapNo: "", cells: "" });
  });
});
