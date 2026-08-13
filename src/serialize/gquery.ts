import type { CompareOp, DateRange, OutputNode, Query, ValueCond } from "../model/types";
import { expandOutput } from "../model/expand";
import type { Column } from "../schema/catalog";

export type GQueryResult = {
  query: string;
  /** 変換できずに落とした節。 */
  dropped: string[];
  warnings: string[];
};

const CMP: Record<CompareOp, string> = {
  以上: ">=",
  より大きい: ">",
  以下: "<=",
  より小さい: "<",
};

/** 文字列リテラル。シングルクォートは2つ重ねる。 */
function lit(v: string | number): string {
  if (typeof v === "number") return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

function isAlwaysEmpty(col: Column): boolean {
  return col.description?.includes("常に空欄") ?? false;
}

/** "20240720123456" → "2024-07-20 12:34:56" */
function dateLiteral(code: string): string {
  const s = (a: number, b: number) => code.slice(a, b);
  return `${s(0, 4)}-${s(4, 6)}-${s(6, 8)} ${s(8, 10)}:${s(10, 12)}:${s(12, 14)}`;
}

class Ctx {
  readonly warnings: string[] = [];
  readonly index: Map<string, number>;
  readonly byName: Map<string, Column>;
  constructor(columns: Column[]) {
    this.index = new Map(columns.map((c, i) => [c.name, i + 1]));
    this.byName = new Map(columns.map((c) => [c.name, c]));
  }
}

function valueExpr(ref: string, cond: ValueCond, col: Column, ctx: Ctx): string | null {
  switch (cond.kind) {
    case "eq": {
      if (cond.values.length === 0) return null;
      const parts = cond.values.map((v) => `${ref} = ${lit(v)}`);
      return parts.length === 1 ? parts[0] : `(${parts.join(" or ")})`;
    }
    case "contains": {
      const parts = cond.values.filter((v) => v !== "").map((v) => `${ref} contains ${lit(v)}`);
      if (parts.length === 0) return null;
      return parts.length === 1 ? parts[0] : `(${parts.join(" or ")})`;
    }
    case "regex": {
      // logbook も Google QUERY も matches は完全一致なので意味が一致する
      const parts = cond.values.filter((v) => v !== "").map((v) => `${ref} matches ${lit(v)}`);
      if (parts.length === 0) return null;
      return parts.length === 1 ? parts[0] : `(${parts.join(" or ")})`;
    }
    case "cmp":
      if (isAlwaysEmpty(col)) {
        ctx.warnings.push(
          `${col.name}: logbook は空セルを 0 として扱いますが、QUERY では空セルは比較で偽になります`,
        );
      }
      return `${ref} ${CMP[cond.op]} ${cond.value}`;
    case "group": {
      if (cond.op === "NOT") {
        const inner = valueExpr(ref, cond.children[0], col, ctx);
        return inner === null ? null : `not (${inner})`;
      }
      const parts = cond.children
        .map((c) => valueExpr(ref, c, col, ctx))
        .filter((x): x is string => x !== null);
      if (parts.length === 0) return null;
      const joiner = cond.op === "AND" ? " and " : " or ";
      return parts.length === 1 ? parts[0] : `(${parts.join(joiner)})`;
    }
  }
}

function outputExpr(node: OutputNode, ctx: Ctx): string | null {
  switch (node.kind) {
    case "column": {
      const i = ctx.index.get(node.column);
      const col = ctx.byName.get(node.column);
      if (i === undefined || col === undefined) {
        ctx.warnings.push(`列 ${node.column} はこの戦闘種別に存在しないため落としました`);
        return null;
      }
      return valueExpr(`Col${i}`, node.cond, col, ctx);
    }
    case "group": {
      if (node.op === "NOT") {
        const inner = node.children[0] === undefined ? null : outputExpr(node.children[0], ctx);
        return inner === null ? null : `not (${inner})`;
      }
      const parts = node.children
        .map((c) => outputExpr(c, ctx))
        .filter((x): x is string => x !== null);
      if (parts.length === 0) return null;
      const joiner = node.op === "AND" ? " and " : " or ";
      return parts.length === 1 ? parts[0] : `(${parts.join(joiner)})`;
    }
    case "slot":
      throw new Error("装備スロット条件は expandOutput で展開してから渡してください");
  }
}

function dateExpr(ranges: DateRange[], ctx: Ctx): string | null {
  const i = ctx.index.get("日付");
  if (i === undefined) return null;
  const ref = `Col${i}`;
  const parts = ranges
    .map((r) => {
      const bits: string[] = [];
      if (r.start !== null) bits.push(`${ref} >= datetime ${lit(dateLiteral(r.start))}`);
      if (r.end !== null) bits.push(`${ref} <= datetime ${lit(dateLiteral(r.end))}`);
      if (bits.length === 0) return null;
      return bits.length === 1 ? bits[0] : `(${bits.join(" and ")})`;
    })
    .filter((x): x is string => x !== null);
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `(${parts.join(" or ")})`;
}

export function toGoogleQuery(
  q: Query, columns: Column[], opts: { includeDate: boolean },
): GQueryResult {
  const ctx = new Ctx(columns);
  const dropped: string[] = [];
  const terms: string[] = [];

  if (q.output !== null) {
    const e = outputExpr(expandOutput(q.output), ctx);
    if (e !== null) terms.push(e);
  }

  if (q.dateRanges.length > 0) {
    if (opts.includeDate) {
      const e = dateExpr(q.dateRanges, ctx);
      if (e !== null) terms.push(e);
      else dropped.push("日時");
    } else {
      dropped.push("日時");
    }
  }

  // 装備ID・カテゴリ・装備自体の性能は CSV に列が無いので変換できない
  if (q.attackerItems !== null) dropped.push("攻撃艦装備");
  if (q.defenderItems !== null) dropped.push("防御艦装備");

  const where = terms.length === 0 ? "" : ` where ${terms.length === 1 ? terms[0] : `(${terms.join(" and ")})`}`;
  return { query: `select *${where}`, dropped, warnings: ctx.warnings };
}
