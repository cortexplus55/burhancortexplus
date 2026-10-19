import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractOfficeText } from "@/lib/documents/extract-office-text";
import {
  assignSupportExcerpts,
  splitSegments,
  supportLabel,
  type SupportSourcePage,
  type SupportTopic,
} from "@/lib/learning/topic-support-pages";
import { SUPPORT_SOURCE_NOTE, sourceText } from "@/lib/learning/teacher-lesson";

/*
  19 Ekim 2026, 7 dosyalık AYT Biyoloji sınav seti. Kurs haritası her konuyu tek dosyaya bağlıyor;
  nefron defteri, işaretli test ve hipofiz kartı hiçbir konuya bağlanmadı ve hiçbir derse girmedi.
  "Refrakter Dönem" ve "EKG Aralıkları" konuları yalnız birer fotoğraftan (400 ve 300 karakter)
  yazılacaktı. Konu–sayfa eşlemesi canlıdaki kurs haritasının aynısı.
*/

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pdf = JSON.parse(readFileSync("tests/fixtures/sinav-seti/pdf-pages.json", "utf8")) as Record<string, string>;
const photos = JSON.parse(readFileSync("tests/fixtures/sinav-seti/photo-ocr.json", "utf8")) as Record<string, string>;
const word = extractOfficeText(readFileSync("tests/fixtures/sinav-seti/Homeostazi-Son-Tekrar-Notu.docx"), DOCX).pages;

const MAP: [string, string, number[]][] = [
  ["pdf", "Sinir Dokusu, Nöron Yapısı ve Nöron Çeşitleri", [3, 4]],
  ["pdf", "Dinlenme Potansiyeli ve Aksiyon Potansiyeli", [5, 6]],
  ["Tahta-Aksiyon-Potansiyeli.jpg", "Refrakter Dönem ve İmpulsun Tek Yönlü İlerlemesi", [1]],
  ["pdf", "Sinaps ve Nörotransmitterler", [8]],
  ["pdf", "Merkezi Sinir Sistemi, Refleks ve Otonom Sinir Sistemi", [9, 10, 11, 12, 13]],
  ["pdf", "Hormonların Özellikleri, Hipotalamus ve Hipofiz", [14, 15, 16]],
  ["pdf", "Tiroit, Paratiroit ve Böbrek Üstü Bezleri", [17, 18, 19]],
  ["pdf", "Pankreas, Eşey Bezleri ve Diğer Hormon Kaynakları", [20, 21]],
  ["pdf", "Negatif ve Pozitif Geri Bildirim", [22, 23]],
  ["pdf", "Reseptörler ve Göz", [24, 25, 26]],
  ["pdf", "Kulakta İşitme ve Denge", [27]],
  ["pdf", "Koku, Tat ve Deri Duyuları", [28, 29]],
  ["pdf", "Kıkırdak, Kemik, Eklem ve İskelet", [30, 31, 32]],
  ["pdf", "Kas Çeşitleri, Sarkomer ve Kasılma", [33, 34, 35]],
  ["pdf", "Sindirim Çeşitleri, Ağız ve Mide", [36, 37, 38]],
  ["pdf", "İnce Bağırsakta Sindirim ve Emilim", [39, 40, 41]],
  ["pdf", "Karaciğer ve Sindirimin Hormonal Kontrolü", [42]],
  ["pdf", "Kalbin Yapısı ve Uyarı İletim Sistemi", [43, 44]],
  ["Defter-Kalp-Uyari-Iletimi-EKG.jpg", "EKG Aralıkları ve Kalp Uyarısı", [1]],
  ["pdf", "Dolaşım, Damarlar ve Kan Basıncı", [45, 46, 47]],
  ["pdf", "Kan, Lenf ve Pıhtılaşma", [48, 49, 50]],
  ["pdf", "Bağışıklık ve Aşı-serum Farkı", [51, 52]],
  ["pdf", "Solunum Yolları ve Soluk Alıp Verme", [53, 54]],
  ["pdf", "Gaz Değişimi, Kanda Taşınma ve Solunum Kontrolü", [55, 56, 57]],
  ["pdf", "Azotlu Atıklar, Böbrek ve Nefron Yapısı", [58, 59, 60]],
  ["pdf", "Süzülme, Geri Emilim ve Salgılama", [61, 62]],
  ["pdf", "ADH, Aldosteron ve Böbreğin Homeostazideki Rolü", [63, 64]],
  ["word", "Su-tuz Dengesi Senaryoları ve ANP", [2]],
  ["word", "Kan Şekeri, pH ve Egzersizde Sistemlerin Birlikte Çalışması", [3, 4]],
];
const topics: SupportTopic[] = MAP.map(([documentId, title, pages], index) => ({
  id: `t${index}`,
  title,
  refs: [{ documentId, pages }],
}));
const pages: SupportSourcePage[] = [
  ...Object.entries(pdf).map(([number, text]) => ({
    documentId: "pdf",
    fileName: "AYT-Biyoloji-Insan-Fizyolojisi.pdf",
    page: Number(number),
    text,
    pageCount: 65,
  })),
  ...word.map((text, index) => ({
    documentId: "word",
    fileName: "Homeostazi-Son-Tekrar-Notu.docx",
    page: index + 1,
    text,
    pageCount: 6,
  })),
  ...Object.entries(photos).map(([name, text]) => ({ documentId: name, fileName: name, page: 1, text, pageCount: 1 })),
];

