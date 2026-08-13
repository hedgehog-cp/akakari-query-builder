/** items[fromIndex] を toIndex の位置に移動した新しい配列を返す。元の配列は変更しない。 */
export function reorder<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const copy = [...items];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}
