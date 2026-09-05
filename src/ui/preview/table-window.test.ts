import { describe, it, expect } from "vitest";
import { ROW_HEIGHT, sameWindow, windowOf } from "./table-window";

/** 列の左端。0列目は貼り付けた列、以降は等間隔。 */
const offsets = [0, 40, 140, 240, 340, 440, 540];

const view = (o: Partial<Parameters<typeof windowOf>[0]>) => ({
  scrollTop: 0,
  clientHeight: 200,
  scrollLeft: 0,
  clientWidth: 300,
  ...o,
});

describe("windowOf", () => {
  it("先頭では0行目から始まる", () => {
    expect(windowOf(view({}), offsets, 500).rowFirst).toBe(0);
  });

  it("送った先では画面に入る行を選ぶ", () => {
    const w = windowOf(view({ scrollTop: 100 * ROW_HEIGHT }), offsets, 500);
    expect(w.rowFirst).toBeLessThan(100);
    expect(w.rowLast).toBeGreaterThan(110);
  });

  it("行の数を超えない", () => {
    const w = windowOf(view({ scrollTop: 0, clientHeight: 10000 }), offsets, 30);
    expect(w.rowFirst).toBe(0);
    expect(w.rowLast).toBe(29);
  });

  it("貼り付けた左端の列は窓に入れない", () => {
    expect(windowOf(view({}), offsets, 10).colFirst).toBeGreaterThanOrEqual(1);
  });

  it("最後の列を超えない", () => {
    const w = windowOf(view({ scrollLeft: 10000 }), offsets, 10);
    expect(w.colLast).toBeLessThanOrEqual(offsets.length - 2);
  });
});

describe("sameWindow", () => {
  const w = { rowFirst: 0, rowLast: 10, colFirst: 1, colLast: 5 };

  it("同じ範囲なら同じ", () => {
    expect(sameWindow(w, { ...w })).toBe(true);
  });

  it("どこか1つでも違えば違う", () => {
    expect(sameWindow(w, { ...w, rowLast: 11 })).toBe(false);
    expect(sameWindow(w, { ...w, colFirst: 2 })).toBe(false);
  });
});
