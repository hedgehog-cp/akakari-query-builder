import { useEffect, useRef } from "preact/hooks";
import { Annotation, EditorState } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { tags } from "@lezer/highlight";
import type { Column } from "../model/column";
import { completionRangeAt } from "./json-complete";

/** ツリーUIからの差し替えに付ける印。利用者の打鍵と区別するために使う。 */
const External = Annotation.define<boolean>();

/** 配色。VS Code の Dark+ に寄せてある。 */
const COLORS = {
  bg: "#1e1e1e",
  fg: "#d4d4d4",
  caret: "#d4d4d4",
  selection: "#264f78",
  property: "#9cdcfe",
  string: "#ce9178",
  number: "#b5cea8",
  keyword: "#569cd6",
  active: "#ffffff0d",
};

const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: COLORS.property },
  { tag: tags.string, color: COLORS.string },
  { tag: tags.number, color: COLORS.number },
  { tag: [tags.bool, tags.null], color: COLORS.keyword },
  { tag: [tags.brace, tags.squareBracket, tags.separator], color: COLORS.fg },
]);

const theme = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: COLORS.bg, color: COLORS.fg, fontSize: "0.75rem" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      lineHeight: "1.35",
    },
    ".cm-content": { padding: "0.5rem 0" },
    ".cm-line": { padding: "0 0.5rem" },
    ".cm-cursor": { borderLeftColor: COLORS.caret },
    ".cm-activeLine": { backgroundColor: COLORS.active },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: COLORS.selection,
    },
    ".cm-tooltip": { border: "none" },
    // 補完の一覧は画面のほかの浮きもの(モーダルなど)と同じ見た目に寄せる
    ".cm-tooltip-autocomplete > ul > li": { padding: "1px 6px" },
    ".cm-completionDetail": { marginLeft: "1rem", color: "#9a9a9a", fontStyle: "normal" },
  },
  { dark: true },
);

/**
 * クエリの JSON を編集する枠。
 *
 * 構文強調・括弧の組・自動インデント・撤回は CodeMirror に任せ、
 * どんな候補を出すかだけをこちらで決める。
 */
export function JsonEditor(props: {
  value: string;
  columns: Column[];
  onChange: (text: string) => void;
  onFocusChange: (focused: boolean) => void;
  class?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // 拡張は組み立て時の値を捕まえるので、最新の props を参照で渡す。
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const complete = (ctx: CompletionContext): CompletionResult | null => {
      const range = completionRangeAt(ctx.state.doc.toString(), ctx.pos, latest.current.columns);
      // 並び順と絞り込みはこちらで決め済みなので、CodeMirror 側では触らせない
      return range === null ? null : { ...range, filter: false };
    };

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: props.value,
        extensions: [
          json(),
          history(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          drawSelection(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          syntaxHighlighting(highlight),
          theme,
          autocompletion({ override: [complete], icons: false }),
          keymap.of([
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...historyKeymap,
            ...defaultKeymap,
            indentWithTab,
          ]),
          // ファイルを落とされたときは中身を文字として差し込まない。外側の枠が
          // 読み込みとして受け取るので、ここで受けてしまうと二重になる。
          EditorView.domEventHandlers({
            drop: (event) => (event.dataTransfer?.files.length ?? 0) > 0,
          }),
          EditorView.updateListener.of((u) => {
            // 差し替えを編集として返すと、書きかけの条件まで JSON を経由して
            // 往復してしまい、値の無い条件が消える。
            const external = u.transactions.some((t) => t.annotation(External) === true);
            if (u.docChanged && !external) latest.current.onChange(u.state.doc.toString());
            if (u.focusChanged) latest.current.onFocusChange(u.view.hasFocus);
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // 編集中は入れ替えない。カーソルが飛ぶため。
  useEffect(() => {
    const view = viewRef.current;
    if (view === null || view.hasFocus) return;
    const current = view.state.doc.toString();
    if (current === props.value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: props.value },
      annotations: External.of(true),
    });
  }, [props.value]);

  return <div ref={hostRef} class={props.class} />;
}
