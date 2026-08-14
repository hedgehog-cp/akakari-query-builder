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
