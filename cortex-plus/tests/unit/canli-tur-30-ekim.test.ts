import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectUnrelatedDocuments, mentionsSubject } from "@/lib/documents/material-similarity";
import { calmHeading } from "@/lib/learning/teacher-lesson";
import { openingStage, stepAfterMood } from "@/lib/learning/lesson-open";

/*
  Canlı tur 30 Ekim 2026: sıfırdan kurulan "Makroekonomi" hazırlığı (Ekonomi notu + bilerek eklenmiş alakasız Hukuk
  notu). Bulunan ve kapatılan kusurlar; örnekler farklı derslerden, derse özel kelime yok.
*/

function doc(id: string, fileName: string, text: string) {
  // Gerçek not birkaç sayfa; denetim en az 60 içerik sözcüğü ister.
  return { documentId: id, fileName, pages: [1, 2, 3].map((pageNumber) => ({ pageNumber, text })) };
}

const economy = doc(
  "eko",
  "Ekonomi-Enflasyon.pdf",
  "Enflasyon genel fiyat düzeyinin sürekli artmasıdır. Ekonomide para arzı, faiz ve merkez bankası politikası fiyatları etkiler. " +
    "Ekonomik büyüme, işsizlik ve enflasyon arasındaki ilişki ekonomi politikasının temelidir. TÜFE ve Yİ-ÜFE fiyat endeksleridir. " +
    "Para politikası araçları açık piyasa işlemleri, reeskont oranı ve zorunlu karşılıklardır. Deflasyon fiyatların düşmesidir. " +
    "Dezenflasyon enflasyon oranının düşmesidir. Stagflasyon durgunluk ile enflasyonun birlikte görülmesidir. Ekonomi ölçümleri.",
);
const law = doc(
  "huk",
  "Hukuk-Sozlesme.pdf",
  "Sözleşme karşılıklı ve birbirine uygun irade açıklamalarıyla kurulur. İcap ve kabul sözleşmenin kuruluş unsurlarıdır. " +
    "Kanunda şekle bağlanan sözleşmelerde şekil şartı geçerlilik şartıdır. Taşınmaz satışı resmi şekle tabidir. Kefalet yazılı " +
    "şekilde yapılır. Kesin hükümsüzlük herkes tarafından ileri sürülebilir. Yanılma esaslı ise sözleşme iptal edilebilir. " +
    "Hesap yanlışlığı sözleşmenin geçerliliğini etkilemez, düzeltilir. Bağışlama vaadi yazılı olmalıdır. Rekabet yasağı.",
);

describe("bileşik ders adı belgede aranır", () => {
  it("'Makroekonomi' ders adı 'ekonomi' geçen belgede bulunur, hukuk belgesinde bulunmaz", () => {
    const stemsOf = (text: string) => {
      const map = new Map<string, number>();
      for (const word of text.toLocaleLowerCase("tr").replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 4)) {
        const stem = word.slice(0, 5);
        map.set(stem, (map.get(stem) ?? 0) + 1);
      }
      return map;
    };
    expect(mentionsSubject("Makroekonomi", stemsOf(economy.pages[0]!.text))).toBe(true);
    expect(mentionsSubject("Makroekonomi", stemsOf(law.pages[0]!.text))).toBe(false);
  });

  it("iki belgeli kurulumda alakasız belge artık yakalanır", () => {
    const unrelated = detectUnrelatedDocuments([economy, law], { subject: "Makroekonomi" });
    expect(unrelated.map((item) => item.fileName)).toEqual(["Hukuk-Sozlesme.pdf"]);
  });
});

describe("kısaltmalı başlık bozulmaz", () => {
  it("içinde küçük harfli kelime olan başlık bağırma sayılmaz; tümü büyük harf başlık yine düzeltilir", () => {
    expect(calmHeading("TÜFE ve Yİ-ÜFE")).toBe("TÜFE ve Yİ-ÜFE");
    expect(calmHeading("DNA ile RNA Farkı")).toBe("DNA ile RNA Farkı");
    expect(calmHeading("ENFLASYON VE PARA POLİTİKASI")).not.toBe("ENFLASYON VE PARA POLİTİKASI");
  });
});

describe("ders açılışı tek kart, renk anahtarı vaat etmez", () => {
  it("ruh halinden sonra ve bugün ruh hali verildiyse doğrudan 'Ders oluştur' kartı", () => {
    expect(stepAfterMood("lesson")).toBe("setup");
    expect(openingStage("lesson", { familiarityKnown: true, moodToday: true })).toBe("setup");
  });

  it("giriş kartının renk anahtarı 'sınavda çıkar' demez", () => {
    const steps = readFileSync("src/components/parity/exam-lesson-steps.tsx", "utf8");
    expect(steps).not.toContain("işaretli yerler sınavda çıkar");
    expect(steps).toContain("sınavda sık sorulan kilit bilgi");
  });
});

describe("yeni hazırlığın ilk dersi beklemeden açılır", () => {
  it("kurulum ilk dersi Plus'ta hızlı işlemle önceden yazdırır", () => {
    const create = readFileSync("src/app/api/learning/exam-prep/create/route.ts", "utf8");
    expect(create).toContain("{ firstLesson: true }");
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain("fast: input.charge !== false || input.firstLesson === true,");
    expect(route).toContain("firstLesson: prefetch && parsed.data.firstLesson === true,");
  });
});

describe("'Sınavda sık çıkar' rozeti yalnız azınlığı ayırırsa", () => {
  it("bütün konularda ya da çoğunda gösterilmez, azınlıkta gösterilir", async () => {
    const { examHeavyBadgeVisible } = await import("@/lib/learning/exam-wizard-copy");
    expect(examHeavyBadgeVisible([true, true, true, true])).toBe(false);
    expect(examHeavyBadgeVisible([true, true, true, false])).toBe(false);
    expect(examHeavyBadgeVisible([true, false, true, false])).toBe(true);
    expect(examHeavyBadgeVisible([true, false, false, false, false])).toBe(true);
    expect(examHeavyBadgeVisible([false, false])).toBe(false);
  });
});
