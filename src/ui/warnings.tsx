import type { Warning } from "../model/validate";
import type { ParseWarning } from "../parse/json";

/** 検査と取り込みの警告をまとめて並べる帯。無ければ何も出さない。 */
export function Warnings(props: { validation: Warning[]; imports: ParseWarning[] }) {
  const total = props.validation.length + props.imports.length;
  if (total === 0) return null;
  return (
    <section class="border border-emp-3 bg-emp-4 rounded p-2 text-xs">
      <h3 class="font-bold mb-1">警告 {total} 件(生成は止まりません)</h3>
      {/* 警告の数は編集のたびに増えたり減ったりする。そのぶん帯が伸び縮みすると
        下の欄まで上下に動いて読みづらいので、3行ぶんの高さで固定し、溢れるぶんは
        この中だけを繰る。1件は1行に収めて、全文は title で読む。 */}
      <ul class="list-disc pl-5 h-12 overflow-y-auto">
        {props.imports.map((w, i) => (
          <li key={`i${i}`} class="leading-4 truncate" title={`${w.path} ${w.message}`}>
            <span class="text-gray-500">{w.path}</span> {w.message}
          </li>
        ))}
        {props.validation.map((w, i) => (
          <li key={`v${i}`} class="leading-4 truncate" title={`${w.path} ${w.message}`}>
            <span class="text-gray-500">{w.path}</span> {w.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
