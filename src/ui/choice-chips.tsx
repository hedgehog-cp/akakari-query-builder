import { useEffect, useRef, useState } from "preact/hooks";

/** 一つの選択肢。value は条件に入る実際の値、label は画面に出す文字。 */
export type Choice = { value: string | number; label: string };

/**
 * 畳んだときのボタンの文字。中身まで並べると列や窓の幅しだいで行が折り返るので、
 * ボタンには件数だけを出す。選んだ中身は title で読ませる。
 */
export function summaryLabel(labels: readonly string[]): string {
  if (labels.length === 0) return "未選択";
  return `${labels.length}件`;
}

function Chip(props: { label: string; picked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class={`ctl shrink-0 whitespace-nowrap border rounded px-1.5 ${
        props.picked ? "bg-emp-2 border-emp-1" : "border-gray-300 hover:bg-emp-4"
      }`}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

/**
 * 決まった選択肢からの複数選択。
 *
 * 選択肢を横に並べると、長いものや数の多いものが行に収まらず右端で見切れる。
 * 収まるかどうかは入れ子の深さや列名の長さ、ウィンドウ幅でも変わって当てにならないので、
 * 常にボタン1個へ畳んでおき、押したときだけ一覧を開く。
 */
export function ChoiceChips(props: {
  choices: Choice[];
  values: (string | number)[];
  onChange: (v: (string | number)[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  // 開いている間は、枠の外を押すか Esc で閉じる。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node) === false) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const picked = new Set(props.values.map(String));
  const toggle = (c: Choice) => {
    props.onChange(
      picked.has(String(c.value))
        ? props.values.filter((x) => String(x) !== String(c.value))
        : [...props.values, c.value],
    );
  };
  const pickedLabels = props.choices.filter((c) => picked.has(String(c.value))).map((c) => c.label);

  return (
    <span ref={rootRef} class="relative inline-flex min-w-0">
      <button
        type="button"
        class={`ctl shrink-0 whitespace-nowrap border rounded px-1.5 hover:bg-emp-4 ${
          pickedLabels.length > 0 ? "bg-emp-2 border-emp-1" : "border-gray-300"
        }`}
        title={pickedLabels.length > 0 ? pickedLabels.join(", ") : "未選択"}
        onClick={() => setOpen((o) => !o)}
      >
        {summaryLabel(pickedLabels)} ▾
      </button>
      {open && (
        <span class="absolute left-0 top-full mt-1 z-20 flex flex-wrap gap-1 bg-bg-panel border border-gray-300 rounded shadow-lg p-1.5 w-max max-w-[32rem] max-h-60 overflow-auto">
          {props.choices.map((c) => (
            <Chip
              key={String(c.value)}
              label={c.label}
              picked={picked.has(String(c.value))}
              onClick={() => toggle(c)}
            />
          ))}
        </span>
      )}
    </span>
  );
}
