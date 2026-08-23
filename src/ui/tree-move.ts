import { reorder } from "./reorder";

/**
 * グループの子リストの位置。ルートの子リストは []、ルートの i 番目の子(グループ)の
 * 子リストは [i]、そのさらに j 番目の子の子リストは [i, j]。
 */
export type TreePath = number[];

/** 木の形だけを外から与える。グループ以外のノードは childrenOf が null を返す。 */
export type TreeAdapter<T> = {
  childrenOf: (node: T) => T[] | null;
  withChildren: (node: T, children: T[]) => T;
};

/** path が示す子リストを差し替える。途中がグループでなければ null。 */
function updateList<T>(
  node: T,
  path: TreePath,
  f: (list: T[]) => T[],
  a: TreeAdapter<T>,
): T | null {
  const children = a.childrenOf(node);
  if (children === null) return null;
  if (path.length === 0) return a.withChildren(node, f(children));
  const child = children[path[0]];
  if (child === undefined) return null;
  const next = updateList(child, path.slice(1), f, a);
  if (next === null) return null;
  const list = [...children];
  list[path[0]] = next;
  return a.withChildren(node, list);
}

/** path が示す子リストを取り出す。無ければ null。 */
export function listAt<T>(root: T, path: TreePath, a: TreeAdapter<T>): T[] | null {
  let node: T = root;
  for (const i of path) {
    const children = a.childrenOf(node);
    const child = children?.[i];
    if (child === undefined) return null;
    node = child;
  }
  return a.childrenOf(node);
}

/** b が a で始まるか(a === b も含む)。 */
function startsWith(b: TreePath, a: TreePath): boolean {
  return a.length <= b.length && a.every((v, i) => v === b[i]);
}

/**
 * from の fromIndex 番目を、to の toIndex 番目へ動かした木を返す。
 *
 * 動かせない組み合わせ(自分自身の中への移動、存在しない位置)では root をそのまま返す。
 * 移動元を先に抜くので、移動先の位置が移動元と同じリストにぶら下がっている場合は
 * 添字が1つ手前にずれる。その分をここで補正する。
 */
export function moveNode<T>(
  root: T,
  from: TreePath,
  fromIndex: number,
  to: TreePath,
  toIndex: number,
  a: TreeAdapter<T>,
): T {
  const src = listAt(root, from, a);
  if (src === null || src[fromIndex] === undefined) return root;
  const moved = src[fromIndex];
  // 動かす当人の中(またはそれ自身のリスト)へは落とせない。
  if (startsWith(to, [...from, fromIndex])) return root;
  if (listAt(root, to, a) === null) return root;

  if (from.length === to.length && startsWith(to, from)) {
    return updateList(root, from, (list) => reorder(list, fromIndex, toIndex), a) ?? root;
  }

  const removed = updateList(root, from, (list) => list.filter((_, i) => i !== fromIndex), a);
  if (removed === null) return root;
  const target =
    startsWith(to, from) && to[from.length] > fromIndex
      ? to.map((v, i) => (i === from.length ? v - 1 : v))
      : to;
  const inserted = updateList(
    removed,
    target,
    (list) => {
      const next = [...list];
      next.splice(Math.min(toIndex, next.length), 0, moved);
      return next;
    },
    a,
  );
  return inserted ?? root;
}
