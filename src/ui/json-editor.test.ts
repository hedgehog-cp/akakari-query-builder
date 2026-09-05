import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";

/**
 * 括弧と引用符の組・`}` を打ったときの戻しは CodeMirror の拡張が
 * 言語の設定を見て行う。設定が欠けると黙って効かなくなるので、ここで確かめる。
 */
describe("JSON の言語設定", () => {
  const state = EditorState.create({ doc: "{}", extensions: [json()] });

  it("組にする括弧に引用符が入っている", () => {
    const brackets = state.languageDataAt<{ brackets?: string[] }>("closeBrackets", 1)[0];
    expect(brackets?.brackets).toEqual(expect.arrayContaining(["{", "[", '"']));
  });

  it("閉じ括弧を打つと行を組み直す", () => {
    const re = state.languageDataAt<RegExp>("indentOnInput", 1)[0];
    expect(re).toBeInstanceOf(RegExp);
    expect(re.test("  }")).toBe(true);
    expect(re.test("  ]")).toBe(true);
  });
});
