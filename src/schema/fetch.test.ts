import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchCatalog } from "./fetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchCatalog", () => {
  it("取得に成功すればネットワークの結果を使う", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ fields: [{ name: "テスト列", type: "string" }] }),
    })));
    const r = await fetchCatalog("akakari-hougeki");
    expect(r.usedFallback).toBe(false);
    expect(r.columns.map((c) => c.name)).toEqual(["テスト列"]);
  });

  it("取得に失敗すれば同梱データにフォールバックする", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    const r = await fetchCatalog("akakari-raigeki");
    expect(r.usedFallback).toBe(true);
    expect(r.columns.length).toBeGreaterThan(0);
  });
});
