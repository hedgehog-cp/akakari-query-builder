/** 読み込みを断る文字コードの見立て。UTF-8 として読めたときは null。 */
export type BadEncoding = "shift_jis" | "unknown";

/**
 * 先頭チャンクの文字コードを確かめる。UTF-8 として読めなければ見立てを返す。
 *
 * 判定は先頭だけで足りる。文字コードはファイル全体で1つであり、CSV は1行目から
 * 列名が並ぶので、そこが読めなければ後ろも読めない。
 */
export function detectBadEncoding(chunk: Uint8Array, header: string[]): BadEncoding | null {
  try {
    // stream: true にしておくと、チャンクの末尾で切れた文字を誤りと数えない。
    new TextDecoder("utf-8", { fatal: true }).decode(chunk, { stream: true });
    return null;
  } catch {
    return looksShiftJis(chunk, header) ? "shift_jis" : "unknown";
  }
}

const ASCII_ONLY = /^[\x00-\x7f]*$/;

/**
 * Shift_JIS として読むと列名が現れるか。ここまで合えば、壊れたファイルではなく
 * 文字コード違いだと言い切ってよい。
 */
function looksShiftJis(chunk: Uint8Array, header: string[]): boolean {
  let text: string;
  try {
    text = new TextDecoder("shift_jis").decode(chunk);
  } catch {
    return false; // この環境に Shift_JIS の復号器が無い
  }
  const firstLine = text.split(/\r?\n/, 1)[0];
  // ASCII だけの列名はどの文字コードでも同じに読めるので数に入れない。
  // 1つの偶然の一致でも決めない。日本語の列名が2つ以上並んでいれば十分。
  let hit = 0;
  for (const name of header) {
    if (ASCII_ONLY.test(name)) continue;
    if (firstLine.includes(name) && ++hit >= 2) return true;
  }
  return false;
}
