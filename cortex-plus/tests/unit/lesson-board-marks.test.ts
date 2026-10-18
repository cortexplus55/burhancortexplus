import { describe, expect, it } from "vitest";
import { layoutBoard, stripEmphasis, studentTextParts } from "@/lib/learning/lesson-board";

/*
  Sınav vurgusu tahtada bütün kalır (18 Ekim 2026, trigonometri dersi, hazırlık 4fb52e2f).

  Yazarın metni temiz ve tek satırdı; tahta düzenleyicisi "==…==" işaretinin kendi "=="
  karakterlerini formül sanıp cümleyi ";" ve ":" noktalarından böldü. İşaret iki satıra
  kırılınca öğrenci ham "==" gördü, "=" taşıyan parçalar formül satırı oldu ve bir önceki
  cümleye "şöyle hesaplanır:" eklendi ("ölçüyü π/180 ile şöyle hesaplanır:").
*/
const SCREEN_2 =
  "**Açı**, bir ışının başlangıç noktası çevresinde dönmesiyle oluşan yönlü büyüklüktür. Trigonometride açı " +
  "yalnızca üçgen içindeki dar açılarla sınırlı değildir; 360°’ı aşan ve negatif açılar da kullanılır. " +
  "==Pozitif yön saat yönünün tersidir; negatif yön saat yönüdür.== Son kolları aynı olan açılara **koterminal** " +
  "denir. Örneğin 30°, 390° ve −330° aynı son kola sahiptir. Koterminal açıları bulurken tam dönüşleri ekleyip " +
  "çıkarırsın: derece cinsinden θ + 360° × k, radyan cinsinden θ + 2πk; burada k ∈ ℤ’dir. " +
  "==30°, 390° ve −330° koterminal açılardır.==";

const SCREEN_3 =
  "Derece ile radyan aynı açıyı farklı birimlerle ifade eder. Temel eşitlik **180° = π rad**’dır. Dereceden " +
  "radyana geçerken ölçüyü π/180 ile; radyandan dereceye geçerken ölçüyü 180/π ile çarparsın. " +
  "==Derece → radyan: π/180; radyan → derece: 180/π.== Örneğin 225°’yi radyana çevirmek için 225 × π/180 " +
  "işlemini yaparsın ve 5π/4 rad elde edersin.";

function markedParts(lines: { text: string }[]) {
  return lines.flatMap((line) => studentTextParts(line.text).filter((part) => part.exam).map((part) => part.text));
}

describe("tahta: sınav vurgusu bölünmez", () => {
  it("noktalı virgül ve iki nokta içeren vurgu tek satırda, ham '==' yok, formül satırı yok", () => {
    for (const text of [SCREEN_2, SCREEN_3]) {
      const lines = layoutBoard(text);
      const joined = lines.map((line) => line.text).join("\n");
      // Tam vurgular soyulunca satırda "==" kalmamalı: kalan, kırılmış bir işarettir.
      for (const line of lines) expect(stripEmphasis(line.text), line.text).not.toContain("==");
      // "180° = π rad" gibi gerçek bir eşitlik formül satırı olabilir; vurgu taşıyan satır olamaz.
      expect(lines.some((line) => line.kind === "formula" && line.text.includes("=="))).toBe(false);
      expect(joined).not.toContain("şöyle hesaplanır");
      for (const line of lines) {
        const opens = (line.text.match(/==/g) ?? []).length;
        expect(opens % 2, `satırda tek '==': ${line.text}`).toBe(0);
      }
    }
    expect(markedParts(layoutBoard(SCREEN_2))).toEqual([
      "Pozitif yön saat yönünün tersidir; negatif yön saat yönüdür.",
      "30°, 390° ve −330° koterminal açılardır.",
    ]);
    expect(markedParts(layoutBoard(SCREEN_3))).toEqual(["Derece → radyan: π/180; radyan → derece: 180/π."]);
  });

  it("vurgudan sonraki cümle ayrı satır olur; vurgu içindeki satır sonu tek boşluğa iner", () => {
    const lines = layoutBoard("==Temel eşitlik\n180° = π rad'dır.== Dönüşümde bu oran kullanılır.");
    expect(lines.map((line) => line.text)).toEqual([
      "==Temel eşitlik 180° = π rad'dır.==",
      "Dönüşümde bu oran kullanılır.",
    ]);
    expect(lines.every((line) => line.kind === "prose")).toBe(true);
  });

  it("vurgu içinde tek '=' olabilir; 'a == b' yine vurgu değildir", () => {
    expect(studentTextParts("Temel eşitlik ==180° = π rad==’dır.").filter((p) => p.exam).map((p) => p.text)).toEqual([
      "180° = π rad",
    ]);
    expect(studentTextParts("Kodda a == b karşılaştırmadır.").some((p) => p.exam)).toBe(false);
    expect(stripEmphasis("==180° = π rad== ve **k**")).toBe("180° = π rad ve k");
  });

  it("gerçek formül satırı yine formül olarak kalır", () => {
    const lines = layoutBoard("Merkez açı şöyle bulunur: θ = s/r. Burada s yay uzunluğudur.");
    expect(lines.some((line) => line.kind === "formula" && line.text.includes("θ = s/r"))).toBe(true);
  });
});
