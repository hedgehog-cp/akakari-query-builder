import { describe, it, expect } from "vitest";
import { segmentAt, replaceSegment, suggestNames } from "./name-suggest";

describe("segmentAt", () => {
  it("カーソルが乗っている区切りを切り出す", () => {
    const raw = "金剛,榛名";
    expect(segmentAt(raw, 2)).toEqual({ start: 0, end: 2, text: "金剛" });
    expect(segmentAt(raw, 5)).toEqual({ start: 3, end: 5, text: "榛名" });
  });

  it("前後の空白は候補を引くときだけ落とす", () => {
    expect(segmentAt("金剛, 榛", 5)).toEqual({ start: 3, end: 5, text: "榛" });
  });

  it("空の入力でも範囲を返す", () => {
    expect(segmentAt("", 0)).toEqual({ start: 0, end: 0, text: "" });
  });
});

describe("replaceSegment", () => {
  it("書きかけの語だけを置き換える", () => {
    const raw = "金剛,榛";
    expect(replaceSegment(raw, segmentAt(raw, 6), "榛名改二")).toEqual({
      text: "金剛,榛名改二",
      caret: 7,
    });
  });

  it("後ろに値が続いていても壊さない", () => {
    const raw = "金,霧島";
    expect(replaceSegment(raw, segmentAt(raw, 1), "金剛")).toEqual({
      text: "金剛,霧島",
      caret: 2,
    });
  });
});

describe("suggestNames", () => {
  const ship = { kind: "ship" } as const;

  it("何も書いていなければ出さない", () => {
    expect(suggestNames(ship, "")).toEqual([]);
    expect(suggestNames(ship, "  ")).toEqual([]);
  });

  it("完全一致と前方一致が上に来る", () => {
    const got = suggestNames(ship, "金剛").map((s) => s.label);
    expect(got[0]).toBe("金剛");
    expect(got).toContain("金剛改二");
  });

  it("よみでも引ける", () => {
    expect(suggestNames(ship, "こんごう").map((s) => s.label)).toContain("金剛");
  });

  it("艦名は重複しない", () => {
    const got = suggestNames(ship, "ワ級").map((s) => s.label);
    expect(new Set(got).size).toBe(got.length);
  });

  it("件数を絞る", () => {
    expect(suggestNames(ship, "改", 5)).toHaveLength(5);
  });

  it("艦種を添える", () => {
    expect(suggestNames(ship, "金剛")[0].sub).toBe("巡洋戦艦");
  });

  it("装備は名前を、装備IDの列ではIDを値にする", () => {
    const byName = suggestNames({ kind: "equip" }, "12cm単装砲")[0];
    expect(byName.value).toBe("12cm単装砲");
    const byId = suggestNames({ kind: "equipId" }, "12cm単装砲")[0];
    expect(byId.value).toBe(1);
    expect(byId.label).toBe("1 12cm単装砲");
  });

  it("装備IDの列は数字でも引ける", () => {
    expect(suggestNames({ kind: "equipId" }, "1")[0].value).toBe(1);
  });
});
