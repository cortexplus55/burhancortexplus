import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractOfficeText } from "@/lib/documents/extract-office-text";
import {
  buildGroundingFile,
  groundTopic,
  groundingTokens,
  type GroundingFile,
  type GroundingLang,
} from "@/lib/documents/outline-grounding";

/**
 * Real-text gate for topic grounding. The fixture holds, per page, only the
 * sorted set of folded words (no prose), extracted from the KPSS law book OCR
 * (211 pages), two short chemistry notes and Think Python. Grounding is
 * set-based, so results are identical to running on the full page text.
 */
type Book = "kpss" | "k12" | "k16" | "tp";
type Case = { book: Book; title: string; a: number; b: number; why?: string; asked?: string[] };

const bags = JSON.parse(
  readFileSync(path.join(__dirname, "../fixtures/grounding/page-word-bags.json"), "utf8"),
) as Record<Book, { lang: GroundingLang; pages: Record<string, string> }>;
const files = Object.fromEntries(
  Object.entries(bags).map(([k, v]) => [
    k,
    buildGroundingFile(new Map(Object.entries(v.pages).map(([n, t]) => [Number(n), t])), v.lang),
  ]),
) as Record<Book, GroundingFile>;

const K = "kpss" as const;
export const real: Record<string, Case[]> = {
  astra: [
    ["Temel Hukuk Kavramları ve Hukukun Kaynakları", 4, 14, "Hukuk kurallarının özelliklerini, yaptırım türlerini ve hukukun yazılı ve yazısız kaynaklarını öğreneceksin."],
    ["Kişiler ve Aile Hukuku ile Medeni Hukuk Esasları", 21, 35, "Gerçek ve tüzel kişiler, ehliyet, hısımlık, nişanlanma, evlenme ve boşanma kurallarını öğreneceksin."],
    ["Borçlar, Eşya ve Ticaret Hukuku", 36, 40, "Mülkiyet, zilyetlik, sözleşmeler ve ticaret hukukunun temel kavramlarını öğreneceksin."],
    ["Ceza Hukuku ve Yargılama Hukukunun İlkeleri", 15, 20, "Suç ve cezanın temel ilkelerini ve yargılama hukukunun dallarını öğreneceksin."],
    ["Anayasa Teorisi, Devlet Şekilleri ve Türk Anayasa Tarihi", 58, 75, "Anayasa kavramını, devlet ve hükümet sistemlerini ve Osmanlı'dan bugüne anayasal gelişmeleri öğreneceksin."],
    ["1982 Anayasası'nın Temel İlkeleri ve Esasları", 76, 85, "1982 Anayasası'nın başlangıç ilkelerini ve Cumhuriyetin niteliklerini öğreneceksin."],
    ["Temel Hak ve Hürriyetler ile Siyasi Haklar", 86, 105, "Temel hakların sınıflandırılmasını, sınırlanmasını ve siyasi hakları öğreneceksin."],
    ["Yasama Organı: TBMM'nin Yapısı, Görevleri ve Seçimler", 106, 131, "TBMM'nin kuruluşunu, seçimlerini, üyelerin statüsünü ve görev ve yetkilerini öğreneceksin."],
    ["Yürütme Organı: Cumhurbaşkanlığı ve Olağanüstü Yönetim Usulleri", 132, 145, "Cumhurbaşkanının görevlerini, kararnameleri ve olağanüstü hal yönetimini öğreneceksin."],
    ["Yargı Organı, Anayasa Yargısı ve Yüksek Mahkemeler", 146, 163, "Yargı bağımsızlığını, Anayasa Mahkemesini ve yüksek mahkemeleri öğreneceksin."],
    ["İdare Hukuku, Türkiye'nin İdari Yapısı ve Devlet Memurluğu", 164, 203, "Merkezi ve yerel idareyi, idari teşkilatı ve kamu görevlilerini öğreneceksin."],
    ["İnsan Hakları Hukuku ve Ulusal-Uluslararası Koruma Mekanizmaları", 204, 211, "İnsan haklarının gelişimini ve ulusal ve uluslararası koruma mekanizmalarını öğreneceksin."],
  ].map(([title, a, b, why]) => ({ book: K, title, a, b, why } as Case)),
  toc: [
    ["Hukukun Temel Kavramları", 4, 57, "Hukuk kurallarını, hukukun kaynaklarını, dallarını ve hak kavramını öğreneceksin."],
    ["Anayasa Hukukuna Giriş", 58, 75, "Anayasa kavramını, anayasa türlerini ve Türk anayasal gelişmelerini öğreneceksin."],
    ["1982 Anayasası Genel Esasları", 76, 85, "Başlangıç metnini ve Cumhuriyetin niteliklerini öğreneceksin."],
    ["Temel Hak ve Hürriyetler", 86, 105, "Temel hakların sınırlanmasını, durdurulmasını ve sınıflandırılmasını öğreneceksin."],
    ["Yasama", 106, 131, "TBMM'nin kuruluşunu, seçimlerini ve görevlerini öğreneceksin."],
    ["Yürütme", 132, 145, "Cumhurbaşkanı, kararnameler ve olağanüstü hal yönetimini öğreneceksin."],
    ["Yargı", 146, 163, "Mahkemeleri, yargı bağımsızlığını ve Anayasa Mahkemesini öğreneceksin."],
    ["İdare Hukuku", 164, 203, "Merkezi idare, yerel yönetimler ve kamu görevlilerini öğreneceksin."],
    ["İnsan Hakları", 204, 211, "İnsan haklarının korunma mekanizmalarını öğreneceksin."],
  ].map(([title, a, b, why]) => ({ book: K, title, a, b, why } as Case)),
  chem: [
    ["k12", "Mol Kavramı ve Avogadro Sayısı", 2, 2, "Mol tanımını ve tanecik sayısı ile mol arasındaki ilişkiyi öğreneceksin."],
    ["k12", "Mol Kütlesi ve Kütle–Mol Hesapları", 3, 5, "Atomik kütle birimi, mol kütlesi ve kütle–mol–tanecik dönüşümlerini öğreneceksin."],
    ["k12", "Molar Hacim ve İdeal Gaz Denklemi", 6, 7, "Normal koşullarda molar hacmi ve PV = nRT denklemini öğreneceksin."],
    ["k12", "Kimyanın Temel Kanunları", 8, 10, "Kütlenin korunumu ve sabit oranlar kanunlarını öğreneceksin."],
    ["k16", "Kimyasal Tepkimeler ve Denkleştirme", 2, 4, "Tepkime denklemlerini yazmayı ve denkleştirmeyi öğreneceksin."],
    ["k16", "Tepkime Türleri", 5, 5, "Yanma, sentez, analiz ve yer değiştirme tepkimelerini ayırt etmeyi öğreneceksin."],
    ["k16", "Stokiyometri: Sınırlayıcı Bileşen ve Verim", 6, 10, "Denklemden mol hesabı, sınırlayıcı bileşen ve tepkime verimini öğreneceksin."],
    ["k16", "Çözeltiler ve Derişim", 11, 13, "Kütlece yüzde, molarite ve seyreltme hesaplarını öğreneceksin."],
    ["k16", "Asitler ve Bazlar", 14, 16, "Asit–baz tanımlarını, pH ve nötralleşmeyi öğreneceksin."],
  ].map(([book, title, a, b, why]) => ({ book, title, a, b, why } as Case)),
  english: ([
    ["The Way of the Program", 23, 30, "You will learn what programming is, how to run Python, and what debugging means."],
    ["Variables, Expressions and Statements", 31, 38, "You will learn assignment, variable names, operators and the order of operations."],
    ["Functions", 39, 50, "You will learn function calls, math functions, defining new functions and parameters."],
    ["Case Study: Interface Design", 51, 60, "You will use turtle graphics to practice encapsulation, generalization and refactoring."],
    ["Conditionals and Recursion", 61, 72, "You will learn boolean expressions, if statements, recursion and keyboard input."],
    ["Fruitful Functions", 73, 84, "You will learn return values, incremental development and recursive functions."],
    ["Iteration", 85, 92, "You will learn reassignment, the while statement and square roots by iteration."],
    ["Strings", 93, 104, "You will learn string indexing, slicing, traversal, searching and string methods."],
    ["Case Study: Word Play", 105, 110, "You will solve word puzzles by reading word lists and searching strings."],
    ["Lists", 111, 124, "You will learn list operations, slices, methods, aliasing and list arguments."],
    ["Dictionaries", 125, 136, "You will learn mappings, counters, looping over dictionaries and memos."],
    ["Tuples", 137, 146, "You will learn tuple assignment, tuples as return values and lists of tuples."],
    ["Case Study: Data Structure Selection", 147, 158, "You will analyze word frequency and choose suitable data structures."],
    ["Files", 159, 168, "You will learn reading and writing files, format operators and exceptions."],
    ["Classes and Objects", 169, 176, "You will define classes, create instances and work with attributes."],
    ["Classes and Functions", 177, 182, "You will write pure functions and modifiers for a Time class."],
    ["Classes and Methods", 183, 192, "You will learn methods, the init method, operator overloading and polymorphism."],
    ["Inheritance", 193, 204, "You will model cards and decks with class attributes and inheritance."],
    ["The Goodies", 205, 214, "You will learn conditional expressions, list comprehensions, generators and named tuples."],
    ["Debugging", 215, 222, "You will learn to handle syntax errors, runtime errors and semantic errors."],
    ["Analysis of Algorithms", 223, 232, "You will learn order of growth, Python operations and hashtables."],
  ] as [string, number, number, string][]).map(([title, a, b, why]) => ({ book: "tp", title, a, b, why } as Case)),
  narrow: [
    ...([["Hukukta Boşluk Türleri", 13, 14], ["Anayasa Kavramı ve Tarihçesi", 58, 58], ["Anayasa Türleri", 59, 59], ["Devlet ve Hükümet Sistemleri", 60, 63],
      ["Demokrasi Kavramı", 64, 64], ["Osmanlı-Türk Anayasal Gelişmeleri", 65, 71], ["Başlangıç Metni", 76, 77], ["Cumhuriyetin Nitelikleri", 78, 82],
      ["Temel Hak ve Hürriyetlerin Sınırlanması", 86, 88], ["TBMM Seçimleri ve Seçim Dönemi", 107, 109], ["Cumhurbaşkanı Yardımcıları ve Bakanlar", 135, 136],
      ["Devlet Denetleme Kurulu", 136, 137], ["Milli Güvenlik Kurulu", 139, 139], ["Olağanüstü Hâl Yönetimi", 140, 141], ["Anayasa Mahkemesi", 148, 150],
      ["Merkezi İdare", 168, 170], ["Mahalli İdareler", 177, 180], ["İnsan Haklarının Korunması", 207, 209]] as [string, number, number][]).map(([title, a, b]) => ({ book: K, title, a, b } as Case)),
    ...([["Mol’ün Tanımı ve Tanecik Sayısı", 2, 2], ["Kütle–Mol–Tanecik Hesapları", 4, 4], ["Mol Kütlesi Bulma Problemleri", 5, 5], ["Gaz Yasaları ve İdeal Gaz Denklemi", 7, 7], ["Sabit Oranlar Kanunu", 9, 9], ["Katlı Oranlar ve Birleşen Hacimler", 10, 10]] as [string, number, number][]).map(([title, a, b]) => ({ book: "k12", title, a, b } as Case)),
    ...([["Tepkime Denklemlerinin Denkleştirilmesi", 3, 3], ["Sınırlayıcı Bileşen", 8, 9], ["Tepkime Verimi", 10, 10], ["Molarite ve İyon Derişimleri", 12, 12], ["Seyreltme ve Karıştırma", 13, 13], ["Nötralleşme Tepkimeleri", 16, 16]] as [string, number, number][]).map(([title, a, b]) => ({ book: "k16", title, a, b } as Case)),
    ...([["Keyboard Input", 67, 67], ["Incremental Development", 74, 75], ["The while Statement", 86, 86], ["String Slices", 95, 95], ["Tuple Assignment", 138, 138], ["Reading and Writing Files", 159, 160], ["Operator Overloading", 187, 188], ["Polymorphism", 189, 189], ["List Comprehensions", 206, 206], ["Syntax Errors", 215, 216], ["Hashtables", 228, 230]] as [string, number, number][]).map(([title, a, b]) => ({ book: "tp", title, a, b } as Case)),
  ],
};
export const fakes: Case[] = ([
  ["kpss", "Türk Dış Politikası ve Uluslararası Antlaşmalar", 4, 57, "Türkiye'nin dış politika ilkelerini ve uluslararası antlaşmaları öğreneceksin.", ["Lozan Antlaşması", "NATO üyeliği"]],
  ["kpss", "Vergi Usul Kanunu ve Vergi Cezaları", 164, 203, "Vergi türlerini, vergi usulünü ve vergi cezalarını öğreneceksin.", ["Vergi ziyaı cezası", "Usulsüzlük cezası"]],
  ["kpss", "Osmanlı Ekonomisi ve Kapitülasyonlar", 58, 75, "Osmanlı ekonomisini ve kapitülasyonların etkilerini öğreneceksin.", ["Kapitülasyonlar", "Duyun-u Umumiye"]],
  ["kpss", "Fotosentez ve Hücre Solunumu", 86, 105, "Bitkilerde fotosentezi ve hücre solunumunu öğreneceksin.", ["Klorofil", "ATP üretimi"]],
  ["kpss", "Avrupa Birliği Hukuku ve Kurumları", 204, 211, "Avrupa Birliği kurumlarını ve AB hukukunun kaynaklarını öğreneceksin.", ["Avrupa Komisyonu", "Avrupa Parlamentosu"]],
  ["kpss", "Seçim Kanunu Değişiklikleri 2023", 106, 131, "2023 yılında seçim kanununda yapılan değişiklikleri öğreneceksin.", ["Seçim barajı", "İttifak sistemi"]],
  ["k12", "Organik Kimya ve Hidrokarbonlar", 2, 10, "Alkanlar, alkenler ve hidrokarbonların adlandırılmasını öğreneceksin.", ["Alkan", "Alken"]],
  ["k16", "Elektrokimya ve Piller", 11, 16, "Elektrot potansiyellerini ve pillerin çalışmasını öğreneceksin.", ["Anot", "Katot"]],
  ["tp", "Web Development with Django", 159, 168, "You will learn to build web apps with Django views and templates.", ["URL routing", "Django models"]],
  ["tp", "Machine Learning with NumPy", 205, 214, "You will learn to train models with NumPy arrays.", ["Gradient descent", "Arrays"]],
] as [Book, string, number, number, string, string[]][]).map(([book, title, a, b, why, asked]) => ({ book, title, a, b, why, asked }));

