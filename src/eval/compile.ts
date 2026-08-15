import type { DateRange, OutputNode, Query, ValueCond } from "../model/types";
import { expandOutput } from "../model/expand";

export type Predicate = (row: string[]) => boolean;

export type Compiled = {
  predicate: Predicate;
  /** 評価できずに無視した節。 */
  ignored: string[];
  /** CSV のヘッダに無かった列。その条件は常に偽になる。 */
  missingColumns: string[];
};

/** logbook の BuiltinScriptFilter.THRESHOLD と同じ。 */
export const THRESHOLD = 0.0001;

/** logbook は空文字列を 0 として扱い、数値でない文字列は偽にする。 */
function asNumber(value: string): number | null {
  if (value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function valuePredicate(cond: ValueCond): (value: string) => boolean {
  switch (cond.kind) {
    case "eq": {
      const strs = new Set(cond.values.filter((v): v is string => typeof v === "string"));
      const nums = cond.values.filter((v): v is number => typeof v === "number");
      return (value) => {
        if (strs.has(value)) return true;
        if (nums.length === 0) return false;
        const n = asNumber(value);
        if (n === null) return false;
        return nums.some((t) => Math.abs(t - n) < THRESHOLD);
      };
    }
    case "contains": {
      const parts = cond.values;
      return (value) => parts.some((p) => value.includes(p));
    }
    case "regex": {
      // logbook は matches()、すなわち完全一致
      const res = cond.values.map((p) => new RegExp(`^(?:${p})$`));
      return (value) => res.some((r) => r.test(value));
    }
    case "cmp": {
      const t = cond.value;
      return (value) => {
        const n = asNumber(value);
        if (n === null) return false;
        switch (cond.op) {
          case "以上": return n > t - THRESHOLD;
          case "より大きい": return n > t + THRESHOLD;
          case "以下": return n < t + THRESHOLD;
          case "より小さい": return n < t - THRESHOLD;
        }
      };
    }
    case "group": {
      const kids = cond.children.map(valuePredicate);
      if (cond.op === "NOT") return (value) => !kids[0](value);
      if (cond.op === "AND") return (value) => kids.every((k) => k(value));
      return (value) => kids.some((k) => k(value));
    }
  }
}

function outputPredicate(
  node: OutputNode, index: Map<string, number>, missing: Set<string>,
): Predicate {
  switch (node.kind) {
    case "column": {
      const i = index.get(node.column);
      if (i === undefined) {
        missing.add(node.column);
        return () => false;
      }
      const test = valuePredicate(node.cond);
      return (row) => test(row[i] ?? "");
    }
    case "group": {
      const kids = node.children.map((c) => outputPredicate(c, index, missing));
      if (node.op === "NOT") {
        return kids[0] === undefined ? () => true : (row) => !kids[0](row);
      }
      if (node.op === "AND") return (row) => kids.every((k) => k(row));
      return (row) => kids.some((k) => k(row));
    }
    case "slot":
      throw new Error("装備スロット条件は expandOutput で展開してから渡してください");
    case "displayItem":
      throw new Error("表示装備条件は expandOutput で展開してから渡してください");
  }
}

/**
 * EOEN の 日付 は %Y/%m/%d %H:%M:%S。日本語環境では時がゼロ埋めされない。
 * 比較用に yyyyMMddHHmmss へ揃える。読めなければ null。
 */
function dateCodeOf(value: string): string | null {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(value.trim());
  if (m === null) return null;
  const pad = (s: string, n: number) => s.padStart(n, "0");
  return `${m[1]}${pad(m[2], 2)}${pad(m[3], 2)}${pad(m[4], 2)}${pad(m[5], 2)}${pad(m[6], 2)}`;
}

function datePredicate(ranges: DateRange[], index: Map<string, number>): Predicate | null {
  if (ranges.length === 0) return null;
  const i = index.get("日付");
  if (i === undefined) return () => false;
  return (row) => {
    const code = dateCodeOf(row[i] ?? "");
    if (code === null) return false;
    return ranges.some((r) =>
      (r.start === null || r.start <= code) && (r.end === null || code <= r.end));
  };
}

export function compileQuery(q: Query, header: string[]): Compiled {
  const index = new Map(header.map((name, i) => [name, i]));
  const missing = new Set<string>();
  const ignored: string[] = [];
  const parts: Predicate[] = [];

  if (q.output !== null) {
    parts.push(outputPredicate(expandOutput(q.output), index, missing));
  }
  const date = datePredicate(q.dateRanges, index);
  if (date !== null) parts.push(date);

  // 装備ID・カテゴリ・装備自体の性能は CSV に列が無いので評価できない
  if (q.attackerItems !== null) ignored.push("攻撃艦装備");
  if (q.defenderItems !== null) ignored.push("防御艦装備");

  const predicate: Predicate =
    parts.length === 0 ? () => true : (row) => parts.every((p) => p(row));

  return { predicate, ignored, missingColumns: [...missing] };
}
