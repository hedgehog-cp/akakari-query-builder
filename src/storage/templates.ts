import type { Battle, Query } from "../model/types";

const KEY = "akakari-query-builder:templates";

export type Template = { name: string; battle: Battle; query: Query; savedAt: string };

function readAll(): Template[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Template[]) : [];
  } catch {
    return [];
  }
}

function writeAll(templates: Template[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(templates));
  } catch {
    // 無視
  }
}

export function listTemplates(): Template[] {
  return readAll();
}

/** 同名があれば上書きする。 */
export function saveTemplate(name: string, battle: Battle, query: Query): Template[] {
  const rest = readAll().filter((t) => t.name !== name);
  const next = [...rest, { name, battle, query, savedAt: new Date().toISOString() }];
  writeAll(next);
  return next;
}

export function deleteTemplate(name: string): Template[] {
  const next = readAll().filter((t) => t.name !== name);
  writeAll(next);
  return next;
}

/**
 * 同名(自分自身への改名を除く)が既にあれば何もせず現在の一覧を返す。
 * saveTemplate の「同名は上書き」とは異なり、改名先の衝突は誤操作の可能性が
 * 高いため無言の上書きはしない。
 */
export function renameTemplate(oldName: string, newName: string): Template[] {
  const all = readAll();
  if (newName === oldName) return all;
  if (all.some((t) => t.name === newName)) return all;
  const next = all.map((t) => (t.name === oldName ? { ...t, name: newName } : t));
  writeAll(next);
  return next;
}