/** Held-out fakes (round-4 review), never tuned against. The first and last KPSS ones sit close to real chapters. */
export const heldOut: Case[] = ([
  ["kpss", "Türk Ceza Kanununda Hapis Cezasının İnfazı", 15, 20],
  ["kpss", "Uluslararası Ticaret Hukuku ve Dış Ticaret Rejimi", 36, 40],
  ["kpss", "Sağlık Hukuku ve Hasta Hakları", 204, 211],
  ["kpss", "Çevre Hukuku ve İklim Değişikliği", 164, 203],
  ["kpss", "Anayasa Mahkemesinin 2024 Kararları", 146, 163],
  ["kpss", "Osmanlı Dönemi Vergi Sistemi", 58, 75],
  ["kpss", "Belediye Bütçesi ve Yerel Vergiler", 177, 180],
  ["kpss", "Cumhurbaşkanlığı Seçiminde Sandık Güvenliği", 132, 145],
  ["kpss", "Avrupa İnsan Hakları Mahkemesinde Bireysel Başvuru Harçları", 204, 211],
  ["kpss", "Medeni Kanunda Miras Paylaşımı ve Vasiyetname", 21, 35],
  ["k12", "Radyoaktivite ve Nükleer Tepkimeler", 2, 10],
  ["k16", "Kimyasal Denge ve Le Chatelier İlkesi", 11, 16],
  ["k16", "Asitlerin Metallerle Tepkimesi ve Korozyon", 14, 16],
  ["tp", "Graphical User Interfaces with Tkinter", 169, 192],
  ["tp", "Multithreading and Concurrency", 85, 104],
  ["tp", "Regular Expressions for String Matching", 93, 104],
  ["tp", "Unit Testing with pytest", 215, 222],
  ["tp", "Database Access with SQL Queries", 159, 168],
] as [Book, string, number, number][]).map(([book, title, a, b]) => ({ book, title, a, b }));

