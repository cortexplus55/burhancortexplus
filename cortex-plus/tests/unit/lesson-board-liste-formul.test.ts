import { describe, expect, it } from "vitest";
import { layoutBoard } from "@/lib/learning/lesson-board";

describe("layoutBoard: liste numarası ve formül kutusu", () => {
  it("sıralı listede küçük harfle başlayan maddenin numarasını siler", () => {
    const lines = layoutBoard("1. Veriyi belirle.\n2. x ile y için tabloyu hatırla.\n3. Sonucu yaz.");
    expect(lines.map((line) => line.text)).toEqual(["Veriyi belirle.", "x ile y için tabloyu hatırla.", "Sonucu yaz."]);
  });
  it("sırasız numaraya (sıra sayısı) dokunmaz", () => {
    expect(layoutBoard("2. sınıfta başladı.\n6. sınıfta bitti.").map((l) => l.text).join(" ")).toContain("2.");
  });
  it("eşitlik içeren düz cümle formül kutusuna düşmez", () => {
    const lines = layoutBoard("İkisi A iken taraflar B olur; x=A, y=B iken ilk eşitliğin iki tarafı A, ikinci eşitliğin iki tarafı B olur.");
    expect(lines.every((line) => line.kind === "prose")).toBe(true);
    expect(lines).toHaveLength(1);
  });
  it("gerçek formül yine formüldür", () => {
    expect(layoutBoard("Hız şöyle bulunur: v = x / t")[1]?.kind).toBe("formula");
  });
});
