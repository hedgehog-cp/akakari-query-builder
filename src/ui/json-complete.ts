import type { Column } from "../schema/catalog";
import { BATTLE_KEY, ITEM_ATTRS } from "../model/types";
import { master } from "../master/load";
import { nameTargetOf } from "../model/name-target";
import { suggestNames } from "./name-suggest";

/** 補完の候補1件。text は文字列の中身として入れる値。 */
export type Completion = { text: string; label: string; sub: string };

/** カーソルが乗っている文字列と、それが JSON のどこにあるか。 */
export type Spot = {
  /** 引用符の内側の範囲。 */
  token: { start: number; end: number; text: string };
  role: "key" | "value";
  /** 根から順に、囲んでいるオブジェクトのキー。配列は飛ばす。 */
  path: string[];
};

/** 候補の最大件数。 */
export const COMPLETE_LIMIT = 12;

/** 列や属性の値に付けられる予約語。列名や属性名を探すときは読み飛ばす。 */
const COND_KEYS = [
  "含む",
  "正規表現",
  "以上",
  "より大きい",
  "以下",
  "より小さい",
  "AND",
  "OR",
  "NOT",
];

const OPERATORS = new Set<string>(COND_KEYS);

const ROOT_KEYS = ["種別", "日時", "出力", "攻撃艦装備", "防御艦装備"];

type Frame = { kind: "obj" | "arr"; key: string | null; expectKey: boolean };

/**
 * 書きかけの JSON を頭から舐めて、カーソルの居場所を求める。
 *
 * JSON.parse は途中まで書いた文字列を読めないので、括弧と引用符だけを数える。
 * 値の中身までは見ないので、多少壊れていても最後まで進む。
 */
export function spotAt(text: string, caret: number): Spot | null {
  const stack: Frame[] = [];
  const top = () => (stack.length === 0 ? null : stack[stack.length - 1]);
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      const open = i;
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\") i++;
        i++;
      }
      const end = Math.min(i, text.length);
      const inner = text.slice(open + 1, end);
      const frame = top();
      const isKey = frame?.kind === "obj" && frame.expectKey;
      if (caret > open && caret <= end) {
        return {
          token: { start: open + 1, end, text: inner },
          role: isKey ? "key" : "value",
          path: stack.map((f) => f.key).filter((k): k is string => k !== null),
        };
      }
      if (isKey && frame !== null) frame.key = inner;
      i = end + 1;
      continue;
    }
    if (ch === "{") stack.push({ kind: "obj", key: null, expectKey: true });
    else if (ch === "[") stack.push({ kind: "arr", key: null, expectKey: false });
    else if (ch === "}" || ch === "]") stack.pop();
    else if (ch === ":") {
      const frame = top();
      if (frame !== null) frame.expectKey = false;
    } else if (ch === ",") {
      const frame = top();
      if (frame !== null) frame.expectKey = frame.kind === "obj";
    }
    i++;
  }
  return null;
}

/** 予約語を除いた、直近の列名または属性名。 */
function subjectOf(path: string[]): string | null {
  for (let i = path.length - 1; i >= 0; i--) {
    if (!OPERATORS.has(path[i])) return path[i];
  }
  return null;
}

/** 打ちかけの文字に当てはまるものだけを、前方一致を上にして返す。 */
function rankFilter(list: Completion[], q: string): Completion[] {
  if (q === "") return list;
  const hit = list
    .map((c) => ({
      c,
      r: c.text === q ? 0 : c.text.startsWith(q) ? 1 : c.text.includes(q) ? 2 : -1,
    }))
    .filter((x) => x.r >= 0);
  hit.sort((a, b) => a.r - b.r || a.c.text.length - b.c.text.length);
  return hit.map((x) => x.c);
}

const plain = (names: readonly string[]): Completion[] =>
  names.map((n) => ({ text: n, label: n, sub: "" }));

/** キーの位置で出す候補。囲んでいるキーによって出せるものが変わる。 */
function keyCompletions(path: string[], columns: Column[]): Completion[] {
  if (path.length === 0) return plain(ROOT_KEYS);
  const parent = path[path.length - 1];
  if (parent === "日時") return plain(["開始", "終了"]);

  const subject = subjectOf(path);

  if (
    subject !== null &&
    (columns.some((c) => c.name === subject) || (ITEM_ATTRS as string[]).includes(subject))
  ) {
    return plain(COND_KEYS);
  }

  // 装備の節。装備数と条件は対で書く決まりなので、外側では両方を出す。
  if (path[0] === "攻撃艦装備" || path[0] === "防御艦装備") {
    return plain(
      path.includes("条件")
        ? [...ITEM_ATTRS, "AND", "OR", "NOT"]
        : ["装備数", "条件", "AND", "OR", "NOT"],
    );
  }

  return [
    ...columns.map((c) => ({ text: c.name, label: c.name, sub: c.title ?? "" })),
    ...plain(["AND", "OR", "NOT"]),
  ];
}

/** 値の位置で出す候補。囲んでいる列名や属性名から、名前の一覧を選ぶ。 */
function valueCompletions(path: string[], columns: Column[], q: string): Completion[] {
  const subject = subjectOf(path);
  if (subject === null) return [];
  if (subject === "種別") return rankFilter(plain(Object.values(BATTLE_KEY)), q);
  if (subject === "装備カテゴリ") return rankFilter(plain(master.equipTypes.map((t) => t.name)), q);
  const column = columns.find((c) => c.name === subject);
  if (column?.enum !== undefined) return rankFilter(plain(column.enum), q);

  const target = subject === "装備名" ? { kind: "equip" as const } : nameTargetOf(subject);
  // 艦名と装備名は数が多いので、何か打つまでは出さない
  if (target === null || q === "") return [];
  return suggestNames(target, q, COMPLETE_LIMIT).map((s) => ({
    text: String(s.value),
    label: s.label,
    sub: s.sub,
  }));
}

/** カーソルの居場所に出す候補。 */
export function completionsFor(
  spot: Spot,
  columns: Column[],
  limit = COMPLETE_LIMIT,
): Completion[] {
  const q = spot.token.text;
  const list =
    spot.role === "key"
      ? rankFilter(keyCompletions(spot.path, columns), q)
      : // 名前の候補は suggestNames が順位を付けて返すので、そのまま使う
        valueCompletions(spot.path, columns, q);
  return list.slice(0, limit);
}

/** CodeMirror の補完源が返す形。 */
export type CompletionRange = {
  from: number;
  to: number;
  options: { label: string; displayLabel: string; detail: string }[];
};

/** 文書とカーソル位置から、置き換える範囲と候補を求める。出すものが無ければ null。 */
export function completionRangeAt(
  doc: string,
  pos: number,
  columns: Column[],
): CompletionRange | null {
  const spot = spotAt(doc, pos);
  if (spot === null) return null;
  const list = completionsFor(spot, columns);
  if (list.length === 0) return null;
  return {
    from: spot.token.start,
    to: spot.token.end,
    options: list.map((c) => ({ label: c.text, displayLabel: c.label, detail: c.sub })),
  };
}
