import { describe, it, expect } from "vitest";
import { keepInView } from "./list-scroll";

describe("keepInView", () => {
  it("見えている行はそのまま", () => {
    expect(keepInView(0, 100, 20, 20)).toBe(0);
    expect(keepInView(50, 100, 60, 20)).toBe(50);
  });

  it("下に外れていれば行の尻を下端に合わせる", () => {
    expect(keepInView(0, 100, 100, 20)).toBe(20);
  });

  it("上に外れていれば行の頭を上端に合わせる", () => {
    expect(keepInView(50, 100, 20, 20)).toBe(20);
  });

  it("窓より高い行は頭を優先する", () => {
    expect(keepInView(0, 20, 40, 60)).toBe(80);
    expect(keepInView(80, 20, 40, 60)).toBe(40);
  });
});
