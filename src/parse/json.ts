import {
  BATTLE_KEY, ITEM_ATTRS, emptyQuery,
  type Battle, type CompareOp, type CountItemNode, type DateRange,
  type ItemAttr, type ItemCond, type OutputNode, type Query, type ValueCond,
} from "../model/types";
import { foldOutput } from "../model/fold";

export type ParseWarning = { path: string; message: string };
export type ParseResult = { query: Query; warnings: ParseWarning[] };

const COMPARE_OPS: CompareOp[] = ["以上", "より大きい", "以下", "より小さい"];
const DATE_LEN = 14;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

class Ctx {
  readonly warnings: ParseWarning[] = [];
  constructor(readonly columns: Set<string>) {}
  warn(path: string, message: string): void {
    this.warnings.push({ path, message });
  }
}

function parseValueCond(v: unknown, path: string, ctx: Ctx): ValueCond | null {
  if (typeof v === "number" || typeof v === "string") {
    return { kind: "eq", values: [v] };
  }
  if (Array.isArray(v)) {
    const vals = v.filter((x): x is string | number => typeof x === "string" || typeof x === "number");
    if (vals.length !== v.length) ctx.warn(path, "配列に文字列・数値以外が混ざっています");
    if (vals.length === 0) return null;
    return { kind: "eq", values: vals };
  }
  if (!isObj(v)) {
    ctx.warn(path, "値の条件として解釈できません");
    return null;
  }
  const parts: ValueCond[] = [];
  for (const [key, raw] of Object.entries(v)) {
    const p = `${path}.${key}`;
    if (key === "AND" || key === "OR") {
      const items = Array.isArray(raw) ? raw : (ctx.warn(p, `${key} の値は配列であるべきです`), [raw]);
      const kids = items.map((x) => parseValueCond(x, p, ctx)).filter((x): x is ValueCond => x !== null);
      if (kids.length > 0) parts.push({ kind: "group", op: key, children: kids });
    } else if (key === "NOT") {
      const kid = parseValueCond(raw, p, ctx);
      if (kid !== null) parts.push({ kind: "group", op: "NOT", children: [kid] });
    } else if (key === "一致") {
      const kid = parseValueCond(raw, p, ctx);
      if (kid !== null) parts.push(kid);
    } else if (key === "含む" || key === "正規表現") {
      const arr = Array.isArray(raw) ? raw : [raw];
      const vals = arr.map((x) => String(x));
      parts.push({ kind: key === "含む" ? "contains" : "regex", values: vals });
    } else if (COMPARE_OPS.includes(key as CompareOp)) {
      if (typeof raw !== "number") {
        ctx.warn(p, "数値比較の値が数値ではありません");
        continue;
      }
      parts.push({ kind: "cmp", op: key as CompareOp, value: raw });
    } else {
      ctx.warn(p, `値の条件に未知のキー ${key} があります`);
    }
  }
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : { kind: "group", op: "AND", children: parts };
}

/** 内容が空のグループ(何も読めなかった結果)。子として残すと入れ子で肥大化するため除く。 */
function isVacuousOutput(n: OutputNode): boolean {
  return n.kind === "group" && n.children.length === 0;
}

function parseOutput(v: unknown, path: string, ctx: Ctx): OutputNode | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    const kids = v.map((x, i) => parseOutput(x, `${path}[${i}]`, ctx))
      .filter((x): x is OutputNode => x !== null && !isVacuousOutput(x));
    return { kind: "group", op: "OR", children: kids };
  }
  if (!isObj(v)) {
    ctx.warn(path, "出力の条件として解釈できません");
    return null;
  }
  const parts: OutputNode[] = [];
  for (const [key, raw] of Object.entries(v)) {
    const p = `${path}.${key}`;
    if (key === "AND" || key === "OR") {
      const items = Array.isArray(raw) ? raw : (ctx.warn(p, `${key} の値は配列であるべきです`), [raw]);
      const kids = items.map((x, i) => parseOutput(x, `${p}[${i}]`, ctx))
        .filter((x): x is OutputNode => x !== null && !isVacuousOutput(x));
      parts.push({ kind: "group", op: key, children: kids });
    } else if (key === "NOT") {
      const kid = parseOutput(raw, p, ctx);
      if (kid !== null) parts.push({ kind: "group", op: "NOT", children: [kid] });
    } else {
      if (!ctx.columns.has(key)) {
        ctx.warn(p, `列 ${key} は選択中の戦闘種別に存在しません`);
        continue;
      }
      const cond = parseValueCond(raw, p, ctx);
      if (cond !== null) parts.push({ kind: "column", column: key, cond });
    }
  }
  if (parts.length === 0) return { kind: "group", op: "AND", children: [] };
  return parts.length === 1 ? parts[0] : { kind: "group", op: "AND", children: parts };
}

