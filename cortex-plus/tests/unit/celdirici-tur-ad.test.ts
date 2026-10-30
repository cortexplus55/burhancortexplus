import { describe, expect, it } from "vitest";
import { askedKind, offKindDistractors } from "@/lib/learning/distractor-kind";
import { OFF_KIND_PREFIX, quizStructureIssues } from "@/lib/learning/teacher-quiz";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

/*
  30 Ekim 2026, canlı Araçlar testi (Makroekonomi notu, #424 yayındayken): kural yazara gidiyordu ama iki soru yine
  başka türden çeldiriciyle geldi. Kod türü yalnız kaynağın tanım cümlesinden okuyordu ve kökün sorduğu türü ad öbeğinin
  ilk sözcüğünden alıyordu ("hangi enflasyon maliyetidir" → enflasyon). Türkçede türü son sözcük söyler; tür adı
  şıkların kendisinde yazıyorsa kaynak gerekmez.
*/

const q = (text: string, options: string[], correct: string): QuizQuestion =>
  ({ text, options, correct: [correct], explanation: "Kısa gerekçe.", type: "single" }) as unknown as QuizQuestion;

describe("çeldirici türü: tür adı şıkta", () => {
  it("canlı soru 1: enflasyon maliyeti sorusunda para politikası araçları", () => {
    const stem = "Bir işletme, fiyat etiketlerini sık sık yenilemek zorunda kaldığı için ek harcama yapıyor. Bu harcama hangi enflasyon maliyetidir?";
    const options = ["Ayakkabı eskitme maliyeti", "Menü maliyeti", "Zorunlu karşılık oranı", "Reeskont oranı", "Politika faizi"];
    expect(askedKind(stem)).toBe("maliy");
    expect(offKindDistractors({ stem, options, correctIndex: 1, context: "" })).toEqual([
      "Zorunlu karşılık oranı",
      "Reeskont oranı",
      "Politika faizi",
    ]);
    const issues = quizStructureIssues(q(stem, options, "Menü maliyeti"), { optionCount: 5 });
    expect(issues.some((issue) => issue.startsWith(OFF_KIND_PREFIX))).toBe(true);
  });

  it("canlı soru 10: 'Bu enflasyon hangi türdendir' — deflasyon ve dezenflasyon enflasyon türü değil", () => {
    const stem = "Bir üretim dalında verimsizlik ve dışa bağımlılık, fiyat artışlarının temel kaynağıdır. Bu enflasyon hangi türdendir?";
    const options = ["Yapısal enflasyon", "Deflasyon", "Dezenflasyon", "Maliyet enflasyonu", "Talep enflasyonu"];
    expect(askedKind(stem)).toBe("enfla");
    expect(offKindDistractors({ stem, options, correctIndex: 0, context: "" })).toEqual(["Deflasyon", "Dezenflasyon"]);
  });

  it("biyoloji ve tarih: aynı ölçü", () => {
    expect(
      offKindDistractors({
        stem: "Kemiği kemiğe bağlayan yapı hangi bağ dokusudur?",
        options: ["Sıkı bağ dokusu", "Gevşek bağ dokusu", "Kıkırdak", "Miyozin", "Hemoglobin"],
        correctIndex: 0,
        context: "",
      }),
    ).toEqual(["Kıkırdak", "Miyozin", "Hemoglobin"]);
    expect(
      offKindDistractors({
        stem: "1923'te ilan edilen yönetim biçimi hangi devlet şeklidir?",
        options: ["Cumhuriyet", "Saltanat", "Meşrutiyet", "Halifelik", "Teokrasi"],
        correctIndex: 0,
        context: "",
      }),
    ).toEqual([]);
  });

  it("yanlış alarm yok: tek sözcüklük cevap, genel soru sözcüğü, tür adını taşımayan doğru cevap", () => {
    // Kavram sorusu (genel sözcük) — ölçü susar.
    expect(
      offKindDistractors({
        stem: "Genel fiyatlar yükselmeyi sürdürürken enflasyon oranı %60'tan %40'a geriliyor. Bu değişim hangi kavramla adlandırılır?",
        options: ["Deflasyon", "Talep enflasyonu", "Stagflasyon", "Dezenflasyon", "Hiperenflasyon"],
        correctIndex: 3,
        context: "",
      }),
    ).toEqual([]);
    // Doğru cevap tür adını taşımıyor (kardeşleri taşısa da): ölçü kendini doğrulayamaz.
    expect(
      offKindDistractors({
        stem: "Kan şekerini düşüren hormon hangisidir?",
        options: ["İnsülin", "Glukagon hormonu", "Pankreas", "Karaciğer"],
        correctIndex: 0,
        context: "",
      }),
    ).toEqual([]);
    // Tür adını yalnız doğru cevap taşıyor: kardeş yok, ölçü susar.
    expect(
      offKindDistractors({
        stem: "Bu harcama hangi enflasyon maliyetidir?",
        options: ["Menü maliyeti", "Reeskont oranı", "Politika faizi", "Zorunlu karşılık oranı"],
        correctIndex: 0,
        context: "",
      }),
    ).toEqual([]);
  });
});
