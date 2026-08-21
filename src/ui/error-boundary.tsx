import { Component, type ComponentChildren } from "preact";
import { clearDraft } from "../storage/draft";

type Props = { children: ComponentChildren };
type State = { error: Error | null };

/** 描画中の例外を受け止め、白い画面の代わりに立て直す手段を出す。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(): void {
    // 原因を特定できない描画エラー(壊れた下書きの復元など)でアプリ全体が
    // 固まったままにならないよう、次回起動時に同じ下書きで再発しないよう破棄する。
    clearDraft();
  }

  render() {
    if (this.state.error !== null) {
      return (
        <div class="max-w-lg mx-auto mt-10 p-4 border border-red-400 bg-red-50 rounded text-sm">
          <p class="text-red-700 font-bold mb-2">表示中にエラーが発生しました。</p>
          <p class="mb-2">保存されていた下書きを破棄しました。ページを再読み込みしてください。</p>
          <button
            type="button"
            class="border border-red-400 rounded px-2 py-0.5"
            onClick={() => location.reload()}
          >
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
