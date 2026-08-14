import { describe, it, expect, beforeEach, vi } from "vitest";
import { listTemplates, saveTemplate, deleteTemplate } from "./templates";
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
});
