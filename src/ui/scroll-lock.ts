import { useEffect } from "preact/hooks";

/**
 * 掛かっている錠の数。モーダルの上にモーダルが出ても、最後の1枚が閉じるまで
 * 固定を解かないようにするため、個数で数える。
 */
let locks = 0;
/** 錠を掛ける前の body の値。最後の1枚が閉じたときに書き戻す。 */
let saved = { overflow: "", paddingRight: "" };

/**
 * モーダルが出ている間、背面のページのスクロールを止める。
 * active が false の間は何もしない(開いているときだけ呼び出す代わりに使える)。
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    if (locks === 0) {
      // スクロールバーが消えるぶん本文が右に広がって、開いた瞬間に画面が
      // 横にずれる。消えた幅と同じ余白を足して位置を保つ。
      const gap = window.innerWidth - document.documentElement.clientWidth;
      saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
      body.style.overflow = "hidden";
      if (gap > 0) body.style.paddingRight = `${gap}px`;
    }
    locks++;
    return () => {
      locks--;
      if (locks === 0) {
        body.style.overflow = saved.overflow;
        body.style.paddingRight = saved.paddingRight;
      }
    };
  }, [active]);
}
