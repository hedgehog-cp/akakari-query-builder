import type { DateRange, OutputNode, Query, ValueCond } from "../model/types";
import { expandOutput } from "../model/expand";

/** CSV の1行が条件に合うかを返す。 */
export type Predicate = (row: string[]) => boolean;

/** compileQuery の結果。 */
export type Compiled = {
  predicate: Predicate;
  /** predicate が読む列の位置。ここに無い列は走査で文字列にしなくてよい。 */
  usedColumns: number[];
  /** 評価できずに無視した節。 */
  ignored: string[];
  /** CSV のヘッダに無かった列。その条件は常に偽になる。 */
  missingColumns: string[];
};

/** logbook が数値の一致判定に使う許容差と同じ。 */
export const THRESHOLD = 0.0001;

/** logbook は空文字列を 0 として扱い、数値でない文字列は偽にする。 */
function asNumber(value: string): number | null {
  if (value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 正規表現の中で、記号を字そのものとして扱わせる。 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 複数の型を1本にまとめる。型ごとに試すより速いが、後方参照(\1)や名前付きの組は
 * 番号や名前がぶつかって意味が変わるため、そのときは諦めて null を返す。
 */
function combineRegex(patterns: string[]): RegExp | null {
  if (patterns.length < 2) return null;
  if (patterns.some((p) => /\\\d|\(\?</.test(p))) return null;
  try {
    return new RegExp(`^(?:${patterns.map((p) => `(?:${p})`).join("|")})$`);
  } catch {
    return null;
  }
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
      if (parts.length === 1) {
        const only = parts[0];
        return (value) => value.includes(only);
      }
      // 語ごとに includes を回すと語数に比例して遅くなる。1本の正規表現にまとめれば
      // 何語あっても値を1度なぞるだけで済む(20語で1桁速い)。
      const re = new RegExp(parts.map(escapeRegex).join("|"));
      return (value) => re.test(value);
    }
    case "regex": {
      // logbook は matches()、すなわち完全一致
      const one = combineRegex(cond.values);
      if (one !== null) return (value) => one.test(value);
      const res = cond.values.map((p) => new RegExp(`^(?:${p})$`));
      return (value) => res.some((r) => r.test(value));
    }
    case "cmp": {
      const t = cond.value;
      return (value) => {
        const n = asNumber(value);
        if (n === null) return false;
        switch (cond.op) {
          case "以上":
            return n > t - THRESHOLD;
          case "より大きい":
            return n > t + THRESHOLD;
          case "以下":
            return n < t + THRESHOLD;
          case "より小さい":
            return n < t - THRESHOLD;
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
  node: OutputNode,
  index: Map<string, number>,
  missing: Set<string>,
  used: Set<number>,
): Predicate {
  switch (node.kind) {
    case "column": {
      const i = index.get(node.column);
      if (i === undefined) {
        missing.add(node.column);
        return () => false;
      }
      used.add(i);
      const test = valuePredicate(node.cond);
      return (row) => test(row[i] ?? "");
    }
    case "group": {
      const kids = node.children.map((c) => outputPredicate(c, index, missing, used));
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

const ZERO = 48;
const NINE = 57;
const SLASH = 47;
const COLON = 58;
/** 数と数の間が空白であることを表す(空白なら何文字あってもよい)。 */
const SPACE = -1;

/** 年・月・日・時・分・秒の順に、間に来る字。最後の秒の後には何も来ない。 */
const DATE_SEPARATORS = [SLASH, SLASH, SPACE, COLON, COLON];

function isSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 13 || code === 10;
}

/**
 * EOEN の 日付 は %Y/%m/%d %H:%M:%S。日本語環境では時がゼロ埋めされない。
 * 比較用に yyyyMMddHHmmss と同じ並びの数へ揃える。形が違えば -1。
 *
 * 1行ごとに呼ばれるので、正規表現も文字列の組み立ても使わない。桁を数として
 * 積んでいくだけなら、その場の値だけで済んで何も作らずに済む。
 */
function dateCodeOf(value: string): number {
  let i = 0;
  let end = value.length;
  while (i < end && isSpace(value.charCodeAt(i))) i++;
  while (end > i && isSpace(value.charCodeAt(end - 1))) end--;

  let code = 0;
  for (let part = 0; part < 6; part++) {
    // 年だけは4桁固定。月日時分秒はゼロ埋めされないことがあるので1桁でも通す。
    const width = part === 0 ? 4 : 2;
    let digits = 0;
    let n = 0;
    while (i < end && digits < width) {
      const c = value.charCodeAt(i);
      if (c < ZERO || c > NINE) break;
      n = n * 10 + (c - ZERO);
      i++;
      digits++;
    }
    if (digits < (part === 0 ? 4 : 1)) return -1;
    code = part === 0 ? n : code * 100 + n;

    if (part === 5) break;
    const separator = DATE_SEPARATORS[part];
    if (separator === SPACE) {
      if (i >= end || !isSpace(value.charCodeAt(i))) return -1;
      while (i < end && isSpace(value.charCodeAt(i))) i++;
    } else {
      if (value.charCodeAt(i) !== separator) return -1;
      i++;
    }
  }
  return i === end ? code : -1;
}

/** 範囲の端(yyyyMMddHHmmss の14桁)を数にする。14桁でなければ null。 */
function boundCodeOf(bound: string | null): number | null {
  if (bound === null) return null;
  return /^\d{14}$/.test(bound) ? Number(bound) : null;
}

function datePredicate(
  ranges: DateRange[],
  index: Map<string, number>,
  used: Set<number>,
): Predicate | null {
  if (ranges.length === 0) return null;
  const i = index.get("日付");
  if (i === undefined) return () => false;
  used.add(i);
  // 端は行ごとに変わらないので先に数にしておく。14桁でない端(画面と読み込みが
  // 弾くので届かないはず)を持つ範囲は、合う行が無いものとして落とす。
  const bounds: { start: number | null; end: number | null }[] = [];
  for (const r of ranges) {
    const start = boundCodeOf(r.start);
    const end = boundCodeOf(r.end);
    if ((r.start !== null && start === null) || (r.end !== null && end === null)) continue;
    bounds.push({ start, end });
  }
  if (bounds.length === 0) return () => false;
  return (row) => {
    const code = dateCodeOf(row[i] ?? "");
    if (code < 0) return false;
    return bounds.some(
      (b) => (b.start === null || b.start <= code) && (b.end === null || code <= b.end),
    );
  };
}

/**
 * クエリを、CSV の行に当てられる述語へ変換する。
 * 列の位置はヘッダで解決し、CSV に無い列を見る条件は落として ignored に載せる。
 */
export function compileQuery(q: Query, header: string[]): Compiled {
  const index = new Map(header.map((name, i) => [name, i]));
  const missing = new Set<string>();
  const used = new Set<number>();
  const ignored: string[] = [];
  const parts: Predicate[] = [];

  if (q.output !== null) {
    parts.push(outputPredicate(expandOutput(q.output), index, missing, used));
  }
  const date = datePredicate(q.dateRanges, index, used);
  if (date !== null) parts.push(date);

  // 装備ID・カテゴリ・装備自体の性能は CSV に列が無いので評価できない
  if (q.attackerItems !== null) ignored.push("攻撃艦装備");
  if (q.defenderItems !== null) ignored.push("防御艦装備");

  const predicate: Predicate =
    parts.length === 0 ? () => true : (row) => parts.every((p) => p(row));

  return { predicate, usedColumns: [...used], ignored, missingColumns: [...missing] };
}
