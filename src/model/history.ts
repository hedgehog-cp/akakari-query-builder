/** 取り消し・やり直しのための履歴。present が今の値。 */
export type History<T> = { past: T[]; present: T; future: T[] };

/** 覚えておく取り消し回数の上限。古いものから捨てる。 */
const MAX_PAST = 100;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * 新しい値を積む。coalesce が真なら履歴を増やさず今の値だけ差し替える。
 * 文字入力のような細かい変更で履歴が1文字ずつ埋まるのを防ぐために使う。
 */
export function pushHistory<T>(h: History<T>, next: T, coalesce = false): History<T> {
  if (next === h.present) return h;
  if (coalesce) return { past: h.past, present: next, future: [] };
  const past = [...h.past, h.present];
  return { past: past.slice(Math.max(0, past.length - MAX_PAST)), present: next, future: [] };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}

export function undoHistory<T>(h: History<T>): History<T> {
  if (!canUndo(h)) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
  };
}

export function redoHistory<T>(h: History<T>): History<T> {
  if (!canRedo(h)) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
