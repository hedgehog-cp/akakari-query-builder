import type {
  CountItemNode, DateRange, ItemCond, OutputNode, Query, ValueCond,
} from "../model/types";
import { BATTLE_KEY } from "../model/types";
import { expandOutput } from "../model/expand";

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** 一致の値。1件なら直値、複数なら配列。 */
function eqJson(values: (string | number)[]): Json {
  return values.length === 1 ? values[0] : [...values];
}

export function valueCondToJson(cond: ValueCond): Json {
  switch (cond.kind) {
    case "eq":
      return eqJson(cond.values);
    case "contains":
      return { 含む: eqJson(cond.values) };
    case "regex":
      return { 正規表現: eqJson(cond.values) };
    case "cmp":
      return { [cond.op]: cond.value };
    case "group":
      if (cond.op === "NOT") {
        return { NOT: valueCondToJson(cond.children[0]) };
      }
      return { [cond.op]: cond.children.map(valueCondToJson) };
  }
}

export function outputToJson(node: OutputNode): Json {
  switch (node.kind) {
    case "column":
      return { [node.column]: valueCondToJson(node.cond) };
    case "group":
      if (node.op === "NOT") {
        return { NOT: outputToJson(node.children[0]) };
      }
      return { [node.op]: node.children.map(outputToJson) };
    case "slot":
      throw new Error("装備スロット条件は expandOutput で展開してから渡してください");
    case "displayItem":
      throw new Error("表示装備条件は expandOutput で展開してから渡してください");
  }
}

export function itemCondToJson(cond: ItemCond): Json {
  switch (cond.kind) {
    case "exists":
      return null;
    case "attr":
      return { [cond.attr]: valueCondToJson(cond.cond) };
    case "group":
      if (cond.op === "NOT") {
        return { NOT: itemCondToJson(cond.children[0]) };
      }
      return { [cond.op]: cond.children.map(itemCondToJson) };
  }
}

export function countItemToJson(node: CountItemNode): Json {
  switch (node.kind) {
    case "count":
      // 装備数 と 条件 は必ず対で出す。片方だけでは logbook 側で条件が登録されない。
      return { 装備数: valueCondToJson(node.count), 条件: itemCondToJson(node.cond) };
    case "group":
      if (node.op === "NOT") {
        return { NOT: countItemToJson(node.children[0]) };
      }
      return { [node.op]: node.children.map(countItemToJson) };
  }
}

function dateRangeToJson(r: DateRange): Json {
  const o: Record<string, Json> = {};
  if (r.start !== null) o.開始 = r.start;
  if (r.end !== null) o.終了 = r.end;
  return o;
}

export function queryToJson(q: Query): Json {
  const o: Record<string, Json> = { 種別: BATTLE_KEY[q.battle] };
  if (q.dateRanges.length === 1) {
    o.日時 = dateRangeToJson(q.dateRanges[0]);
  } else if (q.dateRanges.length > 1) {
    o.日時 = q.dateRanges.map(dateRangeToJson);
  }
  if (q.output !== null) o.出力 = outputToJson(expandOutput(q.output));
  if (q.attackerItems !== null) o.攻撃艦装備 = countItemToJson(q.attackerItems);
  if (q.defenderItems !== null) o.防御艦装備 = countItemToJson(q.defenderItems);
  return o;
}

export function serializeQuery(q: Query): string {
  return JSON.stringify(queryToJson(q), null, 2);
}
