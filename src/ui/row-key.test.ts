import { describe, it, expect } from "vitest";
import { rowKeyer } from "./row-key";

describe("rowKeyer", () => {
  it("同じ要素には同じ番号を返す", () => {
    const keyer = rowKeyer<{ n: number }>();
    const a = { n: 1 };
    expect(keyer.keyOf(a)).toBe(keyer.keyOf(a));
  });

  it("別の要素には別の番号を配る", () => {
    const keyer = rowKeyer<{ n: number }>();
    expect(keyer.keyOf({ n: 1 })).not.toBe(keyer.keyOf({ n: 1 }));
  });

  it("並べ替えても番号は変わらない", () => {
    const keyer = rowKeyer<{ n: number }>();
    const list = [{ n: 1 }, { n: 2 }];
    const before = list.map(keyer.keyOf);
    expect([...list].reverse().map(keyer.keyOf)).toEqual([...before].reverse());
  });

  it("作り替えた要素は番号を引き継げる", () => {
    const keyer = rowKeyer<{ n: number }>();
    const prev = { n: 1 };
    const key = keyer.keyOf(prev);
    const next = { ...prev, n: 2 };
    keyer.inherit(prev, next);
    expect(keyer.keyOf(next)).toBe(key);
  });

  it("引き継いでいない要素は新しい番号になる", () => {
    const keyer = rowKeyer<{ n: number }>();
    const prev = { n: 1 };
    const key = keyer.keyOf(prev);
    expect(keyer.keyOf({ ...prev })).not.toBe(key);
  });

  it("道具ごとに番号は独立している", () => {
    const a = rowKeyer<{ n: number }>();
    const b = rowKeyer<{ n: number }>();
    expect(a.keyOf({ n: 1 })).toBe(b.keyOf({ n: 1 }));
  });
});
