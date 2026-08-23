import { describe, it, expect } from "vitest";
import { canRedo, canUndo, initHistory, pushHistory, redoHistory, undoHistory } from "./history";

describe("history", () => {
  it("積んで戻してやり直す", () => {
    let h = initHistory("a");
    h = pushHistory(h, "b");
    h = pushHistory(h, "c");
    expect(h.present).toBe("c");
    h = undoHistory(h);
    expect(h.present).toBe("b");
    h = undoHistory(h);
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    h = redoHistory(h);
    expect(h.present).toBe("b");
    expect(canRedo(h)).toBe(true);
  });

  it("戻したあとに変更するとやり直せなくなる", () => {
    let h = pushHistory(pushHistory(initHistory("a"), "b"), "c");
    h = undoHistory(h);
    h = pushHistory(h, "d");
    expect(canRedo(h)).toBe(false);
    // 戻した先の "b" が履歴に積まれ、"c" は消える。
    expect(undoHistory(h).present).toBe("b");
    expect(undoHistory(undoHistory(h)).present).toBe("a");
  });

  it("coalesce は履歴を増やさず今の値だけ差し替える", () => {
    let h = pushHistory(initHistory("a"), "b");
    h = pushHistory(h, "bc", true);
    h = pushHistory(h, "bcd", true);
    expect(h.present).toBe("bcd");
    expect(undoHistory(h).present).toBe("a");
  });

  it("同じ値は積まない", () => {
    const h = pushHistory(initHistory("a"), "a");
    expect(canUndo(h)).toBe(false);
  });

  it("上限を超えると古いものから捨てる", () => {
    let h = initHistory(0);
    for (let i = 1; i <= 150; i++) h = pushHistory(h, i);
    expect(h.past.length).toBe(100);
    expect(h.past[0]).toBe(50);
  });

  it("空の履歴では何もしない", () => {
    const h = initHistory("a");
    expect(undoHistory(h)).toBe(h);
    expect(redoHistory(h)).toBe(h);
  });
});
