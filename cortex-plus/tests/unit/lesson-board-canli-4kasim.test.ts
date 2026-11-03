import { describe, expect, it } from "vitest";
import { layoutBoard } from "@/lib/learning/lesson-board";

describe("layoutBoard canlı 4 Kasım", () => {
  it("sıralı listede küçük harfle başlayan maddenin numarasını siler", () => {
    const lines = layoutBoard("1. Öncülü belirle.\n2. p ⇒ q için yanlış satırı hatırla.\n3. Karşıtı yaz.");
    expect(lines.map((line) => line.text)).toEqual(["Öncülü belirle.", "p ⇒ q için yanlış satırı hatırla.", "Karşıtı yaz."]);
  });
  it("sırasız numaraya (sıra sayısı) dokunmaz", () => {
    expect(layoutBoard("2. sınıfta başladı.\n6. sınıfta bitti.").map((l) => l.text).join(" ")).toContain("2.");
  });
  it("eşitlik içeren düz cümle formül kutusuna düşmez", () => {
    const lines = layoutBoard("İkisi D iken taraflar Y olur; p=D, q=Y iken ilk eşitliğin iki tarafı D, ikinci eşitliğin iki tarafı Y olur.");
    expect(lines.every((line) => line.kind === "prose")).toBe(true);
    expect(lines).toHaveLength(1);
  });
  it("gerçek formül yine formüldür", () => {
    expect(layoutBoard("Hız şöyle bulunur: v = x / t")[1]?.kind).toBe("formula");
  });
});
