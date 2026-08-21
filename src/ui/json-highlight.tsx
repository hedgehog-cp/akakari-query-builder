import Prism from "prismjs";
import "prismjs/components/prism-json";
import type { ComponentChildren } from "preact";

type Tok = string | Prism.Token;

const TOKEN_COLOR: Record<string, string> = {
  property: "text-[#9cdcfe]",
  string: "text-[#ce9178]",
  number: "text-[#b5cea8]",
  punctuation: "text-[#d4d4d4]",
  operator: "text-[#d4d4d4]",
  boolean: "text-[#569cd6]",
  null: "text-[#569cd6]",
  keyword: "text-[#569cd6]",
};

function renderTokens(tokens: Tok[], keyPrefix: string): ComponentChildren {
  return tokens.map((t, i) => {
    const key = `${keyPrefix}-${i}`;
    if (typeof t === "string") return t;
    const cls = TOKEN_COLOR[t.type] ?? "text-gray-300";
    const content = t.content;
    if (typeof content === "string") {
      return (
        <span key={key} class={cls}>
          {content}
        </span>
      );
    }
    const children = Array.isArray(content) ? content : [content];
    return (
      <span key={key} class={cls}>
        {renderTokens(children, key)}
      </span>
    );
  });
}

/**
 * text は常に有効な pretty-printed JSON(serializeQueryの出力)。
 * Prism.highlight() のHTML文字列版は dangerouslySetInnerHTML が必要になるため使わず、
 * tokenize() のトークン木を自前でJSXに変換する。
 */
export function JsonHighlight(props: { text: string }) {
  const tokens = Prism.tokenize(props.text, Prism.languages.json);
  return <>{renderTokens(tokens, "t")}</>;
}
