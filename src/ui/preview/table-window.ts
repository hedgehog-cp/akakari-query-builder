/**
 * 表の1行の高さ(px)。行の位置を数で出せるように決め打ちにする。
 * 中身は1行の字なので、この高さで収まる。
 */
export const ROW_HEIGHT = 20;

/**
 * 画面の外にも作っておく行数と列数。少しはみ出して持っておくと、
 * 送るたびに作り直さずに済む。
 */
const ROW_MARGIN = 10;
const COL_MARGIN = 4;

/** 見えている量。要素そのものではなく数だけを受け取る。 */
export type Viewport = {
  scrollTop: number;
  clientHeight: number;
  scrollLeft: number;
  clientWidth: number;
};

export type Window = { rowFirst: number; rowLast: number; colFirst: number; colLast: number };

export function sameWindow(a: Window, b: Window): boolean {
  return (
    a.rowFirst === b.rowFirst &&
    a.rowLast === b.rowLast &&
    a.colFirst === b.colFirst &&
    a.colLast === b.colLast
  );
}

/**
 * 見えている範囲から、作る行と列を決める。
 *
 * 1ページは200行×百数十列で、素直に作ると升目が3万を超える。作る数がそのまま
 * ページを繰る待ち時間になるので、画面に入る分(と少しの余分)だけを作る。
 * 残りは、間を空ける升目1つで場所だけ取っておく。
 */
export function windowOf(view: Viewport, offsets: number[], rowCount: number): Window {
  const rowFirst = Math.max(0, Math.floor(view.scrollTop / ROW_HEIGHT) - ROW_MARGIN);
  const rowLast = Math.min(
    rowCount - 1,
    Math.ceil((view.scrollTop + view.clientHeight) / ROW_HEIGHT) + ROW_MARGIN,
  );
  const left = view.scrollLeft;
  const right = left + view.clientWidth;
  // 左端の列は貼り付けてあるので、探すのは2列目から。
  let colFirst = offsets.length - 1;
  let colLast = 1;
  for (let j = 1; j < offsets.length - 1; j++) {
    if (offsets[j + 1] > left && offsets[j] < right) {
      if (j < colFirst) colFirst = j;
      if (j > colLast) colLast = j;
    }
  }
  return {
    rowFirst,
    rowLast,
    colFirst: Math.max(1, colFirst - COL_MARGIN),
    colLast: Math.min(offsets.length - 2, colLast + COL_MARGIN),
  };
}
