import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { master, equipTypeName, shipTypeName } from "../master/load";
import type { NameTarget } from "../model/name-target";
import { scrollItemIntoView } from "./list-scroll";

/** 入力中に出す候補1件。value は条件に入る実際の値。 */
export type Suggestion = { value: string | number; label: string; sub: string };

/** カンマ区切りの入力のうち、カーソルが乗っている区切りの範囲。 */
export type Segment = { start: number; end: number; text: string };

/** 候補の最大件数。多すぎると読む気が失せるので頭だけ出す。 */
export const SUGGEST_LIMIT = 12;

/** カンマ区切りのうち、カーソルが乗っている1件の範囲。候補はこの範囲だけで引く。 */
export function segmentAt(raw: string, caret: number): Segment {
  const start = raw.lastIndexOf(",", caret - 1) + 1;
  const comma = raw.indexOf(",", caret);
  const end = comma === -1 ? raw.length : comma;
  return { start, end, text: raw.slice(start, end).trim() };
}

/** 書きかけの1件だけを選んだ候補に差し替える。ほかの値には触れない。 */
export function replaceSegment(
  raw: string,
  seg: Segment,
  value: string,
): { text: string; caret: number } {
  const head = raw.slice(0, seg.start);
  const tail = raw.slice(seg.end);
  return { text: head + value + tail, caret: head.length + value.length };
}

/** 前方一致を後方一致より上に置くための順位。小さいほど上。 */
function rank(name: string, yomi: string, q: string): number {
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (yomi.startsWith(q)) return 2;
  if (name.includes(q)) return 3;
  if (yomi.includes(q)) return 4;
  return -1;
}

type Candidate = { value: string | number; label: string; sub: string; name: string; yomi: string };

/** 同じ名前が複数あるとき(深海棲艦や量産艦)は先頭の1件だけ残す。 */
function byName(list: Candidate[]): Candidate[] {
  const seen = new Map<string, Candidate>();
  for (const c of list) if (!seen.has(c.name)) seen.set(c.name, c);
  return [...seen.values()];
}

function candidates(target: NameTarget): Candidate[] {
  if (target.kind === "ship") {
    return byName(
      master.ships.map((s) => ({
        value: s.name,
        label: s.name,
        sub: shipTypeName(s.stype),
        name: s.name,
        yomi: s.yomi,
      })),
    );
  }
  const equips = master.equips.map((e) => ({
    value: target.kind === "equipId" ? e.id : e.name,
    label: target.kind === "equipId" ? `${e.id} ${e.name}` : e.name,
    sub: equipTypeName(e.type2),
    name: e.name,
    // 装備IDを入れる欄では、名前だけでなく数字でも引けるようにする。
    yomi: target.kind === "equipId" ? String(e.id) : "",
  }));
  return target.kind === "equipId" ? equips : byName(equips);
}

/** 書きかけの文字に当てはまる候補。前方一致が上、次に短い名前が上。 */
export function suggestNames(target: NameTarget, q: string, limit = SUGGEST_LIMIT): Suggestion[] {
  const query = q.trim();
  if (query === "") return [];
  const hit: { c: Candidate; r: number }[] = [];
  for (const c of candidates(target)) {
    const r = rank(c.name, c.yomi, query);
    if (r >= 0) hit.push({ c, r });
  }
  hit.sort((a, b) => a.r - b.r || a.c.name.length - b.c.name.length);
  return hit.slice(0, limit).map(({ c }) => ({ value: c.value, label: c.label, sub: c.sub }));
}

/**
 * 艦名・装備名のカンマ区切り入力。書きかけの語に当てはまる候補を下に出す。
 *
 * 一覧から選ぶ「選択…」の窓は残してある。名前をだいたい覚えているときは打つほうが速く、
 * 何があるかを見たいときは窓のほうが速いため。
 */
export function NameSuggestInput(props: {
  target: NameTarget;
  value: string;
  placeholder?: string;
  class?: string;
  onInput: (raw: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const caretRef = useRef<number | null>(null);
  const [seg, setSeg] = useState<Segment>({ start: 0, end: 0, text: "" });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const list = open ? suggestNames(props.target, seg.text) : [];

  // 候補を入れた直後は、入れた値の末尾にカーソルを戻す(既定では末尾へ飛んでしまう)。
  useLayoutEffect(() => {
    const caret = caretRef.current;
    if (caret === null) return;
    caretRef.current = null;
    inputRef.current?.setSelectionRange(caret, caret);
  }, [props.value]);

  // 選んだ候補が一覧からはみ出さないように繰る。
  useLayoutEffect(() => {
    scrollItemIntoView(listRef.current, active);
  }, [active, seg.text]);

  const readSegment = (el: HTMLInputElement) => {
    const caret = el.selectionStart ?? el.value.length;
    setSeg(segmentAt(el.value, caret));
  };

  const accept = (s: Suggestion) => {
    const el = inputRef.current;
    if (el === null) return;
    const next = replaceSegment(el.value, seg, String(s.value));
    caretRef.current = next.caret;
    setOpen(false);
    props.onInput(next.text);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (list.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % list.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + list.length) % list.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      accept(list[active]);
    }
  };

  return (
    <span class={`relative inline-flex min-w-0 ${props.class ?? ""}`}>
      <input
        type="text"
        ref={inputRef}
        class="ctl border border-gray-300 rounded px-1 w-full"
        placeholder={props.placeholder}
        value={props.value}
        autocomplete="off"
        onInput={(e) => {
          const el = e.target as HTMLInputElement;
          readSegment(el);
          setActive(0);
          setOpen(true);
          props.onInput(el.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={(e) => readSegment(e.target as HTMLInputElement)}
        onBlur={() => setOpen(false)}
      />
      {list.length > 0 && (
        <ul
          ref={listRef}
          class="absolute left-0 top-full mt-1 z-20 w-max min-w-full max-w-[28rem] max-h-60 overflow-auto bg-bg-panel border border-gray-300 rounded shadow-lg text-xs"
        >
          {list.map((s, i) => (
            <li key={String(s.value)}>
              <button
                type="button"
                class={`flex w-full items-center gap-2 px-2 py-0.5 text-left ${
                  i === active ? "bg-emp-4" : ""
                }`}
                // 押した瞬間に入力から焦点が外れると、候補が消えて押せなくなる
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => accept(s)}
              >
                <span class="flex-1 whitespace-nowrap">{s.label}</span>
                <span class="text-gray-400 whitespace-nowrap">{s.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
