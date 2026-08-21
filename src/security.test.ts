import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 公開ページなので、DOM に文字列としてHTMLを流し込む道と、文字列をコードとして
// 実行する道を作らないことを機械的に固定する。今はどちらもゼロで、構文強調も
// トークンを vnode に変換して描いている。うっかり戻ったときにテストで落とすのが
// このファイルの役目。
//
// 併せて、外向きの通信が列カタログの取得1本だけであることも見る。「読み込んだ
// CSV は送信しない」という画面とREADMEの約束は、送信経路が存在しないことで
// 担保しているため、fetch が増えたら必ず目視で確かめたい。

const SRC = resolve(import.meta.dirname);
const SELF = "security.test.ts";

/** src/ 配下の .ts / .tsx を、このファイル自身を除いて集める。 */
function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && entry.name !== SELF) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 行コメント・ブロックコメントを空白にする。禁止語をコメントで説明できるようにするため。
 * 行数がずれると報告する行番号が嘘になるので、改行だけは残す。
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, "");
}

type Hit = { file: string; line: number; text: string };

function scan(pattern: RegExp): Hit[] {
  const hits: Hit[] = [];
  for (const file of sourceFiles()) {
    const lines = stripComments(readFileSync(file, "utf-8")).split("\n");
    lines.forEach((text, i) => {
      if (pattern.test(text))
        hits.push({ file: relative(SRC, file), line: i + 1, text: text.trim() });
    });
  }
  return hits;
}

const show = (hits: Hit[]): string[] => hits.map((h) => `${h.file}:${h.line} ${h.text}`);

describe("危険なAPIを増やさない", () => {
  it("HTML文字列をDOMに流し込まない", () => {
    expect(
      show(
        scan(
          /\b(innerHTML|outerHTML|dangerouslySetInnerHTML|insertAdjacentHTML|document\.write)\b/,
        ),
      ),
    ).toEqual([]);
  });

  it("文字列をコードとして実行しない", () => {
    // setTimeout("...") のような文字列渡しは第1引数がクォートで始まる場合だけを見る
    expect(show(scan(/(^|[^.\w])eval\s*\(|new\s+Function\s*\(|\bsetTimeout\s*\(\s*["'`]/))).toEqual(
      [],
    );
  });

  it("外向きの通信は列カタログの取得だけ", () => {
    const hits = scan(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
    // 行番号で固定すると無関係な編集で落ちるので、どのファイルに何本あるかだけを見る。
    // 落ちたら show(hits) を見て、増えた通信が何を送っているか必ず確かめること。
    expect(show(hits).length, show(hits).join(" / ")).toBe(1);
    expect(hits.map((h) => h.file)).toEqual(["schema/fetch.ts"]);
  });

  it("列カタログの配信元が CSP の connect-src に入っている", () => {
    // 食い違うと取得がブロックされ、画面は黙って同梱フォールバックで動き続ける。
    const generations = JSON.parse(readFileSync(join(SRC, "schema/generations.json"), "utf-8")) as {
      base?: string;
    };
    expect(generations.base, "generations.json に base が無い").toBeDefined();
    const origin = new URL(generations.base as string).origin;

    const config = readFileSync(resolve(SRC, "..", "vite.config.ts"), "utf-8");
    const connect = /"connect-src ([^"]+)"/.exec(config)?.[1];
    expect(connect, "vite.config.ts に connect-src が見つからない").toBeDefined();
    expect(connect).toContain(origin);
  });
});
