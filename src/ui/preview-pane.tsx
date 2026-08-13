import { useRef, useState } from "preact/hooks";
import type { Query } from "../model/types";
import type { Column } from "../schema/catalog";
import type { PreviewMessage } from "../eval/preview.worker";

type State =
  | { kind: "idle" }
  | { kind: "running"; scanned: number; matched: number }
  | { kind: "mismatch"; missing: string[]; extra: string[] }
  | { kind: "done"; scanned: number; matched: number; sample: string[][]; csv: string; ignored: string[] }
  | { kind: "error"; message: string };

export function PreviewPane(props: { query: Query; columns: Column[] }) {
  const [enabled, setEnabled] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const workerRef = useRef<Worker | null>(null);

  const run = () => {
    if (file === null) return;
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../eval/preview.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    setState({ kind: "running", scanned: 0, matched: 0 });
    worker.onmessage = (e: MessageEvent<PreviewMessage>) => {
      const m = e.data;
      if (m.type === "progress") setState({ kind: "running", scanned: m.scanned, matched: m.matched });
      else if (m.type === "header-mismatch") setState({ kind: "mismatch", missing: m.missing, extra: m.extra });
      else if (m.type === "done") setState({ kind: "done", ...m });
      else setState({ kind: "error", message: m.message });
    };
    worker.postMessage({
      query: props.query,
      header: props.columns.map((c) => c.name),
      file,
    });
  };

  const download = (csv: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "filtered.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section class="bg-bg-panel border border-gray-300 rounded p-3">
      <label class="flex items-center gap-2 font-bold">
        <input type="checkbox" checked={enabled}
          onChange={(e) => setEnabled((e.target as HTMLInputElement).checked)} />
        プレビュー
      </label>
      <p class="text-xs text-gray-500 mt-1">
        CSV は44万行を超えることがあるため既定でOFFです。実行はボタンを押したときだけで、
        編集のたびに再実行はしません。
      </p>

      {enabled && (
        <div class="mt-2 grid gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <input type="file" accept=".csv"
              onChange={(e) => setFile((e.target as HTMLInputElement).files?.[0] ?? null)} />
            <button type="button" disabled={file === null}
              class="border border-emp-1 rounded px-3 py-0.5 text-xs hover:bg-emp-4 disabled:opacity-40"
              onClick={run}>実行</button>
          </div>

          {state.kind === "running" && (
            <p class="text-xs">走査 {state.scanned.toLocaleString()} 行 / 一致 {state.matched.toLocaleString()} 行…</p>
          )}

          {state.kind === "mismatch" && (
            <div class="border border-red-400 bg-red-50 rounded p-2 text-xs">
              <p class="text-red-700 font-bold">
                CSV のヘッダが選択中の戦闘種別と一致しません。実行を中止しました。
              </p>
              {state.missing.length > 0 && <p>不足: {state.missing.join(", ")}</p>}
              {state.extra.length > 0 && <p>余分: {state.extra.join(", ")}</p>}
              <p class="text-gray-600">
                旧世代の CSV か、日本語以外の環境で出力された CSV の可能性があります。
              </p>
            </div>
          )}

          {state.kind === "error" && <p class="text-xs text-red-600">{state.message}</p>}

          {state.kind === "done" && (
            <div class="grid gap-2">
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span>一致 {state.matched.toLocaleString()} 行 / 全 {state.scanned.toLocaleString()} 行</span>
                <button type="button" class="border border-emp-1 rounded px-3 py-0.5 hover:bg-emp-4"
                  onClick={() => download(state.csv)}>結果CSVをダウンロード</button>
              </div>
              {state.ignored.length > 0 && (
                <p class="text-xs text-red-600">
                  次の条件はプレビューに反映されていません: {state.ignored.join(", ")}
                  (CSV の列だけでは評価できません)
                </p>
              )}
              <p class="text-xs text-gray-500">先頭 {state.sample.length} 行のみ表示しています。</p>
              <div class="overflow-auto max-h-[40vh] border border-gray-200 rounded">
                <table class="text-xs whitespace-nowrap">
                  <thead class="bg-gray-50 sticky top-0">
                    <tr>{props.columns.map((c) => <th key={c.name} class="px-1 text-left">{c.name}</th>)}</tr>
                  </thead>
                  <tbody>
                    {state.sample.map((r, i) => (
                      <tr key={i} class="odd:bg-gray-50/50">
                        {r.map((v, j) => <td key={j} class="px-1">{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
