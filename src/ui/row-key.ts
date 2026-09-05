/** 行のキーを配る道具。型ごとに1つ作って使う。 */
export type RowKeyer<T extends object> = {
  /** その要素のキー。初めて見る要素には新しい番号を配る。 */
  keyOf: (item: T) => number;
  /** 編集で作り替わった要素へ、元の要素のキーを引き継ぐ。 */
  inherit: (prev: T, next: T) => void;
};

/**
 * 要素の同一性を、参照ごとの番号として保つ。
 *
 * 並べ替えは配列の中で要素を入れ替えるだけで参照を変えないので、番号も変わらない。
 * D&D の DOM 操作と再描画がずれて見た目が更新されない、という事故を防げる。
 *
 * 一方、値の編集は新しいオブジェクトを作るため、そのままでは番号が変わり、行ごと
 * 作り直されて入力中の焦点が外れる。作り替えの直前に inherit で番号を渡しておく。
 */
export function rowKeyer<T extends object>(): RowKeyer<T> {
  const keys = new WeakMap<T, number>();
  let next = 0;
  return {
    keyOf: (item) => {
      let key = keys.get(item);
      if (key === undefined) {
        key = next++;
        keys.set(item, key);
      }
      return key;
    },
    inherit: (prev, item) => {
      const key = keys.get(prev);
      if (key !== undefined) keys.set(item, key);
    },
  };
}