function verdict(c: Case, withWhy = false) {
  return groundTopic(files[c.book], {
    title: c.title,
    whyLearn: withWhy ? c.why : undefined,
    likelyAsked: withWhy ? c.asked : undefined,
    pageStart: c.a,
    pageEnd: c.b,
  });
}

describe("outline grounding on real material", () => {
  for (const [group, cases] of Object.entries(real)) {
    it(`accepts every real ${group} topic on its real pages`, () => {
      const rejected = cases.filter((c) => !verdict(c).grounded).map((c) => c.title);
      expect(rejected).toEqual([]);
    });
  }

  it("rejects at least 9 of 10 fabricated topics, with or without why/likelyAsked", () => {
    const titleOnly = fakes.filter((c) => !verdict(c).grounded).length;
    const withWhy = fakes.filter((c) => !verdict(c, true).grounded).length;
    expect(titleOnly).toBeGreaterThanOrEqual(9);
    expect(withWhy).toBeGreaterThanOrEqual(9);
  });

  it("rejects at least 15 of the 18 held-out fakes (was 10/18)", () => {
    expect(heldOut.filter((c) => !verdict(c).grounded).length).toBeGreaterThanOrEqual(15);
  });

  it("rejects a title word the whole file never uses", () => {
    expect(verdict({ book: "kpss", title: "Osmanlı Ekonomisi ve Kapitülasyonlar", a: 58, b: 75 }).reason).toBe(
      "absent_word",
    );
  });

  it("requires a year in the title to be on the cited pages", () => {
    expect(verdict({ book: "kpss", title: "Seçim Kanunu Değişiklikleri 2023", a: 106, b: 131 }).reason).toBe(
      "year_missing",
    );
  });
});

