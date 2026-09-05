/** 列の値の型。画面が区別するのはこの2種類だけ。 */
export type FieldType = "integer" | "string";

/** 選択肢のある列で、値と表示名の対。 */
export type Category = { value: number; label: string };

/** 1列ぶんのメタ情報。条件の組み立て・検査・出力はこれを見て振る舞いを決める。 */
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
