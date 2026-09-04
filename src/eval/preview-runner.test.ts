import { describe, it, expect } from "vitest";
import { runPreview, type PreviewEvent } from "./preview-runner";
import { encodeLines, scanFileRange } from "./scan-range";
import type { PreviewMessage, PreviewRequest } from "./preview.worker";
import type { Query } from "../model/types";

const HEADER = ["No.", "日付", "海域", "攻撃艦", "ダメージ", "攻撃艦.名前"];

/**
 * ワーカーの代わり。ブラウザの外では Worker を作れないので、同じ依頼を受けて
 * 同じ走査を行い、同じ形の報せを返す。走査そのものは製品と同じ scanFileRange。
 */
function fakeWorker(): Worker {
  const w = {
    onmessage: null as ((e: MessageEvent<PreviewMessage>) => void) | null,
    stopped: false,
    postMessage(req: PreviewRequest) {
      void (async () => {
        const r = await scanFileRange(req);
        if (w.stopped) return;
        const msg: PreviewMessage = {
          type: "done",
          scanned: r.scanned,
          matched: r.matched,
          keptLines: r.keptLines,
          csv: encodeLines(r.lines),
          ignored: r.ignored,
          misaligned: r.misaligned,
        };
        w.onmessage?.({ data: msg } as MessageEvent<PreviewMessage>);
      })();
    },
    terminate() {
      w.stopped = true;
    },
  };
  return w as unknown as Worker;
}

function query(column: string, value: string): Query {
  return {
    battle: "hougeki",
    dateRanges: [],
    output: { kind: "column", column, cond: { kind: "eq", values: [value] } },
    attackerItems: null,
    defenderItems: null,
  } as unknown as Query;
}

/** 8MB を超えないと分割されないので、それなりの大きさの CSV を作る。 */
function makeCsv(rows: number): { file: File; matched: number } {
  const lines = [HEADER.join(",")];
  let matched = 0;
  for (let i = 0; i < rows; i++) {
    const mine = i % 3 === 0;
    if (mine) matched++;
    lines.push(
      [
        String(i),
        "2026/01/02 3:04:05",
        "鎮守府正面海域",
        mine ? "自軍" : "敵軍",
        String(i % 500),
        `艦娘${i % 90}` + "・".repeat(40),
      ].join(","),
    );
  }
  const text = "﻿" + lines.join("\r\n") + "\r\n";
  return { file: new File([text], "赤仮砲撃戦.csv"), matched };
}

function run(file: Blob, q: Query, header = HEADER): Promise<PreviewEvent[]> {
  return new Promise((resolve) => {
    const events: PreviewEvent[] = [];
    runPreview({
      query: q,
      header,
      file,
      spawn: fakeWorker,
      onEvent: (e) => {
        events.push(e);
        if (e.type !== "progress") resolve(events);
      },
    });
  });
}

describe("runPreview", () => {
  it("分けて走らせても、一致した行と件数が揃う", async () => {
    const { file, matched } = makeCsv(140000);
    expect(file.size).toBeGreaterThan(24 << 20); // 3本に分かれる大きさ
    const events = await run(file, query("攻撃艦", "自軍"));
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type !== "done") return;
    expect(done.scanned).toBe(140000);
    expect(done.matched).toBe(matched);
    expect(done.rows.length).toBe(Math.min(matched, 10000));
    expect(done.truncated).toBe(matched > done.rows.length);
    expect(done.header).toEqual(HEADER);
    // 表に出す行は元の並び順
    expect(done.rows[0][0]).toBe("0");
    expect(done.rows[1][0]).toBe("3");
    // つなげたバイト列は、列名の行から始まる1つのCSVになる
    const text = new TextDecoder("utf-8").decode(
      new Uint8Array(await new Blob(done.csv).arrayBuffer()),
    );
    const out = text.split("\r\n");
    expect(out[0]).toBe(HEADER.join(","));
    expect(out.length - 2).toBe(matched); // 末尾の改行のぶん
    expect(out[1].startsWith("0,")).toBe(true);
    expect(out.at(-2)?.startsWith("139998,")).toBe(true); // 3の倍数の行だけが残る
  });

  it("走査の結果をそのまま次の対象にできる", async () => {
    const { file, matched } = makeCsv(2000);
    const first = (await run(file, query("攻撃艦", "自軍"))).at(-1);
    expect(first?.type).toBe("done");
    if (first?.type !== "done") return;

    // 結果は元のCSVと同じ形なので、そのまま走査に掛けられる。
    const second = (await run(new Blob(first.csv), query("攻撃艦", "自軍"))).at(-1);
    expect(second?.type).toBe("done");
    if (second?.type !== "done") return;
    expect(second.scanned).toBe(matched);
    expect(second.matched).toBe(matched);
    expect(second.rows).toEqual(first.rows);

    // 更に絞れば、そのぶんだけ残る。
    const third = (await run(new Blob(first.csv), query("攻撃艦.名前", "艦娘1・・・"))).at(-1);
    expect(third?.type).toBe("done");
    if (third?.type !== "done") return;
    expect(third.matched).toBeLessThan(second.matched);
  });

  it("列名が合わない CSV は走らせずに知らせる", async () => {
    const { file } = makeCsv(100);
    const events = await run(file, query("攻撃艦", "自軍"), [...HEADER, "無い列"]);
    expect(events.at(-1)).toEqual({ type: "header-mismatch", missing: ["無い列"], extra: [] });
  });

  it("Shift_JIS の CSV は走らせずに知らせる", async () => {
    // 「日付」を Shift_JIS で書いた列名の行
    const sjis = new Uint8Array([
      0x4e, 0x6f, 0x2e, 0x2c, 0x93, 0xfa, 0x95, 0x74, 0x2c, 0x8a, 0x43, 0x88, 0xe6, 0x0d, 0x0a,
    ]);
    const file = new File([sjis], "赤仮砲撃戦.csv");
    const events = await run(file, query("攻撃艦", "自軍"), ["No.", "日付", "海域"]);
    expect(events.at(-1)).toEqual({ type: "bad-encoding", encoding: "shift_jis" });
  });
});
