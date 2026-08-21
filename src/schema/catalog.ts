/** 列の値の型。Table Schema のうち画面が区別する2種類だけ。 */
export type FieldType = "integer" | "string";

/** 選択肢のある列で、値と表示名の対。 */
export type Category = { value: number; label: string };

/** 画面が扱う1列ぶんのメタ情報。 */
export type Column = {
  name: string;
  type: FieldType;
  title?: string;
  description?: string;
  enum?: string[];
  categories?: Category[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  example?: string;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Table Schema から画面が必要とする項目だけを取り出す。 */
export function toCatalog(schema: unknown): Column[] {
  if (!isObj(schema) || !Array.isArray(schema.fields)) {
    throw new Error("スキーマに fields がありません");
  }
  return schema.fields.map((raw: unknown): Column => {
    if (!isObj(raw) || typeof raw.name !== "string") {
      throw new Error("フィールドに name がありません");
    }
    const c: Column = {
      name: raw.name,
      type: raw.type === "integer" ? "integer" : "string",
    };
    if (typeof raw.title === "string") c.title = raw.title;
    if (typeof raw.description === "string") c.description = raw.description;
    if (typeof raw.example === "string") c.example = raw.example;
    if (Array.isArray(raw.categories)) {
      c.categories = raw.categories.filter(isObj).map((x) => ({
        value: Number(x.value),
        label: String(x.label),
      }));
    }
    const con = raw.constraints;
    if (isObj(con)) {
      if (Array.isArray(con.enum)) c.enum = con.enum.map((x) => String(x));
      if (typeof con.minimum === "number") c.minimum = con.minimum;
      if (typeof con.maximum === "number") c.maximum = con.maximum;
      if (typeof con.pattern === "string") c.pattern = con.pattern;
    }
    return c;
  });
}
