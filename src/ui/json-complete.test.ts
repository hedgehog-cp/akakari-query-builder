import { describe, it, expect } from "vitest";
import { spotAt, completionsFor, completionRangeAt, type Spot } from "./json-complete";
import type { Column } from "../model/column";

const columns: Column[] = [
  { name: "攻撃艦.名前", type: "string" },
  { name: "ダメージ", type: "integer", title: "与ダメージ" },
  { name: "会敵", type: "string", enum: ["同航戦", "反航戦", "T字有利", "T字不利"] },
];

/** カーソル位置を | で示したテキストから居場所を求める。 */
function spot(marked: string): Spot | null {
  const caret = marked.indexOf("|");
  return spotAt(marked.replace("|", ""), caret);
}

const texts = (s: Spot | null) => (s === null ? [] : completionsFor(s, columns).map((c) => c.text));

describe("spotAt", () => {
  it("カーソルが文字列の外なら何も返さない", () => {
    expect(spot('{ "出力|": {} }')).not.toBeNull();
    expect(spot('{ "出力": |{} }')).toBeNull();
  });

  it("キーと値を見分ける", () => {
    expect(spot('{ "種|" }')?.role).toBe("key");
    expect(spot('{ "種別": "赤仮|" }')?.role).toBe("value");
  });

  it("閉じていない文字列でも読む", () => {
    const s = spot('{ "出力": { "攻撃艦.名前": "金剛|');
    expect(s?.role).toBe("value");
    expect(s?.token.text).toBe("金剛");
    expect(s?.path).toEqual(["出力", "攻撃艦.名前"]);
  });

  it("配列は飛ばして囲んでいるキーだけを積む", () => {
    const s = spot('{ "出力": { "AND": [ { "攻撃艦.名前": "金|" } ] } }');
    expect(s?.path).toEqual(["出力", "AND", "攻撃艦.名前"]);
  });

  it("閉じた括弧は積まない", () => {
    const s = spot('{ "日時": { "開始": "2025" }, "出力": { "ダ|" } }');
    expect(s?.role).toBe("key");
    expect(s?.path).toEqual(["出力"]);
  });
});

describe("completionsFor", () => {
  it("根では最上位のキーを出す", () => {
    expect(texts(spot('{ "|" }'))).toEqual(["種別", "日時", "出力", "攻撃艦装備", "防御艦装備"]);
    expect(texts(spot('{ "出|" }'))).toEqual(["出力"]);
  });

  it("日時の中は開始と終了", () => {
    expect(texts(spot('{ "日時": { "|" } }'))).toEqual(["開始", "終了"]);
  });

  it("出力の中は列名と論理演算", () => {
    const got = texts(spot('{ "出力": { "|" } }'));
    expect(got).toContain("攻撃艦.名前");
    expect(got).toContain("AND");
  });

  it("列名の中は条件の予約語", () => {
    expect(texts(spot('{ "出力": { "ダメージ": { "|" } } }'))).toContain("以上");
  });

  it("装備の節では装備数と条件、その中は装備の属性", () => {
    expect(texts(spot('{ "攻撃艦装備": { "|" } }'))).toContain("装備数");
    expect(texts(spot('{ "攻撃艦装備": { "条件": { "|" } } }'))).toContain("装備名");
  });

  it("種別の値は決まった3つ", () => {
    expect(texts(spot('{ "種別": "|" }'))).toEqual(["赤仮砲撃戦", "赤仮雷撃戦", "赤仮夜戦"]);
  });

  it("選択肢のある列は値を出す", () => {
    expect(texts(spot('{ "出力": { "会敵": "T字|" } }'))).toEqual(["T字有利", "T字不利"]);
  });

  it("艦名の列は打った字から候補を出す", () => {
    const got = texts(spot('{ "出力": { "攻撃艦.名前": "こんごう|" } }'));
    expect(got[0]).toBe("金剛");
  });

  it("艦名は何か打つまで出さない", () => {
    expect(texts(spot('{ "出力": { "攻撃艦.名前": "|" } }'))).toEqual([]);
  });

  it("含むや正規表現の内側でも列名を見て候補を出す", () => {
    const got = texts(spot('{ "出力": { "攻撃艦.名前": { "含む": "こんごう|" } } }'));
    expect(got[0]).toBe("金剛");
  });

  it("装備名の属性は装備を出す", () => {
    const got = texts(spot('{ "攻撃艦装備": { "条件": { "装備名": "10cm連装高角|" } } }'));
    expect(got[0]).toBe("10cm連装高角砲");
  });
});

describe("completionRangeAt", () => {
  it("置き換える範囲は引用符の内側", () => {
    const doc = '{ "出" }';
    const r = completionRangeAt(doc, 4, columns);
    expect(r).not.toBeNull();
    expect(doc.slice(r!.from, r!.to)).toBe("出");
    expect(r!.options[0]).toEqual({ label: "出力", displayLabel: "出力", detail: "" });
  });

  it("値の候補は入れる値と見せる字を分ける", () => {
    const doc = '{ "出力": { "ダメージ": 0, "攻撃艦.名前": "こんごう" } }';
    const r = completionRangeAt(doc, doc.indexOf("こんごう") + 4, columns);
    expect(r!.options[0]).toEqual({ label: "金剛", displayLabel: "金剛", detail: "巡洋戦艦" });
  });

  it("文字列の外では何も返さない", () => {
    expect(completionRangeAt('{ "出力": {} }', 10, columns)).toBeNull();
  });
});
