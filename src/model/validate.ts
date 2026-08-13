import type { OutputNode, Query, ValueCond } from "./types";
import { expandOutput } from "./expand";
import type { Column } from "../schema/catalog";
import { master } from "../master/load";
import { nameTargetOf } from "../ui/name-target";

export type WarningCode =
  | "enum" | "integer" | "pattern" | "empty-numeric"
  | "regex-full-match" | "unknown-column" | "unknown-name";

export type Warning = { code: WarningCode; path: string; message: string };

const shipNames = new Set(master.ships.map((s) => s.name));
const equipNames = new Set(master.equips.map((e) => e.name));

/** description に「常に空欄」と書かれている列は、数値比較で 0 として扱われる。 */
function isAlwaysEmpty(col: Column): boolean {
  return col.description?.includes("常に空欄") ?? false;
}

function checkValue(
  cond: ValueCond, col: Column, path: string, out: Warning[],
): void {
  switch (cond.kind) {
    case "eq": {
      for (const v of cond.values) {
        if (col.enum !== undefined && !col.enum.includes(String(v))) {
          out.push({ code: "enum", path, message: `${col.name} に ${String(v)} という値はありません` });
        }
        if (col.type === "integer" && typeof v === "number" && !Number.isInteger(v)) {
          out.push({ code: "integer", path, message: `${col.name} は整数の列です` });
        }
        if (col.pattern !== undefined && !new RegExp(col.pattern).test(String(v))) {
          out.push({ code: "pattern", path, message: `${col.name} は ${col.pattern} の形式である必要があります` });
        }
        const target = nameTargetOf(col.name);
        if (target?.kind === "ship" && !shipNames.has(String(v))) {
          out.push({ code: "unknown-name", path, message: `${String(v)} はマスタに存在しない艦名です` });
        }
        if (target?.kind === "equip" && !equipNames.has(String(v))) {
          out.push({ code: "unknown-name", path, message: `${String(v)} はマスタに存在しない装備名です` });
        }
      }
      return;
    }
    case "regex":
      out.push({
        code: "regex-full-match", path,
        message: `正規表現は完全一致です。部分一致させるには .* で挟んでください`,
      });
      return;
    case "cmp":
      if (isAlwaysEmpty(col)) {
        out.push({
          code: "empty-numeric", path,
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
  node: OutputNode, columns: Map<string, Column>, path: string, out: Warning[],
): void {
  switch (node.kind) {
    case "column": {
      const col = columns.get(node.column);
      if (col === undefined) {
        out.push({
          code: "unknown-column", path,
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
      // 展開後を検査するのでここには来ない
      return;
  }
}

export function validateQuery(q: Query, columns: Column[]): Warning[] {
  const out: Warning[] = [];
  const map = new Map(columns.map((c) => [c.name, c]));
  if (q.output !== null) {
    checkOutput(expandOutput(q.output), map, "$.出力", out);
  }
  return out;
}
