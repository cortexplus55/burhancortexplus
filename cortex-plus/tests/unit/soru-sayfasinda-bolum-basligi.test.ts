/**
 * Soru sayfasında açık bölüm başlığı (15 Kasım 2026, Burhan: "açık bir bölüm başlığı varsa sayfada numaralı sorular
 * bulunsa bile başlığın korunmasını sağla"). Soru sayfası (`isPracticePage`) iskelette tümüyle atlanıyordu; "3. <bölüm>"
 * başlığının altında numaralı sorular duran sayfada başlık da kayboluyor, belge haritası bölümü öncekine katıyordu.
 *
 * Kural ders bağımsız: ilk soru kökünden ya da şıktan ÖNCEKİ numaralı ya da Markdown başlık korunur. Soruların kendisi,
 * alıştırma bölümünün adı ve cümle başlık sayılmaz. Örnekler fizik, tarih ve biyoloji.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildDocumentSkeleton } from "@/lib/documents/outline-skeleton";
import { buildDocumentMap } from "@/lib/documents/document-map";

const titles = (pages: { pageNumber: number; text: string }[]) =>
  buildDocumentSkeleton([{ pages }]).headings.filter((heading) => !heading.documentTitle).map((heading) => heading.title);

const PHYSICS = [
  { pageNumber: 1, text: "FİZİK DERS NOTU\n\n1. Kinematik\nKonum, yer değiştirme ve hız tanımları. Hız, birim zamandaki yer değiştirmedir." },
  { pageNumber: 2, text: "2. Dinamik\nNewton'un ikinci yasası: F = m · a. Sürtünme kuvveti hareketin tersine etki eder ve hızı azaltır." },
  {
    pageNumber: 3,
    text:
      "3. Enerji\nKinetik enerji hızın karesiyle artar.\n" +
      "1. Kütlesi 2 kg olan cisim 3 m/s hızla gidiyor. Kinetik enerjisi kaç J'dür?\nA) 3 B) 6 C) 9 D) 12 E) 18\n" +
      "2. Hızı iki katına çıkan cismin kinetik enerjisi kaç katına çıkar?\nA) 1 B) 2 C) 3 D) 4 E) 8",
  },
];

const HISTORY = [
  { pageNumber: 1, text: "TARİH NOTU\n\n1. Tanzimat Dönemi\nTanzimat Fermanı 1839'da okundu; can, mal ve namus güvencesi getirdi." },
  { pageNumber: 2, text: "2. Islahat Dönemi\nIslahat Fermanı 1856'da ilan edildi; gayrimüslimlere yeni haklar tanıdı ve eşitlik ilkesi genişledi." },
  {
    pageNumber: 3,
    text:
      "3. Meşrutiyet\n" +
      "1. I. Meşrutiyet hangi yıl ilan edilmiştir?\nA) 1839 B) 1856 C) 1876 D) 1908 E) 1923\n" +
      "2. Kanun-i Esasi ile ilgili aşağıdakilerden hangisi doğrudur?\nA) İlk anayasadır B) Padişahı kaldırır C) Cumhuriyeti ilan eder D) Halifeliği kaldırır E) Saltanatı kaldırır",
  },
];

const BIOLOGY = [
  { pageNumber: 1, text: "# Hücre Zarı\nHücre zarı seçici geçirgendir; madde geçişini denetler ve hücreyi çevresinden ayırır." },
  { pageNumber: 2, text: "# Mitoz Bölünme\nMitozda kromozom sayısı korunur. Profaz, metafaz, anafaz ve telofaz evreleri sırayla gerçekleşir." },
  {
    pageNumber: 3,
    text:
      "# Mayoz Bölünme\n" +
      "1. Mayoz sonucunda kaç hücre oluşur?\nA) 1 B) 2 C) 3 D) 4 E) 8\n" +
      "2. Krossing over hangi evrede görülür?\nA) Profaz I B) Metafaz I C) Anafaz I D) Telofaz I E) Profaz II",
  },
];

describe("soru sayfasındaki açık bölüm başlığı korunur", () => {
  it("fizik: '3. Enerji' altında numaralı sorular olsa da bölüm", () => {
    expect(titles(PHYSICS)).toEqual(["Kinematik", "Dinamik", "Enerji"]);
  });

  it("tarih: başlığın hemen altı sorularla başlasa da bölüm", () => {
    expect(titles(HISTORY)).toEqual(["Tanzimat Dönemi", "Islahat Dönemi", "Meşrutiyet"]);
  });

  it("biyoloji: Markdown başlık da korunur", () => {
    expect(titles(BIOLOGY)).toEqual(["Hücre Zarı", "Mitoz Bölünme", "Mayoz Bölünme"]);
  });

  it("numaralı kardeş dizisi bozulmaz: soru sayfasındaki başlık dizinin üçüncüsü", () => {
    const headings = buildDocumentSkeleton([{ pages: PHYSICS }]).headings.filter((heading) => heading.number);
    expect(headings.map((heading) => heading.number)).toEqual(["1", "2", "3"]);
  });

  it("belge haritası bölümü öncekine katmaz; sorular kendi bölümüne sayılır", () => {
    const map = buildDocumentMap(PHYSICS, new Date("2026-11-15T00:00:00Z"));
    expect(map.sections.map((section) => [section.title, section.from, section.to])).toEqual([
      ["Kinematik", 1, 1],
      ["Dinamik", 2, 2],
      ["Enerji", 3, 3],
    ]);
    expect(map.sections.find((section) => section.title === "Enerji")!.pastQuestions).toBe(2);
  });
});

describe("soru sayfasında başlık sayılmayanlar", () => {
  it("numaralı soruların kendisi ve şıklar başlık değil", () => {
    const pages = [
      { pageNumber: 1, text: "1. Kuvvet\nKuvvet itme ya da çekmedir; birimi Newton'dur ve vektörel bir büyüklüktür." },
      { pageNumber: 2, text: "2. Basınç\nBasınç, birim yüzeye dik etki eden kuvvettir; yüzey küçüldükçe basınç artar." },
      {
        pageNumber: 3,
        text:
          "1. Hangisi kuvvetin birimidir?\nA) Joule B) Newton C) Watt D) Pascal E) Volt\n" +
          "2. Yüzey alanı yarıya inerse basınç nasıl değişir?\nA) Yarıya iner B) Değişmez C) İki katına çıkar D) Dört katına çıkar E) Sıfır olur",
      },
    ];
    expect(titles(pages)).toEqual(["Kuvvet", "Basınç"]);
  });

  it("alıştırma bölümünün adı ('Çıkmış Sorular', 'Test') konu bölümü değil", () => {
    const pages = [
      { pageNumber: 1, text: "1. Atom Modelleri\nDalton, Thomson, Rutherford ve Bohr modelleri sırayla geliştirildi ve atomu açıkladı." },
      { pageNumber: 2, text: "2. Periyodik Tablo\nElementler artan atom numarasına göre sıralanır; aynı gruptakiler benzer özellik gösterir." },
      {
        pageNumber: 3,
        text:
          "# Çıkmış Sorular\n" +
          "1. Çekirdeği ilk öneren bilim insanı kimdir?\nA) Dalton B) Thomson C) Rutherford D) Bohr E) Mendeleyev\n" +
          "2. Aynı gruptaki elementlerin hangi özelliği benzerdir?\nA) Kütle B) Kimyasal özellik C) Renk D) Yoğunluk E) Erime noktası",
      },
    ];
    expect(titles(pages)).toEqual(["Atom Modelleri", "Periyodik Tablo"]);
  });
});
