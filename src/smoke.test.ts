import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { BATTLE_KEY, type Battle } from "./model/types";

describe("足場", () => {
  it("Vitest が動く", () => {
    expect(1 + 1).toBe(2);
  });
});

describe("README", () => {
  // README に手書きで残る唯一の一覧が対応CSVファイル名。戦闘種別を増減したときに
  // 文書だけ古くなるのを防ぐため、モデル側の定義と突き合わせて縛る。
  it("対応する全戦闘種別のCSVファイル名を挙げている", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf-8");
    for (const key of Object.keys(BATTLE_KEY) as Battle[]) {
      expect(readme).toContain(`${BATTLE_KEY[key]}.csv`);
    }
  });
});
