import { describe, it, expect } from "vitest";
import { RangeScanner, encodeLines } from "./scan-range";
import { parseCsvLine } from "./scan";
import type { Query } from "../model/types";

const HEADER = ["No.", "日付", "海域", "攻撃艦", "ダメージ"];

function csvOf(rows: string[][]): string {
  return rows.map((r) => r.join(",")).join("\r\n") + "\r\n";
}

/** バイト列を range の切れ目で分けて走査し、結果をつなげる。 */
function scanInRanges(bytes: Uint8Array, query: Query, cuts: number[]) {
  const bounds = [0, ...cuts, bytes.length];
  const scanned: number[] = [];
  const matched: number[] = [];
  const kept: string[] = [];
  const lines: string[] = [];
  for (let k = 0; k < bounds.length - 1; k++) {
    const start = bounds[k];
    const end = bounds[k + 1];
    if (start >= end) continue;
    const s = new RangeScanner({ query, csvHeader: HEADER, keepLimit: 10000 });
    // 2つ目以降の範囲は、直前の1バイト(前の行の改行)から読ませる。
    s.push(bytes.subarray(k === 0 ? start : start - 1, end));
    // 範囲の終わりで切れた行は、続きを1バイトずつ読んで閉じる
    let at = end;
    while (s.midLine && at < bytes.length) {
      if (s.pushTail(bytes.subarray(at, at + 1))) break;
      at++;
    }
    s.finish();
    scanned.push(s.result.scanned);
    matched.push(s.result.matched);
    kept.push(...s.result.keptLines);
    lines.push(...s.result.lines);
  }
  return {
    scanned: scanned.reduce((a, b) => a + b, 0),
    matched: matched.reduce((a, b) => a + b, 0),
    kept,
    lines,
  };
}

const query = {
  battle: "hougeki",
  dateRanges: [],
  output: { kind: "column", column: "攻撃艦", cond: { kind: "eq", values: ["自軍"] } },
  attackerItems: null,
  defenderItems: null,
} as unknown as Query;

const rows: string[][] = [HEADER];
for (let i = 0; i < 60; i++) {
  rows.push([String(i), "2026/01/02 3:04:05", "6-4", i % 3 === 0 ? "自軍" : "敵軍", String(i * 7)]);
}
const text = csvOf(rows);
const bytes = new TextEncoder().encode("﻿" + text);

describe("RangeScanner", () => {
  it("どこで区切っても、1本で走査したのと同じ結果になる", () => {
    const whole = scanInRanges(bytes, query, []);
    expect(whole.scanned).toBe(60);
    expect(whole.matched).toBe(20);
    for (let cut = 1; cut < bytes.length; cut++) {
      const split = scanInRanges(bytes, query, [cut]);
      expect(split.scanned).toBe(whole.scanned);
      expect(split.matched).toBe(whole.matched);
      expect(split.lines).toEqual(whole.lines);
      expect(split.kept).toEqual(whole.kept);
    }
  });

  it("3つに分けても同じ結果になる", () => {
    const whole = scanInRanges(bytes, query, []);
    const third = Math.floor(bytes.length / 3);
    const split = scanInRanges(bytes, query, [third, third * 2]);
    expect(split.matched).toBe(whole.matched);
    expect(split.lines).toEqual(whole.lines);
  });

  it("つなげたバイト列は元のCSVと同じ形になる", () => {
    const whole = scanInRanges(bytes, query, []);
    const third = Math.floor(bytes.length / 3);
    const split = scanInRanges(bytes, query, [third, third * 2]);
    const dec = new TextDecoder("utf-8");
    expect(dec.decode(encodeLines(split.lines))).toBe(dec.decode(encodeLines(whole.lines)));
    expect(parseCsvLine(whole.lines[0])).toEqual(rows[1]);
  });
});
