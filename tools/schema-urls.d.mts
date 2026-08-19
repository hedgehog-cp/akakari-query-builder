// schema-urls.mjs の型。TS 側(src/schema/fetch.test.ts)から
// 世代一覧とURLの一致を確かめるためだけに要る。
export declare const BASE: string;
export declare const SCHEMA_IDS: string[];
export declare function schemaUrl(id: string): string;
