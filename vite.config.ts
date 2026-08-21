import { defineConfig, type Plugin } from "vitest/config";
import preact from "@preact/preset-vite";

/**
 * 配信する HTML に Content-Security-Policy を埋め込む。
 *
 * GitHub Pages は応答ヘッダを足せないので meta で入れるしかない。そのため
 * `frame-ancestors` は指定できない(meta では無視される)= クリックジャッキング
 * 対策は取れない。認証も投稿機能も無いページなのでそれは許容する。
 *
 * 開発サーバには入れない。Vite の HMR はインラインスクリプトと WebSocket を使い、
 * さらに開発中は列カタログの取得が別オリジン(localhost → hedgehog-cp.github.io)に
 * なるため、同じポリシーだと黙って同梱フォールバックに落ちて気づけない。
 *
 * connect-src には列カタログの配信元を明示する。本番では akakari-schema が
 * このサイトと同一オリジンなので 'self' でも足りるが、書いておかないと
 * ローカルの動作確認やフォークからの配信で黙って同梱フォールバックに落ちる
 * (取得先が404になったのに気づけなかったことが実際にある)。
 * src/schema/fetch.ts の BASE と食い違っていないかは src/security.test.ts が見る。
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  // プログレスバーの幅や pre の追従で style 属性を使うため 'unsafe-inline' が要る
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' https://hedgehog-cp.github.io",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function cspPlugin(): Plugin {
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      // charset の直後に置く(charset は先頭 1024 バイト以内に置く決まりがあるため、
      // その前に長い meta を差し込まない)。
      const charset = '<meta charset="UTF-8" />';
      return html.replace(
        charset,
        `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  root: import.meta.dirname,
  plugins: [preact(), cspPlugin()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
