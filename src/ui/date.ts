/**
 * datetime-local の値と出力JSONの14桁コードを相互変換する。
 * 桁数が14でないと logbook 側のフィルタが常に偽になるため、UIで14桁を保証する。
 */
export function toDateCode(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (m === null) return null;
  return `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6] ?? "00"}`;
}

/** 14桁のコードを datetime-local の値にする。桁数が違えば空文字。 */
export function fromDateCode(code: string): string {
  if (code.length !== 14) return "";
  const s = (a: number, b: number) => code.slice(a, b);
  return `${s(0, 4)}-${s(4, 6)}-${s(6, 8)}T${s(8, 10)}:${s(10, 12)}:${s(12, 14)}`;
}
