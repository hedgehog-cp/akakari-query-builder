/**
 * 選んだ行が窓に収まるようにするための、新しいスクロール位置。
 * 上に外れていれば行の頭に、下に外れていれば行の尻に合わせる。
 */
export function keepInView(
  scrollTop: number,
  viewHeight: number,
  itemTop: number,
  itemHeight: number,
): number {
  if (itemTop < scrollTop) return itemTop;
  const bottom = itemTop + itemHeight;
  if (bottom > scrollTop + viewHeight) return bottom - viewHeight;
  return scrollTop;
}

/** 一覧そのものを繰って、選んだ行を窓の中に入れる。 */
export function scrollItemIntoView(list: HTMLElement | null, index: number): void {
  const item = list?.children[index] as HTMLElement | undefined;
  if (list === null || item === undefined) return;
  list.scrollTop = keepInView(list.scrollTop, list.clientHeight, item.offsetTop, item.offsetHeight);
}
