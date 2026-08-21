import type { Battle, Query } from "../model/types";

const KEY = "akakari-query-builder:draft";

/** 前回の続きとして復元する内容。 */
export type Draft = { battle: Battle; query: Query };

/** 下書きを保存する。保存できない環境では黙って諦める。 */
export function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // プライベートブラウズ等で localStorage が使えない場合は諦める
  }
}

/** 保存済みの下書き。無いか壊れていれば null。 */
export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

/** 下書きを消す。 */
export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 無視
  }
}
