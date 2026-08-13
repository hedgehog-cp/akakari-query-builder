import { BATTLE_LABEL, type Battle } from "../model/types";

const BATTLES: Battle[] = ["akakari-hougeki", "akakari-raigeki", "akakari-midnight"];

export function BattleSelect(props: { value: Battle; onChange: (b: Battle) => void }) {
  return (
    <section class="bg-bg-panel border border-gray-300 rounded p-3">
      <h2 class="font-bold mb-2">戦闘種別</h2>
      <div class="flex gap-4">
        {BATTLES.map((b) => (
          <label key={b} class="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="battle"
              checked={props.value === b}
              onChange={() => props.onChange(b)}
            />
            <span>{BATTLE_LABEL[b]}</span>
          </label>
        ))}
      </div>
      <p class="text-xs text-gray-500 mt-2">
        赤仮には <code>砲撃戦.csv</code> と <code>赤仮砲撃戦.csv</code> の2系統があります。
        このツールが扱うのは <code>赤仮*</code> のほうです。
      </p>
    </section>
  );
}
