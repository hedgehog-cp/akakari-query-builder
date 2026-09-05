import type { CountItemNode, ItemCond, OutputNode, Query, ValueCond } from "./types";
import { expandOutput } from "./expand";
import type { Column } from "../schema/catalog";
import { master } from "../master/load";
import { nameTargetOf } from "./name-target";

/** 警告の種類。画面での出し分けに使う。 */
export type WarningCode =
  | "enum"
  | "integer"
  | "pattern"
  | "empty-numeric"
  | "regex-full-match"
  | "unknown-column"
  | "unknown-name"
  | "empty-group"
  | "empty-value";

/** 1件の警告。path はクエリのどこで起きたかを示す。 */
export type Warning = { code: WarningCode; path: string; message: string };

const shipNames = new Set(master.ships.map((s) => s.name));
const equipNames = new Set(master.equips.map((e) => e.name));

/** description に「常に空欄」と書かれている列は、数値比較で 0 として扱われる。 */
function isAlwaysEmpty(col: Column): boolean {
  return col.description?.includes("常に空欄") ?? false;
}

/** 値が未入力かどうか。UIで空のまま放置された条件を検出するために使う。 */
export function isEmptyValueCond(cond: ValueCond): boolean {
  switch (cond.kind) {
    case "eq":
      return cond.values.length === 0;
    case "contains":
    case "regex":
      return cond.values.every((v) => v.trim() === "");
    case "cmp":
      return false;
    case "group":
      return cond.children.length === 0;
  }
}

function checkValue(cond: ValueCond, col: Column, path: string, out: Warning[]): void {
  switch (cond.kind) {
    case "eq": {
      for (const v of cond.values) {
        if (col.enum !== undefined && !col.enum.includes(String(v))) {
          out.push({
            code: "enum",
            path,
            message: `${col.name} に ${String(v)} という値はありません`,
          });
        }
        if (col.type === "integer" && typeof v === "number" && !Number.isInteger(v)) {
          out.push({ code: "integer", path, message: `${col.name} は整数の列です` });
        }
        if (col.pattern !== undefined && !new RegExp(col.pattern).test(String(v))) {
          out.push({
            code: "pattern",
            path,
            message: `${col.name} は ${col.pattern} の形式である必要があります`,
          });
        }
        const target = nameTargetOf(col.name);
        if (target?.kind === "ship" && !shipNames.has(String(v))) {
          out.push({
            code: "unknown-name",
            path,
            message: `${String(v)} はマスタに存在しない艦名です`,
          });
        }
        if (target?.kind === "equip" && !equipNames.has(String(v))) {
          out.push({
            code: "unknown-name",
            path,
            message: `${String(v)} はマスタに存在しない装備名です`,
          });
        }
      }
      return;
    }
    case "regex":
      out.push({
        code: "regex-full-match",
        path,
        message: `正規表現は完全一致です。部分一致させるには .* で挟んでください`,
      });
      return;
    case "cmp":
      if (isAlwaysEmpty(col)) {
        out.push({
          code: "empty-numeric",
          path,
          message: `${col.name} は常に空欄の列です。空欄は数値比較で 0 として扱われるため、意図しない行が通る可能性があります`,
        });
      }
      return;
    case "contains":
      return;
    case "group":
      for (const c of cond.children) checkValue(c, col, path, out);
      return;
  }
}

function checkOutput(
  node: OutputNode,
  columns: Map<string, Column>,
  path: string,
  out: Warning[],
): void {
  switch (node.kind) {
    case "column": {
      const col = columns.get(node.column);
      if (col === undefined) {
        out.push({
          code: "unknown-column",
          path,
          message: `列 ${node.column} は選択中の戦闘種別に存在しません`,
        });
        return;
      }
      checkValue(node.cond, col, `${path}.${node.column}`, out);
      return;
    }
    case "group":
      node.children.forEach((c, i) => checkOutput(c, columns, `${path}[${i}]`, out));
      return;
    case "slot":
    case "displayItem":
      // 展開後を検査するのでここには来ない
      return;
  }
}

/** 展開前の木を対象に、空のグループ・空の値を検出する。 */
function checkOutputEmpty(node: OutputNode, path: string, out: Warning[]): void {
  switch (node.kind) {
    case "column":
      if (isEmptyValueCond(node.cond)) {
        out.push({
          code: "empty-value",
          path: `${path}.${node.column}`,
          message: `${node.column} の条件に値が入力されていません`,
        });
      }
      return;
    case "slot":
      if (node.attrs.length === 0) {
        out.push({
          code: "empty-group",
          path,
          message: "装備スロット条件に属性が設定されていません",
        });
        return;
      }
      node.attrs.forEach((a) => {
        if (isEmptyValueCond(a.cond)) {
          out.push({
            code: "empty-value",
            path: `${path}.${a.attr}`,
            message: `${a.attr} の条件に値が入力されていません`,
          });
        }
      });
      return;
    case "group":
      if (node.children.length === 0) {
        out.push({
          code: "empty-group",
          path,
          message: "空のグループです。条件を追加するか削除してください",
        });
        return;
      }
      node.children.forEach((c, i) => checkOutputEmpty(c, `${path}[${i}]`, out));
      return;
    case "displayItem":
      if (isEmptyValueCond(node.cond)) {
        out.push({
          code: "empty-value",
          path: `${path}.表示装備`,
          message: "表示装備条件に値が入力されていません",
        });
      }
      return;
  }
}

function checkItemCondEmpty(cond: ItemCond, path: string, out: Warning[]): void {
  switch (cond.kind) {
    case "exists":
      return;
    case "attr":
      if (isEmptyValueCond(cond.cond)) {
        out.push({
          code: "empty-value",
          path: `${path}.${cond.attr}`,
          message: `${cond.attr} の条件に値が入力されていません`,
        });
      }
      return;
    case "group":
      if (cond.children.length === 0) {
        out.push({
          code: "empty-group",
          path,
          message: "空のグループです。条件を追加するか削除してください",
        });
        return;
      }
      cond.children.forEach((c, i) => checkItemCondEmpty(c, `${path}[${i}]`, out));
      return;
  }
}

function checkCountItemEmpty(node: CountItemNode, path: string, out: Warning[]): void {
  switch (node.kind) {
    case "count":
      if (isEmptyValueCond(node.count)) {
        out.push({
          code: "empty-value",
          path: `${path}.装備数`,
          message: "装備数の条件に値が入力されていません",
        });
      }
      checkItemCondEmpty(node.cond, `${path}.条件`, out);
      return;
    case "group":
      if (node.children.length === 0) {
        out.push({
          code: "empty-group",
          path,
          message: "空のグループです。条件を追加するか削除してください",
        });
        return;
      }
      node.children.forEach((c, i) => checkCountItemEmpty(c, `${path}[${i}]`, out));
      return;
  }
}

/** クエリ全体を検査して警告を集める。組み立てを止めはせず、画面に並べるだけ。 */
export function validateQuery(q: Query, columns: Column[]): Warning[] {
  const out: Warning[] = [];
  const map = new Map(columns.map((c) => [c.name, c]));
  if (q.output !== null) {
    checkOutput(expandOutput(q.output), map, "$.出力", out);
    checkOutputEmpty(q.output, "$.出力", out);
  }
  if (q.attackerItems !== null) checkCountItemEmpty(q.attackerItems, "$.攻撃艦装備", out);
  if (q.defenderItems !== null) checkCountItemEmpty(q.defenderItems, "$.防御艦装備", out);
  return out;
}
