import { describe, it, expect } from "vitest";
import { CsvParser } from "./csv";
import { CsvLineReader, parseCsvLine, pickFields } from "./scan";

function readLines(chunks: string[]): string[] {
  const r = new CsvLineReader();
  const lines: string[] = [];
  for (const c of chunks) r.push(c, (l) => lines.push(l));
  r.flush((l) => lines.push(l));
  return lines;
}

/** CsvParser で全部のセルに分けた結果。突き合わせの基準にする。 */
function parseAll(chunks: string[]): string[][] {
  const p = new CsvParser();
  const rows: string[][] = [];
  for (const c of chunks) rows.push(...p.push(c));
  rows.push(...p.flush());
  return rows;
}

const SAMPLES = [
  "a,b\r\nc,d\r\n",
  "a,b\nc,d\n",
  "a,b\r\nc,d",
  '﻿No.,日付\r\n1,"深海5,500t級軽巡洋艦"\r\n',
  'a,"say ""hi""",c\r\n',
  'a,"x\r\ny",c\r\nd,e,f\r\n',
  "a,,c\r\n",
  "a,b\rc,d\r",
  '"quoted",1\r\n"",2\r\n',
  "a,b\r\n\r\nc,d\r\n",
];

describe("CsvLineReader", () => {
  it("行に切ってから分けても、まとめて分けた結果と同じになる", () => {
    for (const text of SAMPLES) {
      expect(readLines([text]).map(parseCsvLine)).toEqual(parseAll([text]));
    }
  });

  it("どの位置でチャンクを切っても結果が変わらない", () => {
    for (const text of SAMPLES) {
      const whole = readLines([text]);
      for (let i = 1; i < text.length; i++) {
        expect(readLines([text.slice(0, i), text.slice(i)])).toEqual(whole);
      }
    }
  });

  it("引用の中の改行では行を切らない", () => {
    expect(readLines(['a,"x\r\ny",c\r\n'])).toEqual(['a,"x\r\ny",c']);
  });
});

describe("pickFields", () => {
  /** 全部のセルに分けた結果と、拾った列だけを突き合わせる。 */
  function check(line: string, cols: number[]) {
    const full = parseCsvLine(line);
    const want = new Uint8Array(full.length);
    let maxCol = -1;
    for (const c of cols) {
      want[c] = 1;
      if (c > maxCol) maxCol = c;
    }
    const out: string[] = [];
    pickFields(line, want, maxCol, out);
    for (const c of cols) expect(out[c]).toBe(full[c]);
  }

  it("素の値を拾う", () => {
    check("a,b,c,d", [0, 2, 3]);
  });

  it("引用値を引用符を外して拾う", () => {
    check('a,"深海5,500t級軽巡洋艦",c', [0, 1, 2]);
  });

  it("引用値の中の二重引用符をほどく", () => {
    check('a,"say ""hi""",c', [1, 2]);
  });

  it("空セルを拾う", () => {
    check("a,,c", [1]);
    check(",,", [0, 1, 2]);
  });

  it("列名の行でも同じに拾える", () => {
    check("No.,日付,海域,マス", [1, 3]);
  });

  it("最後の列を拾う", () => {
    check("a,b,c", [2]);
  });
});
