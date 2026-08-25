import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

/**
 * 開閉のしるし。開いていれば下、畳んでいれば右を向く。
 *
 * 上下と左右で別の字を使うと、字ごとに肉付きや字幅が違うので大きさが揃って見えない。
 * 同じ字を回して向きだけ変え、幅も決め打って、開閉で位置と大きさが動かないようにする。
 */
export function Caret(props: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      class={`inline-block w-3 text-center leading-none transition-transform ${
        props.open ? "rotate-90" : ""
      }`}
    >
      ▶
    </span>
  );
}

/** セクションの開閉見出し。 */
export function SectionToggle(props: {
  open: boolean;
  onToggle: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      class="flex items-center gap-2 text-left"
      aria-expanded={props.open}
      onClick={props.onToggle}
    >
      <span class="text-xs text-gray-500">
        <Caret open={props.open} />
      </span>
      {props.children}
    </button>
  );
}

/**
 * 見出しのクリックで中身を開閉する枠。
 *
 * 開閉状態をこのコンポーネントの中に閉じ込めているのは速度のため。呼び出し側
 * (App)が状態を持つと、開閉のたびに App 以下すべて — プレビュー表の数万セルを
 * 含む — が再描画の対象になる。ここで持てば再描画はこの枠だけで済み、中身
 * (props.children)は前回と同じ vnode なので Preact が差分計算を丸ごと省く。
 *
 * 中身はアンマウントせず .collapsed(content-visibility)で隠すだけ。畳んでも
 * プレビューの走査結果や入力途中の状態を失わせないため。
 */
export function CollapsibleSection(props: {
  title: string;
  /** 枠(section)に足すクラス */
  class?: string;
  /** 展開時の本体に足すクラス */
  bodyClass?: string;
  children: ComponentChildren;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section class={`grid gap-2 ${props.class ?? ""}`}>
      <SectionToggle open={open} onToggle={() => setOpen(!open)}>
        <h2 class="font-bold text-purple-900">{props.title}</h2>
      </SectionToggle>
      <div class={`${props.bodyClass ?? ""} ${open ? "" : "collapsed"}`}>{props.children}</div>
    </section>
  );
}
