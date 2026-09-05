import type { Battle } from "../model/types";
import generations from "./generations.json";

/** 列カタログの配信元。 */
export const SCHEMA_BASE: string = generations.base;

/**
 * 配信元での版ID(拡張子なし)。
 *
 * 新しい世代に移るときに直す場所を1か所にするためにデータへ寄せてある。画面・
 * 同梱データの更新・取得先の死活確認はすべてここを見る。keys が Battle と
 * 食い違えば、この代入で型エラーになる。
 */
export const BATTLE_SCHEMA: Record<Battle, string> = generations.ids;