describe("short Word / PowerPoint notes", () => {
  const officeFile = (file: string, mime: string) => {
    const extracted = extractOfficeText(readFileSync(path.join(__dirname, "../fixtures/office", file)), mime);
    return buildGroundingFile(new Map(extracted.pages.map((text, i) => [i + 1, text] as [number, string])));
  };
  const docx = officeFile("ornek-ders.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const pptx = officeFile("ornek-slayt.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  const onPage = (file: GroundingFile, title: string) => groundTopic(file, { title, pageStart: 1, pageEnd: 1 }).grounded;

  it("accepts every natural title of the one-page notes", () => {
    const docxTitles = ["Termodinamiğin Birinci Yasası", "Termodinamiğin Birinci Yasası ve İç Enerji", "Termodinamik: Birinci Yasa ve İç Enerji", "Birinci Yasa ve Enerjinin Korunumu", "İç Enerji, Isı ve İş İlişkisi", "Enerjinin Korunumu İlkesi", "Termodinamik", "Birinci Yasa"];
    const pptxTitles = ["Entropi ve İkinci Yasa", "Entropi Nedir?", "Termodinamiğin İkinci Yasası", "İkinci Yasa ve Entropinin Artışı", "Entropi: Düzensizliğin Ölçüsü", "Evrenin Entropisi"];
    expect(docxTitles.filter((t) => !onPage(docx, t))).toEqual([]);
    expect(pptxTitles.filter((t) => !onPage(pptx, t))).toEqual([]);
  });

  it("still rejects invented topics on them", () => {
    expect(onPage(docx, "Organik Kimya ve Hidrokarbonlar")).toBe(false);
    expect(onPage(docx, "Kuantum Mekaniği")).toBe(false);
    expect(onPage(pptx, "Fotosentez ve Hücre Solunumu")).toBe(false);
    expect(onPage(pptx, "Kuantum Entropisi ve Kara Delikler")).toBe(false);
  });
});

describe("grounding tokens", () => {
  it("matches Turkish consonant softening and possessive endings", () => {
    const file = buildGroundingFile(new Map([[1, "Termodinamik. Birinci yasa: enerji korunur."], [2, "dolgu"], [3, "dolgu"], [4, "dolgu"], [5, "dolgu"], [6, "dolgu"]]), "tr");
    expect(groundingTokens("Termodinamiğin", "tr")).toEqual(["termodinamik"]);
    expect(groundTopic(file, { title: "Termodinamiğin Birinci Yasası", pageStart: 1, pageEnd: 1 }).grounded).toBe(true);
  });

  it("drops apostrophe suffixes and generic words", () => {
    const tokens = groundingTokens("Türkiye'nin Temel Kavramları ve Konuları", "tr");
    expect(tokens.some((t) => t.startsWith("turkiy"))).toBe(true);
    expect(tokens).not.toContain("nin");
    expect(tokens).not.toContain("temel");
    expect(tokens).not.toContain("ve");
  });

  it("stems Turkish lightly and never below five letters", () => {
    expect(groundingTokens("kaynakları", "tr")).toEqual(groundingTokens("kaynak", "tr"));
    expect(groundingTokens("kimya", "tr")).toEqual(["kimya"]);
    expect(groundingTokens("elektrokimya", "tr")[0]!.length).toBeGreaterThanOrEqual(10);
  });

  it("does not Turkish-stem English and ignores English filler", () => {
    expect(groundingTokens("You will learn Machine Learning", "en")).toEqual(
      expect.arrayContaining(["machine"]),
    );
    expect(groundingTokens("you will", "en")).toEqual([]);
  });

  it("rejects words scattered across a wide citation", () => {
    const pages = new Map<number, string>();
    for (let p = 1; p <= 40; p += 1) pages.set(p, `dolgu paragraf metni sayfa ${p} hukuk`);
    pages.set(3, "nukleotid zinciri ve replikasyon anlatilir hukuk");
    pages.set(30, "replikasyon sureci anlatilir hukuk");
    const file = buildGroundingFile(pages, "tr");
    expect(groundTopic(file, { title: "Nükleotid Replikasyonu", pageStart: 1, pageEnd: 40 }).grounded).toBe(
      false,
    );
    expect(groundTopic(file, { title: "Nükleotid Replikasyonu", pageStart: 2, pageEnd: 4 }).grounded).toBe(
      true,
    );
  });
});
