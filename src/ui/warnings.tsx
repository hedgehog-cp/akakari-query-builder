import type { Warning } from "../model/validate";
import type { ParseWarning } from "../parse/json";

/** 検査と取り込みの警告をまとめて並べる帯。無ければ何も出さない。 */
export function Warnings(props: { validation: Warning[]; imports: ParseWarning[] }) {
  const total = props.validation.length + props.imports.length;
  if (total === 0) return null;
  return (
    <section class="border border-emp-3 bg-emp-4 rounded p-2 text-xs">
      <h3 class="font-bold mb-1">警告 {total} 件(生成は止まりません)</h3>
      <ul class="list-disc pl-5">
        {props.imports.map((w, i) => (
          <li key={`i${i}`}>
            <span class="text-gray-500">{w.path}</span> {w.message}
          </li>
        ))}
        {props.validation.map((w, i) => (
          <li key={`v${i}`}>
            <span class="text-gray-500">{w.path}</span> {w.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
