import type { Battle, Query } from "../model/types";

const KEY = "akakari-query-builder:draft";

export type Draft = { battle: Battle; query: Query };

export function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // プライベートブラウズ等で localStorage が使えない場合は諦める
  }
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 無視
  }
}
