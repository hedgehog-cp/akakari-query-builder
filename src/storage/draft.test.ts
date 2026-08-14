import { describe, it, expect, beforeEach, vi } from "vitest";
import { saveDraft, loadDraft, clearDraft } from "./draft";
import { emptyQuery } from "../model/types";
import { memoryLocalStorage } from "./test-helpers";

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryLocalStorage());
});

describe("draft", () => {
  it("保存して復元できる", () => {
    const draft = { battle: "akakari-hougeki" as const, query: emptyQuery("akakari-hougeki") };
    saveDraft(draft);
    expect(loadDraft()).toEqual(draft);
  });

  it("保存前は null", () => {
    expect(loadDraft()).toBeNull();
  });

  it("clearDraft で消える", () => {
    saveDraft({ battle: "akakari-hougeki", query: emptyQuery("akakari-hougeki") });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it("壊れたJSONは null 扱いにする", () => {
    localStorage.setItem("akakari-query-builder:draft", "{not json");
    expect(loadDraft()).toBeNull();
  });
});
