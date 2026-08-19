import { BATTLE_LABEL, BATTLE_SCHEMA, type Battle } from "../model/types";

const BATTLES: Battle[] = ["akakari-hougeki", "akakari-raigeki", "akakari-midnight"];

function optionLabel(b: Battle): string {
  const date = BATTLE_SCHEMA[b].match(/\d{4}-\d{2}-\d{2}$/)?.[0];
  return date === undefined ? BATTLE_LABEL[b] : `${BATTLE_LABEL[b]} (${date})`;
}

export function BattleSelect(props: { value: Battle; onChange: (b: Battle) => void }) {
  return (
    <section class="bg-bg-panel border border-gray-300 rounded p-3">
      <h2 class="font-bold text-purple-900 mb-2">戦闘種別</h2>
      <select
        class="border border-gray-300 rounded px-2 py-1"
        value={props.value}
        onChange={(e) => props.onChange((e.target as HTMLSelectElement).value as Battle)}
      >
        {BATTLES.map((b) => <option key={b} value={b}>{optionLabel(b)}</option>)}
      </select>
    </section>
  );
}
