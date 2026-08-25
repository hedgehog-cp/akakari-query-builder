import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

/** @layer <name> { ... } の中身を、入れ子の波括弧を数えて取り出す。 */
function layerBody(name: string): string | null {
  const head = `@layer ${name} {`;
  const start = css.indexOf(head);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start + head.length - 1; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start + head.length, i);
  }
  return null;
}

describe("styles.css", () => {
  // Tailwind 4 の utilities は本物のカスケードレイヤーに入るため、レイヤー外に
  // 書いた要素セレクタは詳細度に関係なくクラス指定に勝ってしまう。素の要素向けの
  // 既定値は必ず base レイヤーに入れ、クラスで上書きできる状態を保つ。
  it("素の要素向けのフォント指定を base レイヤーに入れている", () => {
    const base = layerBody("base");
    expect(base).not.toBeNull();
    for (const sel of ["body", "textarea"]) {
      expect(base!).toMatch(new RegExp(`^\\s*${sel}[,{\\s]`, "m"));
    }
    // コメント中の日本語("body に…")を選択子と誤認しないよう先に落とす。
    const outside = css.replace(base!, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const sel of ["body", "input", "select", "textarea", "button"]) {
      expect(outside).not.toMatch(new RegExp(`^\\s*${sel}[,{\\s]`, "m"));
    }
  });
});
