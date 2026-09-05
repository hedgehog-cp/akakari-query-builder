/** canvas に渡す字の指定。font 一括の値を返さないブラウザのために組み立て直す。 */
export function fontOf(el: Element): string {
  const style = getComputedStyle(el);
  if (style.font !== "") return style.font;
  return `${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`;
}

/** 升目の左右の余白(px-1 の2つぶん)。測った字幅にこれを足して列の幅にする。 */
const CELL_PADDING = 9;

/** 幅を測るためだけの canvas。作り直さずに使い回す。 */
let ruler: CanvasRenderingContext2D | null = null;

/** 全角は2文字ぶんとして数える。どの値が一番長いかの当たりを付けるのに使う。 */
export function weightedLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) n += s.charCodeAt(i) < 0x80 ? 1 : 2;
  return n;
}

/** 列ごとに、一番長く見える値。字幅を測る回数を列の数まで減らすために選ぶ。 */
export function longestPerColumn(columns: number, rows: string[][]): string[] {
  const longest: string[] = new Array(columns).fill("");
  const lengths: number[] = new Array(columns).fill(-1);
  for (const row of rows) {
    for (let j = 0; j < row.length && j < columns; j++) {
      const n = weightedLength(row[j]);
      if (n > lengths[j]) {
        lengths[j] = n;
        longest[j] = row[j];
      }
    }
  }
  return longest;
}

/**
 * 列ごとの幅(px)を決める。
 *
 * 幅を決めずに表を描くと、ブラウザは列の幅を決めるために升目を全部測る。1ページは
 * 200行×百数十列あるので、これがページを繰るたびの待ち時間になる。こちらで幅を
 * 決めて table-layout: fixed にすれば、その測り直しが無くなる。
 *
 * 幅は表に出しうる行(先頭1万行)から取るので、表示中に字が切れることはない。
 * 列ごとに一番長い値だけを実際の字幅で測る(全部測ると数百万回になる)。
 */
export function measureColumns(
  header: string[],
  rows: string[][],
  head: string,
  body: string,
): number[] {
  if (ruler === null) ruler = document.createElement("canvas").getContext("2d");
  const ctx = ruler;
  if (ctx === null) return [];

  const longest = longestPerColumn(header.length, rows);

  ctx.font = head;
  const widths = header.map((name) => ctx.measureText(name).width);
  ctx.font = body;
  return widths.map((w, j) =>
    Math.ceil(
      Math.max(w, longest[j] === "" ? 0 : ctx.measureText(longest[j]).width) + CELL_PADDING,
    ),
  );
}
