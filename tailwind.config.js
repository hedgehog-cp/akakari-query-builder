/**
 * 以前は index.html で cdn.tailwindcss.com (Play CDN) を読み、この設定を
 * インラインの <script> で渡していた。Play CDN はブラウザ上で DOM の変更を
 * 監視して毎回スタイルを作り直すため、プレビュー表(200行×155列=3万セル)を
 * 表示している状態では、クラスを1つ書き換えるだけで数百ミリ秒かかっていた。
 * そのためビルド時にCSSを生成する構成へ移した。色の定義は当時のままで、
 * 姉妹サイト(../falsification-search)と同じ値。
 *
 * @type {import("tailwindcss").Config}
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-main": "#F8FAF8",
        "bg-panel": "#FFFFFF",
        "emp-1": "#B4A7D6",
        "emp-2": "#B7E1CD",
        "emp-3": "#FFD966",
        "emp-4": "#FFF2CC",
      },
    },
  },
};
