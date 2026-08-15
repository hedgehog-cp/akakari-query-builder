import { describe, it, expect, beforeEach, vi } from "vitest";
import { listTemplates, saveTemplate, deleteTemplate, renameTemplate } from "./templates";
import { emptyQuery } from "../model/types";
import { memoryLocalStorage } from "./test-helpers";

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryLocalStorage());
});

describe("templates", () => {
  it("初期状態は空", () => {
    expect(listTemplates()).toEqual([]);
  });

  it("保存すると一覧に載る", () => {
    saveTemplate("潜水艦用", "akakari-hougeki", emptyQuery("akakari-hougeki"));
    const list = listTemplates();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("潜水艦用");
    expect(list[0].battle).toBe("akakari-hougeki");
  });

  it("同名保存は上書きする", () => {
    saveTemplate("A", "akakari-hougeki", emptyQuery("akakari-hougeki"));
    saveTemplate("A", "akakari-raigeki", emptyQuery("akakari-raigeki"));
    const list = listTemplates();
    expect(list).toHaveLength(1);
    expect(list[0].battle).toBe("akakari-raigeki");
  });

  it("削除できる", () => {
    saveTemplate("A", "akakari-hougeki", emptyQuery("akakari-hougeki"));
    deleteTemplate("A");
    expect(listTemplates()).toEqual([]);
  });

  it("改名できる", () => {
    saveTemplate("A", "akakari-hougeki", emptyQuery("akakari-hougeki"));
    const list = renameTemplate("A", "B");
    expect(list.map((t) => t.name)).toEqual(["B"]);
  });

  it("改名先が既存名と衝突する場合は何もしない", () => {
    saveTemplate("A", "akakari-hougeki", emptyQuery("akakari-hougeki"));
    saveTemplate("B", "akakari-hougeki", emptyQuery("akakari-hougeki"));
    const list = renameTemplate("A", "B");
    expect(list.map((t) => t.name).sort()).toEqual(["A", "B"]);
  });

  it("自分自身への改名は何もしないが成功扱い", () => {
    saveTemplate("A", "akakari-hougeki", emptyQuery("akakari-hougeki"));
    const list = renameTemplate("A", "A");
    expect(list.map((t) => t.name)).toEqual(["A"]);
  });
});