const support = assignSupportExcerpts(topics, pages);
const of = (title: string) => support.get(topics.find((topic) => topic.title === title)!.id) ?? [];

describe("konunun yardımcı kaynakları", () => {
  it("nefron defteri süzülme konusuna, hipofiz kartı hipofiz konusuna bütün olarak", () => {
    const nephron = of("Süzülme, Geri Emilim ve Salgılama").find((item) => item.documentId === "Defter-Nefron-Idrar-Olusumu.jpg");
    expect(nephron?.part).toBeNull();
    const card = of("Hormonların Özellikleri, Hipotalamus ve Hipofiz").find((item) => item.documentId === "Kart-Hipofiz-Hormonlari.jpg");
    expect(card?.text).toContain("FLAT P");
  });

  it("altı konudan soru soran test soru soru kendi konusuna; öğrencinin yanlışları doğru konuda", () => {
    const test = "Test-14-Homeostazi-Isaretli.jpg";
    const adh = of("ADH, Aldosteron ve Böbreğin Homeostazideki Rolü").find((item) => item.documentId === test);
    expect(adh?.part).toBe(2);
    expect(adh?.text).toContain("tekrar bak");
    const co2 = of("Gaz Değişimi, Kanda Taşınma ve Solunum Kontrolü").find((item) => item.documentId === test);
    expect(co2?.part).toBe(6);
    expect(of("Süzülme, Geri Emilim ve Salgılama").find((item) => item.documentId === test)?.part).toBe(3);
    expect(of("Solunum Yolları ve Soluk Alıp Verme").find((item) => item.documentId === test)?.part).toBe(4);
    // Testin hiçbir konusu sayfanın tamamını almaz.
    for (const list of support.values()) {
      expect(list.some((item) => item.documentId === test && item.part === null)).toBe(false);
    }
  });

  it("Word'ün 'sık yapılan hatalar' maddeleri kendi konularına", () => {
    expect(of("Kas Çeşitleri, Sarkomer ve Kasılma").some((item) => item.documentId === "word" && /A bandı/.test(item.text))).toBe(true);
    expect(of("Reseptörler ve Göz").some((item) => item.documentId === "word" && /Miyopi|Kör nokta/.test(item.text))).toBe(true);
    expect(of("Merkezi Sinir Sistemi, Refleks ve Otonom Sinir Sistemi").some((item) => /refleks/i.test(item.text))).toBe(true);
  });

  it("ince kaynaklı konuya PDF'in ilgili sayfası", () => {
    expect(of("Refrakter Dönem ve İmpulsun Tek Yönlü İlerlemesi").map((item) => `${item.documentId}:${item.page}`)).toContain("pdf:6");
    expect(of("EKG Aralıkları ve Kalp Uyarısı").map((item) => `${item.documentId}:${item.page}`)).toContain("pdf:44");
  });

  it("büyük dosyanın sayfası yetim diye dağıtılmaz; kaynağı yeterli konuya PDF eklenmez", () => {
    for (const [topicId, list] of support) {
      const thin = ["Refrakter Dönem ve İmpulsun Tek Yönlü İlerlemesi", "EKG Aralıkları ve Kalp Uyarısı"].includes(
        topics.find((topic) => topic.id === topicId)!.title,
      );
      if (!thin) expect(list.some((item) => item.documentId === "pdf")).toBe(false);
    }
  });

  it("konu başına yardımcı metin sınırlı", () => {
    for (const list of support.values()) {
      const total = list.reduce((sum, item) => sum + item.text.length, 0);
      expect(total <= 6000 || list.length === 1).toBe(true);
    }
  });

  it("numaralı ve maddeli parçalar; tek parça bölünmez", () => {
    expect(splitSegments("1. Birinci soru metni 2. İkinci soru metni 3. Üçüncü")).toHaveLength(3);
    expect(splitSegments("QRS < 0.12 sn ve PR 0.12–0.20 sn")).toEqual([]);
    expect(splitSegments("• bir madde • iki madde")).toHaveLength(2);
  });

  it("etiket dosyayı ve parçayı söyler", () => {
    expect(supportLabel({ fileName: "Test-14.jpg", page: 1, part: 2, pageCount: 1 })).toBe("Ek kaynak · Test-14.jpg · parça 2");
    expect(supportLabel({ fileName: "AYT.pdf", page: 6, part: null, pageCount: 65 })).toBe("Ek kaynak · AYT.pdf s.6");
  });
});

describe("öğretmen motorunun kaynak metni", () => {
  it("yardımcı sayfa yoksa eski biçim", () => {
    expect(sourceText([{ page: 5, text: "metin" }])).toBe("[s.5]\nmetin");
  });

  it("yardımcı sayfalar açıklamayla ve etiketleriyle sonda", () => {
    const text = sourceText([
      { page: 5, text: "ana" },
      { page: 1, text: "ek", label: "Ek kaynak · Test.jpg · parça 2" },
    ]);
    expect(text).toBe(`[s.5]\nana\n\n${SUPPORT_SOURCE_NOTE}\n\n[Ek kaynak · Test.jpg · parça 2]\nek`);
  });

  it("düğüm rotası yardımcı sayfaları dört motor kurucusuna da verir", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route.split("pages: withSupport(clean, core)").length - 1).toBe(4);
    expect(route).toContain("support: supportPagesForEngine(await lessonSupport)");
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx", "utf8");
    expect(page).toContain("loadTopicSupport(createServiceClient()");
  });
});