function parseItemCond(v: unknown, path: string, ctx: Ctx): ItemCond | null {
  if (v === null || v === undefined) return { kind: "exists" };
  if (Array.isArray(v)) {
    const kids = v.map((x, i) => parseItemCond(x, `${path}[${i}]`, ctx))
      .filter((x): x is ItemCond => x !== null);
    return { kind: "group", op: "OR", children: kids };
  }
  if (!isObj(v)) {
    ctx.warn(path, "装備の条件として解釈できません");
    return null;
  }
  const parts: ItemCond[] = [];
  for (const [key, raw] of Object.entries(v)) {
    const p = `${path}.${key}`;
    if (key === "AND" || key === "OR") {
      const items = Array.isArray(raw) ? raw : (ctx.warn(p, `${key} の値は配列であるべきです`), [raw]);
      const kids = items.map((x, i) => parseItemCond(x, `${p}[${i}]`, ctx))
        .filter((x): x is ItemCond => x !== null);
      parts.push({ kind: "group", op: key, children: kids });
    } else if (key === "NOT") {
      const kid = parseItemCond(raw, p, ctx);
      if (kid !== null) parts.push({ kind: "group", op: "NOT", children: [kid] });
    } else if (ITEM_ATTRS.includes(key as ItemAttr)) {
      const cond = parseValueCond(raw, p, ctx);
      if (cond !== null) parts.push({ kind: "attr", attr: key as ItemAttr, cond });
    } else {
      ctx.warn(p, `装備の条件に未知のキー ${key} があります`);
    }
  }
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : { kind: "group", op: "AND", children: parts };
}

function parseCountItem(v: unknown, path: string, ctx: Ctx): CountItemNode | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    const kids = v.map((x, i) => parseCountItem(x, `${path}[${i}]`, ctx))
      .filter((x): x is CountItemNode => x !== null);
    return kids.length === 0 ? null : { kind: "group", op: "OR", children: kids };
  }
  if (!isObj(v)) {
    ctx.warn(path, "装備節として解釈できません");
    return null;
  }
  const parts: CountItemNode[] = [];
  for (const [key, raw] of Object.entries(v)) {
    const p = `${path}.${key}`;
    if (key === "AND" || key === "OR") {
      const items = Array.isArray(raw) ? raw : (ctx.warn(p, `${key} の値は配列であるべきです`), [raw]);
      const kids = items.map((x, i) => parseCountItem(x, `${p}[${i}]`, ctx))
        .filter((x): x is CountItemNode => x !== null);
      if (kids.length > 0) parts.push({ kind: "group", op: key, children: kids });
    } else if (key === "NOT") {
      const kid = parseCountItem(raw, p, ctx);
      if (kid !== null) parts.push({ kind: "group", op: "NOT", children: [kid] });
    }
  }
  if ("装備数" in v) {
    if (!("条件" in v)) {
      ctx.warn(`${path}.装備数`, "装備数 に対応する 条件 がありません。対で書く必要があります");
    } else {
      const count = parseValueCond(v.装備数, `${path}.装備数`, ctx);
      const cond = parseItemCond(v.条件, `${path}.条件`, ctx);
      if (count !== null && cond !== null) parts.push({ kind: "count", count, cond });
    }
  } else if ("条件" in v) {
    ctx.warn(`${path}.条件`, "条件 に対応する 装備数 がありません。対で書く必要があります");
  }
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : { kind: "group", op: "AND", children: parts };
}

function parseDateRange(v: unknown, path: string, ctx: Ctx): DateRange | null {
  if (!isObj(v)) {
    ctx.warn(path, "日時として解釈できません");
    return null;
  }
  const read = (key: "開始" | "終了"): string | null => {
    if (!(key in v)) return null;
    const raw = v[key];
    if (typeof raw !== "string" || raw.length !== DATE_LEN) {
      ctx.warn(`${path}.${key}`, "日時は yyyyMMddHHmmss の14桁である必要があります");
      return null;
    }
    return raw;
  };
  const start = read("開始");
  const end = read("終了");
  if (start === null && end === null) return null;
  return { start, end };
}

function battleFromKey(key: unknown): Battle | null {
  for (const [b, k] of Object.entries(BATTLE_KEY)) {
    if (k === key) return b as Battle;
  }
  return null;
}

export function parseQuery(text: string, knownColumns: string[]): ParseResult {
  const root: unknown = JSON.parse(text);
  const ctx = new Ctx(new Set(knownColumns));
  if (!isObj(root)) {
    ctx.warn("$", "トップレベルがオブジェクトではありません");
    return { query: emptyQuery("akakari-hougeki"), warnings: ctx.warnings };
  }

  const battle = battleFromKey(root.種別);
  if (battle === null) {
    ctx.warn("$.種別", root.種別 === undefined ? "種別がありません" : `種別 ${String(root.種別)} は対象外です`);
  }
  const q = emptyQuery(battle ?? "akakari-hougeki");

  if (root.日時 !== undefined && root.日時 !== null) {
    const raw = root.日時;
    const list = Array.isArray(raw) ? raw : [raw];
    q.dateRanges = list
      .map((x, i) => parseDateRange(x, `$.日時[${i}]`, ctx))
      .filter((x): x is DateRange => x !== null);
  }

  if (root.出力 !== undefined && root.出力 !== null) {
    const parsed = parseOutput(root.出力, "$.出力", ctx);
    q.output = parsed === null ? null : foldOutput(parsed);
  }
  if (root.攻撃艦装備 !== undefined) {
    q.attackerItems = parseCountItem(root.攻撃艦装備, "$.攻撃艦装備", ctx);
  }
  if (root.防御艦装備 !== undefined) {
    q.defenderItems = parseCountItem(root.防御艦装備, "$.防御艦装備", ctx);
  }

  return { query: q, warnings: ctx.warnings };
}
