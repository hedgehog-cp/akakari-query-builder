import { useCallback, useRef } from "preact/hooks";
import { CsvParser, formatTsvRow } from "../../eval/csv";

export function csvToTsv(csv: string, includeHeader: boolean): string {
  const parser = new CsvParser();
  const rows = [...parser.push(csv), ...parser.flush()];
  return (includeHeader ? rows : rows.slice(1)).map(formatTsvRow).join("\r\n");
}

export function download(body: string | ArrayBuffer[], name: string, type: string): void {
  const blob = new Blob(Array.isArray(body) ? body : [body], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * ワーカーから届いたバイト列を文字列にする。数百MBでは復号だけで1秒近くかかるため、
 * コピーを押したときにだけ行い、同じ結果に対しては1度きりにする。
 * (TextDecoder は先頭の BOM を落とすので、得られるのは BOM 無しの本文。)
 */
export function useCsvText(csv: ArrayBuffer[] | null): () => string {
  const cache = useRef<{ csv: ArrayBuffer[] | null; text: string }>({ csv: null, text: "" });
  return useCallback(() => {
    if (csv === null) return "";
    if (cache.current.csv !== csv) {
      // 範囲の切れ目は行の切れ目なので、範囲ごとに復号してつなげてよい。
      const dec = new TextDecoder("utf-8");
      cache.current = { csv, text: csv.map((part) => dec.decode(part)).join("") };
    }
    return cache.current.text;
  }, [csv]);
}
