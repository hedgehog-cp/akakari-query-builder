import { describe, it, expect } from "vitest";
import { moveNode, type TreeAdapter } from "./tree-move";

type Node = { name: string } | { children: Node[] };

const adapter: TreeAdapter<Node> = {
  childrenOf: (n) => ("children" in n ? n.children : null),
  withChildren: (n, children) => ("children" in n ? { children } : n),
};

const leaf = (name: string): Node => ({ name });
const group = (...children: Node[]): Node => ({ children });

/** 木を "a,(b,c)" のような読める形にする。 */
function show(n: Node): string {
  return "children" in n ? `(${n.children.map(show).join(",")})` : n.name;
}

const move = (root: Node, from: number[], fi: number, to: number[], ti: number) =>
  show(moveNode(root, from, fi, to, ti, adapter));

describe("moveNode", () => {
  it("同じリスト内では並べ替える", () => {
    expect(move(group(leaf("a"), leaf("b"), leaf("c")), [], 0, [], 2)).toBe("(b,c,a)");
  });

  it("グループの中へ入れる", () => {
    const root = group(leaf("a"), group(leaf("b")));
    expect(move(root, [], 0, [1], 1)).toBe("((b,a))");
  });

  it("グループの外へ出す", () => {
    const root = group(leaf("a"), group(leaf("b"), leaf("c")));
    expect(move(root, [1], 0, [], 0)).toBe("(b,a,(c))");
  });

  it("入れ子の奥のグループへ移す", () => {
    const root = group(leaf("a"), group(group(leaf("b"))));
    expect(move(root, [], 0, [1, 0], 0)).toBe("(((a,b)))");
  });

  it("兄弟グループの間で移す", () => {
    const root = group(group(leaf("a")), group(leaf("b")));
    expect(move(root, [0], 0, [1], 0)).toBe("((),(a,b))");
  });

  it("自分自身の中へは動かさない", () => {
    const root = group(group(leaf("a")), leaf("b"));
    expect(move(root, [], 0, [0], 0)).toBe("((a),b)");
  });

  it("存在しない位置は動かさない", () => {
    const root = group(leaf("a"));
    expect(move(root, [], 5, [], 0)).toBe("(a)");
    expect(move(root, [], 0, [3], 0)).toBe("(a)");
  });

  it("葉の中へは入れられない", () => {
    const root = group(leaf("a"), leaf("b"));
    expect(move(root, [], 0, [1], 0)).toBe("(a,b)");
  });

  it("元の木を書き換えない", () => {
    const root = group(leaf("a"), group(leaf("b")));
    moveNode(root, [], 0, [1], 0, adapter);
    expect(show(root)).toBe("(a,(b))");
  });
});
