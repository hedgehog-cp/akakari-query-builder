import { describe, it, expect } from "vitest";
import { toCatalog } from "./catalog";

const SCHEMA = {
  name: "akakari-hougeki-2024-07-20",
  fieldsMatch: "exact",
  primaryKey: ["No."],
  missingValues: [""],
  fields: [
    { name: "No.", type: "integer", title: "行番号", constraints: { minimum: 1 } },
    {
      name: "ランク", type: "string", title: "戦闘結果",
      constraints: { enum: ["完全勝利!!S", "勝利S", "敗北E"] },
    },
    {
      name: "クリティカル", type: "integer", title: "命中判定",
      categories: [
        { value: 0, label: "命中せず" },
        { value: 1, label: "命中" },
        { value: 2, label: "クリティカル" },
      ],
      constraints: { minimum: 0, maximum: 2 },
    },
    {
      name: "マス", type: "string", title: "マップとセル",
      constraints: { pattern: "^マップ:\\d+-\\d+ セル:\\d+$" },
      example: "マップ:7-1 セル:4",
    },
    { name: "自索敵", type: "string", description: "この形式では常に空欄." },
  ],
};

describe("toCatalog", () => {
  it("列を並び順どおりに返す", () => {
    expect(toCatalog(SCHEMA).map((c) => c.name)).toEqual([
      "No.", "ランク", "クリティカル", "マス", "自索敵",
    ]);
  });

  it("constraints を平らにする", () => {
    const c = toCatalog(SCHEMA);
    expect(c[1].enum).toEqual(["完全勝利!!S", "勝利S", "敗北E"]);
    expect(c[2].categories).toEqual([
      { value: 0, label: "命中せず" },
      { value: 1, label: "命中" },
      { value: 2, label: "クリティカル" },
    ]);
    expect(c[2].minimum).toBe(0);
    expect(c[2].maximum).toBe(2);
    expect(c[3].pattern).toBe("^マップ:\\d+-\\d+ セル:\\d+$");
    expect(c[3].example).toBe("マップ:7-1 セル:4");
  });

  it("fieldsMatch や primaryKey は捨てる", () => {
    const c = toCatalog(SCHEMA) as unknown as Record<string, unknown>[];
    expect(c[0]).not.toHaveProperty("fieldsMatch");
  });

  it("常に空欄の列は description で分かる", () => {
    expect(toCatalog(SCHEMA)[4].description).toContain("常に空欄");
  });

  it("fields が無ければ throw する", () => {
    expect(() => toCatalog({})).toThrow(/fields/);
  });
});
