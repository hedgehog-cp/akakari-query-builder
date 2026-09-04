import { describe, it, expect } from "vitest";
import { detectBadEncoding } from "./encoding";

const HEADER = ["No.", "日付", "海域", "マス", "出撃", "ランク", "敵艦隊"];

/** 文字列を Shift_JIS のバイト列にする(テストの入力を作るためだけのもの)。 */
function toShiftJis(text: string): Uint8Array {
  // Node には Shift_JIS の符号化器が無いため、復号器で往復させて作れない。
  // 使う文字が少ないので、必要な字だけの対応表で組み立てる。
  const table: Record<string, number[]> = {
    日: [0x93, 0xfa],
    付: [0x95, 0x74],
    海: [0x8a, 0x43],
    域: [0x88, 0xe6],
    マ: [0x83, 0x7d],
    ス: [0x83, 0x58],
  };
  const bytes: number[] = [];
  for (const ch of text) {
    const sjis = table[ch];
    if (sjis !== undefined) bytes.push(...sjis);
    else bytes.push(ch.charCodeAt(0));
  }
  return new Uint8Array(bytes);
}

describe("detectBadEncoding", () => {
  it("UTF-8 の CSV は通す", () => {
    const bytes = new TextEncoder().encode("No.,日付,海域\r\n1,2026/01/02,鎮守府正面海域\r\n");
    expect(detectBadEncoding(bytes, HEADER)).toBeNull();
  });

  it("末尾で文字が切れていても通す", () => {
    const whole = new TextEncoder().encode("No.,日付,海域\r\n");
    expect(detectBadEncoding(whole.slice(0, 6), HEADER)).toBeNull();
  });

  it("Shift_JIS の CSV は Shift_JIS と見立てる", () => {
    const bytes = toShiftJis("No.,日付,海域,マス\r\n");
    expect(detectBadEncoding(bytes, HEADER)).toBe("shift_jis");
  });

  it("列名が読み取れないバイト列は unknown にする", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x80, 0x81, 0x82, 0x83]);
    expect(detectBadEncoding(bytes, HEADER)).toBe("unknown");
  });
});
