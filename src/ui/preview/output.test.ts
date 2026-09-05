import { describe, it, expect } from "vitest";
import { csvToTsv } from "./output";

const csv = ["No.,名前", "1,金剛", '2,"綾波,改"'].join("\r\n") + "\r\n";

describe("csvToTsv", () => {
  it("区切りをタブにする", () => {
    expect(csvToTsv(csv, true).split("\r\n")[0]).toBe("No.\t名前");
  });

  it("ヘッダを落とせる", () => {
    expect(csvToTsv(csv, false).split("\r\n")[0]).toBe("1\t金剛");
  });

  it("囲みの中の区切りは値のまま扱う", () => {
    expect(csvToTsv(csv, false).split("\r\n")[1]).toBe("2\t綾波,改");
  });
});
