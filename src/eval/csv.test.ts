import { describe, it, expect } from "vitest";
import { CsvParser, formatCsvRow, formatTsvRow, stripBom } from "./csv";

function parseAll(chunks: string[]): string[][] {
  const p = new CsvParser();
  const rows: string[][] = [];
  for (const c of chunks) rows.push(...p.push(c));
  rows.push(...p.flush());
  return rows;
}

describe("stripBom", () => {
  it("先頭のBOMだけ落とす", () => {
    expect(stripBom("﻿No.,日付")).toBe("No.,日付");
    expect(stripBom("No.,日付")).toBe("No.,日付");
  });
});

describe("CsvParser", () => {
  it("CRLF区切りの行を読む", () => {
    expect(parseAll(["a,b\r\nc,d\r\n"])).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("LFだけでも読む", () => {
    expect(parseAll(["a,b\nc,d\n"])).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("最終行に改行が無くても読む", () => {
    expect(parseAll(["a,b\r\nc,d"])).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("引用値の中のカンマを列区切りにしない", () => {
    expect(parseAll(['a,"深海5,500t級軽巡洋艦",c\r\n'])).toEqual([
      ["a", "深海5,500t級軽巡洋艦", "c"],
    ]);
  });

  it("引用値の中の二重引用符をほどく", () => {
    expect(parseAll(['a,"say ""hi""",c\r\n'])).toEqual([["a", 'say "hi"', "c"]]);
  });

  it("引用値の中のCRLFを保つ", () => {
    expect(parseAll(['a,"x\r\ny",c\r\n'])).toEqual([["a", "x\r\ny", "c"]]);
  });

  it("空セルは空文字列になる", () => {
    expect(parseAll(["a,,c\r\n"])).toEqual([["a", "", "c"]]);
  });

  it("チャンク境界が引用値の途中に落ちても壊れない", () => {
    expect(parseAll(['a,"深海5,', '500t級軽巡洋艦",c\r\n'])).toEqual([
      ["a", "深海5,500t級軽巡洋艦", "c"],
    ]);
  });

  it("チャンク境界がCRとLFの間に落ちても壊れない", () => {
    expect(parseAll(["a,b\r", "\nc,d\r\n"])).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("BOM付き先頭行を読む", () => {
    expect(parseAll(["﻿No.,日付\r\n"])).toEqual([["No.", "日付"]]);
  });
});

describe("formatCsvRow", () => {
  it("必要なときだけ引用する", () => {
    expect(formatCsvRow(["a", "b"])).toBe("a,b");
    expect(formatCsvRow(["a", "x,y"])).toBe('a,"x,y"');
    expect(formatCsvRow(["a", 'x"y'])).toBe('a,"x""y"');
    expect(formatCsvRow(["a", "x\r\ny"])).toBe('a,"x\r\ny"');
  });

  it("読み書きが往復する", () => {
    const row = ["No.", "深海5,500t級軽巡洋艦", 'say "hi"', ""];
    expect(parseAll([formatCsvRow(row) + "\r\n"])).toEqual([row]);
  });
});

describe("実データの形", () => {
  it("敵艦隊にカンマを含む引用値がある行を正しく分解する", () => {
    // 赤仮砲撃戦.csv の 敵艦隊 に実在する値
    const line =
      '1,2024/07/20 12:34:56,ブルネイ泊地沖,マップ:7-1 セル:4,出撃,勝利S,' +
      '"深海5,500t級軽巡洋艦",120';
    const rows = parseAll([line + "\r\n"]);
    expect(rows[0]).toHaveLength(8);
    expect(rows[0][6]).toBe("深海5,500t級軽巡洋艦");
    expect(rows[0][7]).toBe("120");
  });
});

describe("formatTsvRow", () => {
  it("必要なときだけ引用する", () => {
    expect(formatTsvRow(["a", "b"])).toBe("a\tb");
    // カンマは TSV では区切りではないので引用しない
    expect(formatTsvRow(["a", "x,y"])).toBe("a\tx,y");
    expect(formatTsvRow(["a", "x\ty"])).toBe('a\t"x\ty"');
    expect(formatTsvRow(["a", 'x"y'])).toBe('a\t"x""y"');
    expect(formatTsvRow(["a", "x\r\ny"])).toBe('a\t"x\r\ny"');
  });
});
