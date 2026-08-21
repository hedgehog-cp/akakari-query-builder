import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchCatalog, schemaUrl } from "./fetch";
import { BATTLE_SCHEMA } from "../model/types";
import { SCHEMA_IDS, schemaUrl as toolSchemaUrl } from "../../tools/schema-urls.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("schemaUrl", () => {
  // 取得先は akakari-schema が安定URLで配る Table Schema 本体。
  // 以前ここが画面用JSON(/data/<id>.json)を指したまま向こうの廃止に気づかず、
  // 常に同梱フォールバックで動いていたことがあるので、形をテストで縛る。
  it("Table Schema 本体を指す", () => {
    expect(schemaUrl("akakari-hougeki")).toBe(
      "https://hedgehog-cp.github.io/akakari-schema/tableschema/akakari-hougeki-2024-07-20.schema.json",
    );
  });

  // 同梱物の更新と死活確認を担うスクリプトは、画面と同じ generations.json を
  // 読んでいる。読み方まで一致していることをここで縛る。
  it("ツール側と同じ世代・同じURLを指す", () => {
    expect([...SCHEMA_IDS].sort()).toEqual(Object.values(BATTLE_SCHEMA).sort());
    for (const battle of Object.keys(BATTLE_SCHEMA) as (keyof typeof BATTLE_SCHEMA)[]) {
      expect(schemaUrl(battle)).toBe(toolSchemaUrl(BATTLE_SCHEMA[battle]));
    }
  });
});

describe("fetchCatalog", () => {
  it("取得に成功すればネットワークの結果を使う", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ fields: [{ name: "テスト列", type: "string" }] }),
      })),
    );
    const r = await fetchCatalog("akakari-hougeki");
    expect(r.usedFallback).toBe(false);
    expect(r.columns.map((c) => c.name)).toEqual(["テスト列"]);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(schemaUrl("akakari-hougeki"));
  });

  it("取得に失敗すれば同梱データにフォールバックする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 })),
    );
    const r = await fetchCatalog("akakari-raigeki");
    expect(r.usedFallback).toBe(true);
    expect(r.columns.length).toBeGreaterThan(0);
  });
});
