import { describe, it, expect } from "vitest";
import { fromDateCode, toDateCode } from "./date";

describe("toDateCode", () => {
  it("datetime-local の値を14桁にする", () => {
    expect(toDateCode("2024-07-20T00:00")).toBe("20240720000000");
    expect(toDateCode("2024-07-20T13:05")).toBe("20240720130500");
  });

  it("秒つきも受ける", () => {
    expect(toDateCode("2024-07-20T13:05:09")).toBe("20240720130509");
  });

  it("空や壊れた値は null", () => {
    expect(toDateCode("")).toBeNull();
    expect(toDateCode("2024-07-20")).toBeNull();
  });
});

describe("fromDateCode", () => {
  it("14桁を datetime-local の値に戻す", () => {
    expect(fromDateCode("20240720130509")).toBe("2024-07-20T13:05:09");
  });

  it("往復する", () => {
    expect(toDateCode(fromDateCode("20240720130509"))).toBe("20240720130509");
  });
});
