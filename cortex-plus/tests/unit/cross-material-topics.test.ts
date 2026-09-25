import { describe, expect, it } from "vitest";
import {
  applyClusterMerges,
  consolidateMaterials,
  extraPracticeForTopic,
  isNonContentSection,
  isSyllabusText,
  parseExamDate,
  parseSyllabusRows,
  priorityFromWeight,
  type MaterialCandidate,
  type MaterialDocument,
} from "@/lib/learning/cross-material-topics";
import { buildExamScheduleV2 } from "@/lib/learning/exam-schedule-v2";

/**
 * Kimya seti, yüklenen dosyaların cevap anahtarından türetilmiş aday listesi.
 * Her dosya kendi başlıklarını çıkarır; birleştirme henüz yapılmamıştır.
 * Fotoğrafların metni el yazısıdır — buradaki başlıklar o notların konu adları.
 */
const SYLLABUS = `
Genel Kimya I — Sınav Konuları
1. Ara Sınav Bilgilendirme ve Konu Listesi — Bu belge, 1. ara sınavın kapsamını ve konuların sınavdaki ağırlıklarını açıklar.
Sınav tarihi
18 Ekim 2026 (Pazar), saat 10.00
Sınav konuları ve ağırlıkları
#
Konu
Kısa açıklama
Ağırlık
Durum
1
Mol kavramı ve Avogadro sayısı
Mol tanımı, NA, atom/molekül/iyon sayısı ile mol arasındaki ilişki, akb
%10
Sınavda ağırlıklı (mol hesapları)
2
Mol kütlesi ve kütle-mol hesapları
Mol kütlesinin hesaplanması, n = m/M, kütle-mol-tanecik dönüşümleri
%15
Sınavda ağırlıklı (mol hesapları)
3
Gazlarda molar hacim ve ideal gaz denklemi
NK'da 22,4 L, PV = nRT, gaz yoğunluğu ve mol kütlesi
%10
Normal
4
Kimyanın temel kanunları
Kütlenin korunumu ve sabit oranlar kanunu (katlı oranlar hariç)
%5
Normal
5
Kimyasal tepkimeler, denkleştirme ve tepkime türleri
Denklem okuma, denkleştirme; yanma, sentez, analiz, asit-baz, çözünme-çökelme
%10
Normal
6
Stokiyometri: sınırlayıcı bileşen ve verim
Denklemden mol-kütle-hacim hesapları, sınırlayıcı ve artan madde, yüzde verim
%25
Sınavda ağırlıklı
7
Çözeltiler
Kütlece yüzde, molarite, iyon derişimi, seyreltme (M1V1 = M2V2) ve karıştırma
%15
Normal
8
Asitler ve bazlar (temel düzey)
Arrhenius ve Brønsted-Lowry tanımları, kuvvetli asit ve bazlarda pH, nötralleşme
%10
Normal (temel düzey)
Toplam
%100
Kapsam notları
• Katlı oranlar kanunu sınav kapsamı dışındadır. Ders notlarında yer almasına rağmen bu konudan soru sorulmayacaktır.
• Asit-baz konusunda yalnızca kuvvetli asit ve bazların pH hesabı sorulacaktır; zayıf asit/baz dengeleri ve tampon çözeltiler kapsam dışıdır.
• Gazlarda kısmi basınçlar (Dalton yasası) ve kinetik teori bu sınavın kapsamında değildir.
`.trim();

function candidate(
  partial: Partial<MaterialCandidate> & Pick<MaterialCandidate, "id" | "title" | "documentId" | "fileName">,
): MaterialCandidate {
  return {
    summary: partial.summary ?? partial.title,
    pages: partial.pages ?? [1],
    ...partial,
  };
}

const CHEMISTRY_CANDIDATES: MaterialCandidate[] = [
  candidate({ id: "f1a", title: "Mol kavramı ve Avogadro sayısı", documentId: "foto-1", fileName: "foto-1.jpg", pages: [1], summary: "NA 6,02e23, mol tanımı, akb" }),
  candidate({ id: "f1b", title: "Mol kütlesi ve kütle-mol hesapları", documentId: "foto-1", fileName: "foto-1.jpg", pages: [1], summary: "n = m/M, H2SO4 98 g/mol" }),
  candidate({ id: "f2a", title: "Molar hacim", documentId: "foto-2", fileName: "foto-2.jpg", pages: [1], summary: "NK 22,4 L, n = V/22,4" }),
  candidate({ id: "f2b", title: "İdeal gaz denklemi", documentId: "foto-2", fileName: "foto-2.jpg", pages: [1], summary: "PV = nRT, R = 0,082" }),
  candidate({ id: "f2c", title: "Gaz yasaları", documentId: "foto-2", fileName: "foto-2.jpg", pages: [1], summary: "Birleşik gaz yasası, yoğunluk PM = dRT" }),
  candidate({ id: "f3", title: "Sınırlayıcı bileşen", documentId: "foto-3", fileName: "foto-3.jpg", pages: [1], summary: "Tamamen tükenen madde ürün miktarını belirler. N2 + 3H2" }),
  candidate({ id: "s1a", title: "Kimyasal tepkimeler ve denkleştirme", documentId: "slayt-1", fileName: "slayt-1.pptx", pages: [1], summary: "Katsayılar mol oranıdır" }),
  candidate({ id: "s1b", title: "Fiziksel ve kimyasal değişim", documentId: "slayt-1", fileName: "slayt-1.pptx", pages: [2], summary: "Kimyasal değişimde yeni madde oluşur" }),
  candidate({ id: "s1c", title: "Tepkime türleri: yanma, sentez, analiz", documentId: "slayt-1", fileName: "slayt-1.pptx", pages: [7], summary: "Yanma, sentez ve analiz tepkimeleri" }),
  candidate({ id: "s1d", title: "Tepkime türleri: asit-baz, çökelme", documentId: "slayt-1", fileName: "slayt-1.pptx", pages: [8], summary: "Nötralleşme ve çökelme tepkime türüdür" }),
  candidate({ id: "s1e", title: "Özet ve Sık Yapılan Hatalar", documentId: "slayt-1", fileName: "slayt-1.pptx", pages: [10], summary: "Katsayıyı kütle oranı sanmak", commonMistakes: ["Katsayılar kütle oranı değildir"] }),
  candidate({ id: "s2a", title: "Çözeltiler ve derişim", documentId: "slayt-2", fileName: "slayt-2.pptx", pages: [1], summary: "Kütlece yüzde ve molarite" }),
  candidate({ id: "s2b", title: "Seyreltme", documentId: "slayt-2", fileName: "slayt-2.pptx", pages: [6], summary: "M1V1 = M2V2 yalnızca seyreltme içindir" }),
  candidate({ id: "s2c", title: "Asitler ve bazlar", documentId: "slayt-2", fileName: "slayt-2.pptx", pages: [8], summary: "Arrhenius ve Brønsted-Lowry" }),
  candidate({ id: "s2d", title: "pH ve pOH", documentId: "slayt-2", fileName: "slayt-2.pptx", pages: [9], summary: "Kuvvetli asitte pH, pH + pOH = 14" }),
  candidate({ id: "s2e", title: "Nötralleşme", documentId: "slayt-2", fileName: "slayt-2.pptx", pages: [10], summary: "Asit ve bazın nötralleşme hesabı" }),
  candidate({ id: "p12a", title: "Mol kavramı ve Avogadro sayısı", documentId: "pdf-12", fileName: "pdf-12.pdf", pages: [2], summary: "2019 SI mol tanımı" }),
  candidate({ id: "p12b", title: "Mol kütlesi", documentId: "pdf-12", fileName: "pdf-12.pdf", pages: [3, 4], summary: "Kütle-mol-tanecik hesapları" }),
  candidate({ id: "p12c", title: "Molar hacim ve gaz yasaları", documentId: "pdf-12", fileName: "pdf-12.pdf", pages: [6, 7], summary: "22,4 L ve PV = nRT" }),
  candidate({ id: "p12d", title: "Kütlenin korunumu", documentId: "pdf-12", fileName: "pdf-12.pdf", pages: [8], summary: "Tepkimede kütle korunur" }),
  candidate({ id: "p12e", title: "Sabit oranlar kanunu", documentId: "pdf-12", fileName: "pdf-12.pdf", pages: [9], summary: "Bileşikte element oranı sabittir" }),
  candidate({ id: "p12f", title: "Katlı oranlar kanunu", documentId: "pdf-12", fileName: "pdf-12.pdf", pages: [10], summary: "Aynı elementlerin farklı bileşikleri" }),
  candidate({ id: "p12g", title: "Genel Tekrar ve Karma Örnekler", documentId: "pdf-12", fileName: "pdf-12.pdf", pages: [11, 12], summary: "Karışık alıştırmalar", practiceItems: ["88 g CO2 kaç moldür?"] }),
  candidate({ id: "p16a", title: "Mol köprüsü", documentId: "pdf-16", fileName: "pdf-16.pdf", pages: [1], summary: "Mol tekrarı, 36 g su 2 mol" }),
  candidate({ id: "p16b", title: "Tepkime denkleştirme", documentId: "pdf-16", fileName: "pdf-16.pdf", pages: [3], summary: "En küçük tam sayılı katsayılar" }),
  candidate({ id: "p16c", title: "Tepkime türleri", documentId: "pdf-16", fileName: "pdf-16.pdf", pages: [5], summary: "Yanma, sentez, analiz, çökelme" }),
  candidate({ id: "p16d", title: "Stokiyometri", documentId: "pdf-16", fileName: "pdf-16.pdf", pages: [6, 7], summary: "Mol oranından kütle ve hacim" }),
  candidate({ id: "p16e", title: "Sınırlayıcı bileşen ve artan madde", documentId: "pdf-16", fileName: "pdf-16.pdf", pages: [8, 9], summary: "Sınırlayıcı bileşen ve artan madde" }),
  candidate({ id: "p16f", title: "Verim", documentId: "pdf-16", fileName: "pdf-16.pdf", pages: [10], summary: "Teorik verim, gerçek verim, yüzde verim" }),
  candidate({ id: "p16g", title: "Çözeltiler, molarite ve seyreltme", documentId: "pdf-16", fileName: "pdf-16.pdf", pages: [11, 13], summary: "Molarite ve seyreltme" }),
  candidate({ id: "p16h", title: "Asitler, bazlar ve pH", documentId: "pdf-16", fileName: "pdf-16.pdf", pages: [14, 16], summary: "pH ve nötralleşme" }),
  candidate({ id: "syl1", title: "Ara Sınav", documentId: "syllabus", fileName: "ders-konulari.docx", pages: [1], summary: "18 Ekim 2026 ara sınav duyurusu" }),
  candidate({ id: "syl2", title: "Mol kavramı ve Avogadro sayısı", documentId: "syllabus", fileName: "ders-konulari.docx", pages: [1] }),
];

const CHEMISTRY_DOCS: MaterialDocument[] = [
  { documentId: "foto-1", fileName: "foto-1.jpg", text: "Mol kavramı. 1 mol 6,02 çarpı 10^23 taneciktir." },
  { documentId: "foto-2", fileName: "foto-2.jpg", text: "NK'da 22,4 L. PV = nRT." },
  { documentId: "foto-3", fileName: "foto-3.jpg", text: "Sınırlayıcı bileşen tamamen tükenir." },
  { documentId: "slayt-1", fileName: "slayt-1.pptx", text: "Kimyasal tepkimeler ve denkleştirme." },
  { documentId: "slayt-2", fileName: "slayt-2.pptx", text: "Çözeltiler, derişim ve asit baz." },
  { documentId: "pdf-12", fileName: "pdf-12.pdf", text: "Bölüm 1-4 ders notu. Katlı oranlar sayfa 10." },
  { documentId: "pdf-16", fileName: "pdf-16.pdf", text: "Bölüm 5-8 ders notu. Stokiyometri ve çözeltiler." },
  { documentId: "syllabus", fileName: "ders-konulari.docx", text: SYLLABUS },
];

const LAW_SYLLABUS = `
Anayasa Hukuku — Sınav Konuları
Sınav tarihi
12 Ocak 2027
Sınav konuları ve ağırlıkları
1
1876 Kanun-i Esasi
İlk anayasa, padişah ve meclis
%20
Normal
2
1921 Teşkilat-ı Esasiye
Milli egemenlik ve meclis hükümeti
%25
Sınavda ağırlıklı
3
1924 Anayasası
Güçler birliği ve temel haklar
%20
Normal
4
1961 Anayasası
Anayasa mahkemesi ve sosyal haklar
%25
Sınavda ağırlıklı
5
İdare hukuku
İdarenin yargısal denetimi
%10
Normal
Kapsam notları
• 1921 Anayasası'nın geçici maddeleri sınav kapsamı dışındadır.
`.trim();

describe("syllabus detection", () => {
  it("reads a chemistry outline and ignores a solutions chapter", () => {
    expect(isSyllabusText(SYLLABUS)).toBe(true);
    expect(isSyllabusText("Kütlece yüzde: 20 g şeker + 80 g su = %20. Molarite 0,4 M.")).toBe(false);
    expect(parseExamDate(SYLLABUS)).toBe("2026-10-18");
    const rows = parseSyllabusRows(SYLLABUS);
    expect(rows.map((row) => row.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.find((row) => row.index === 6)?.weightPercent).toBe(25);
    expect(rows.filter((row) => row.examHeavy).map((row) => row.index)).toEqual([1, 2, 6]);
  });

  it("reads an English course outline", () => {
    const text = `
Constitutional Law syllabus
Exam date
3 March 2027
Exam topics and weights
1
Magna Carta
Limits on the crown
%15
Normal
2
Bill of Rights 1689
Parliamentary supremacy
%40
Heavily weighted
3
Act of Union
Creation of Great Britain
%20
Normal
Scope of the exam
• The law of multiple proportions is out of scope.
`.trim();
    expect(isSyllabusText(text)).toBe(true);
    expect(parseExamDate(text)).toBe("2027-03-03");
    expect(parseSyllabusRows(text).map((row) => row.weightPercent)).toEqual([15, 40, 20]);
    expect(parseSyllabusRows(text)[1]?.examHeavy).toBe(true);
  });
});

describe("non-content sections", () => {
  it("drops recap, mistakes and exam logistics, not a real topic that mentions a mistake", () => {
    expect(isNonContentSection("Özet ve Sık Yapılan Hatalar")).toBe(true);
    expect(isNonContentSection("Genel Tekrar ve Karma Örnekler")).toBe(true);
    expect(isNonContentSection("Ara Sınav")).toBe(true);
    expect(isNonContentSection("Common mistakes")).toBe(true);
    expect(isNonContentSection("Chapter review")).toBe(true);
    expect(isNonContentSection("Mol kavramı ve Avogadro sayısı")).toBe(false);
    expect(isNonContentSection("Sınırlayıcı bileşen")).toBe(false);
  });
});

describe("chemistry consolidation", () => {
  const result = consolidateMaterials({
    candidates: CHEMISTRY_CANDIDATES,
    documents: CHEMISTRY_DOCS,
  });

  it("merges fragmented files into the syllabus topics and keeps sources", () => {
    expect(result.topics.length).toBeGreaterThanOrEqual(6);
    expect(result.topics.length).toBeLessThanOrEqual(9);
    const titles = result.topics.map((topic) => topic.title);
    expect(titles.some((title) => /stokiyometri/i.test(title))).toBe(true);
    expect(titles.some((title) => /çözelti/i.test(title))).toBe(true);
    expect(titles.some((title) => /asit/i.test(title))).toBe(true);
    expect(titles.some((title) => /gaz|molar hacim/i.test(title))).toBe(true);
    expect(titles.filter((title) => /mol kavramı|mol kütlesi/i.test(title))).toHaveLength(2);
    const stoich = result.topics.find((topic) => /stokiyometri/i.test(topic.title));
    expect(stoich?.sourceCount).toBeGreaterThanOrEqual(2);
    expect(stoich?.sections.map((section) => section.title).join(" ")).toMatch(/sınırlayıcı|verim/i);
    const mol = result.topics.find((topic) => /mol kavramı/i.test(topic.title));
    expect(mol?.sourceCount).toBeGreaterThanOrEqual(2);
  });

  it("does not keep recap, the exam notice, or the out-of-scope law as topics", () => {
    const titles = result.topics.map((topic) => topic.title).join(" | ");
    expect(titles).not.toMatch(/özet ve sık|genel tekrar|ara sınav|katlı oranlar/i);
    expect(result.foldedNonTopics).toEqual(
      expect.arrayContaining(["Özet ve Sık Yapılan Hatalar", "Genel Tekrar ve Karma Örnekler"]),
    );
    expect(result.excluded.some((note) => /katlı oranlar/i.test(note.title))).toBe(true);
    expect(result.excluded.some((note) => /müfredat/i.test(note.reason))).toBe(true);
    const reactions = result.topics.find((topic) => /tepkimeler/i.test(topic.title));
    expect(reactions?.commonMistakes.join(" ")).toMatch(/kütle oranı/i);
  });

  it("stores weights and does not invent a topic the notes never teach", () => {
    const stoich = result.topics.find((topic) => /stokiyometri/i.test(topic.title));
    const laws = result.topics.find((topic) => /temel kanun/i.test(topic.title));
    expect(stoich?.weightPercent).toBe(25);
    expect(stoich?.examHeavy).toBe(true);
    expect(laws?.weightPercent).toBe(5);
    expect(laws?.examHeavy).toBe(false);
    expect(laws?.sections.map((section) => section.title).join(" ")).toMatch(/kütlenin korunumu/i);
    const acids = result.topics.find((topic) => /asitler ve bazlar/i.test(topic.title));
    expect(acids?.sections.map((section) => section.title).join(" ")).toMatch(/pH/);
    expect(result.suggestedExamDate).toBe("2026-10-18");
    expect(result.missingFromMaterials).toEqual([]);
    expect(result.topics.every((topic) => topic.sources.length > 0)).toBe(true);
  });

  it("teaches mol before stoichiometry and gives the heavy topic more practice", () => {
    const molAt = result.topics.findIndex((topic) => /mol kavramı/i.test(topic.title));
    const stoichAt = result.topics.findIndex((topic) => /stokiyometri/i.test(topic.title));
    expect(molAt).toBeGreaterThanOrEqual(0);
    expect(stoichAt).toBeGreaterThan(molAt);

    const schedule = result.topics.map((topic) => ({
      id: topic.title,
      title: topic.title,
      prerequisites: topic.prerequisites,
      pageNumbers: topic.pages,
      weightPercent: topic.weightPercent,
      examHeavy: topic.examHeavy,
      priority: priorityFromWeight(topic),
    }));
    const plan = buildExamScheduleV2({
      daysToExam: 23,
      dailyMinutes: 45,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics: schedule,
      fromDate: new Date("2026-09-25T12:00:00"),
    });
    const learnOrder = plan.sessions.filter((session) => session.role === "learn").map((session) => session.topicTitle);
    expect(learnOrder.indexOf(schedule[molAt].title)).toBeLessThan(
      learnOrder.indexOf(schedule[stoichAt].title),
    );
    const practice = (pattern: RegExp) =>
      plan.sessions.filter((session) => pattern.test(session.topicTitle) && session.role === "practice").length;
    expect(practice(/stokiyometri/i)).toBeGreaterThan(practice(/temel kanun/i));
    const learnCounts = new Map<string, number>();
    for (const session of plan.sessions.filter((item) => item.role === "learn")) {
      learnCounts.set(session.topicTitle, (learnCounts.get(session.topicTitle) ?? 0) + 1);
    }
    expect([...learnCounts.values()].every((count) => count === 1)).toBe(true);
    expect(extraPracticeForTopic({ weightPercent: 25, examHeavy: true }, 23)).toBe(2);
    expect(extraPracticeForTopic({ weightPercent: 5 }, 23)).toBe(0);
    expect(extraPracticeForTopic({ weightPercent: 25, examHeavy: true }, 5)).toBe(0);
  });
});

describe("law syllabus — not a chemistry special case", () => {
  const notes: MaterialCandidate[] = [
    candidate({
      id: "n1",
      title: "1876 Kanun-i Esasi",
      documentId: "notes",
      fileName: "notlar.pdf",
      summary: "Padişah, Heyet-i Ayan ve Heyet-i Mebusan",
    }),
    candidate({
      id: "n2",
      title: "Kanun-i Esasi ve meşrutiyet",
      documentId: "slides",
      fileName: "slayt.pptx",
      summary: "1876 Kanun-i Esasi, birinci meşrutiyet",
    }),
    candidate({
      id: "n3",
      title: "1924 Anayasası",
      documentId: "notes",
      fileName: "notlar.pdf",
      summary: "Güçler birliği, 1924 Teşkilat-ı Esasiye",
    }),
    candidate({
      id: "n4",
      title: "1961 Anayasası",
      documentId: "notes",
      fileName: "notlar.pdf",
      summary: "Anayasa Mahkemesi kurulur",
    }),
    candidate({
      id: "n5",
      title: "1921 Teşkilat-ı Esasiye",
      documentId: "notes",
      fileName: "notlar.pdf",
      summary: "Milli egemenlik ve meclis hükümeti",
    }),
    candidate({
      id: "n5b",
      title: "1921 Teşkilat-ı Esasiye'nin geçici maddeleri",
      documentId: "notes",
      fileName: "notlar.pdf",
      summary: "Geçici maddeler sınavda yok",
    }),
    candidate({
      id: "n6",
      title: "Özet ve sık yapılan hatalar",
      documentId: "notes",
      fileName: "notlar.pdf",
      summary: "1921 ile 1924'ü karıştırmak",
      commonMistakes: ["1921 ile 1924 aynı metin değildir"],
    }),
  ];

  it("merges the duplicate constitution, excludes the temporary articles, and flags the missing course", () => {
    const result = consolidateMaterials({
      candidates: notes,
      documents: [
        { documentId: "syllabus", fileName: "izlence.docx", text: LAW_SYLLABUS },
        { documentId: "notes", fileName: "notlar.pdf", text: "1876 ve 1924 anlatılır." },
        { documentId: "slides", fileName: "slayt.pptx", text: "Kanun-i Esasi slaytları." },
      ],
    });
    expect(result.suggestedExamDate).toBe("2027-01-12");
    const titles = result.topics.map((topic) => topic.title);
    expect(titles.filter((title) => /1876|kanun-i esasi/i.test(title))).toHaveLength(1);
    const esasi = result.topics.find((topic) => /1876|kanun-i esasi/i.test(topic.title));
    expect(esasi?.sourceCount).toBe(2);
    expect(titles.join(" ")).not.toMatch(/geçici maddeler/i);
    expect(result.excluded.some((note) => /geçici maddeler/i.test(note.title + note.reason))).toBe(true);
    expect(result.missingFromMaterials.map((topic) => topic.title)).toEqual(["İdare hukuku"]);
    expect(result.topics.find((topic) => /1921/i.test(topic.title))?.examHeavy).toBe(true);
    expect(result.foldedNonTopics).toEqual(["Özet ve sık yapılan hatalar"]);
  });
});

describe("single file stays a list of its own chapters", () => {
  it("does not collapse distinct chapters and still folds a recap", () => {
    const result = consolidateMaterials({
      candidates: [
        candidate({ id: "a", title: "Fotosentez", documentId: "bio", fileName: "biyoloji.pdf", pages: [1] }),
        candidate({ id: "b", title: "Hücre zarı", documentId: "bio", fileName: "biyoloji.pdf", pages: [4] }),
        candidate({ id: "c", title: "Solunum", documentId: "bio", fileName: "biyoloji.pdf", pages: [8] }),
        candidate({ id: "d", title: "Özet ve Sık Yapılan Hatalar", documentId: "bio", fileName: "biyoloji.pdf", pages: [12], commonMistakes: ["Klorofili kan sanmak"] }),
      ],
      documents: [{ documentId: "bio", fileName: "biyoloji.pdf", text: "Fotosentez, hücre zarı ve solunum anlatılır." }],
    });
    expect(result.topics.map((topic) => topic.title)).toEqual(["Fotosentez", "Hücre zarı", "Solunum"]);
    expect(result.topics[0]?.commonMistakes).toEqual(["Klorofili kan sanmak"]);
    expect(result.syllabusDocumentId).toBeNull();
  });

  it("merges a model decision without dropping the other topic", () => {
    const result = consolidateMaterials({
      candidates: [
        candidate({ id: "a", title: "Hücre zarı", documentId: "bio", fileName: "a.pdf" }),
        candidate({ id: "b", title: "Hücre zan", documentId: "photo", fileName: "b.jpg", summary: "Zar yapısı" }),
        candidate({ id: "c", title: "Solunum", documentId: "bio", fileName: "a.pdf" }),
      ],
      documents: [
        { documentId: "bio", fileName: "a.pdf", text: "Hücre zarı ve solunum." },
        { documentId: "photo", fileName: "b.jpg", text: "Zar." },
      ],
    });
    const merged = applyClusterMerges(result.topics, [["Hücre zarı", "Hücre zan"]]);
    expect(merged).toHaveLength(2);
    expect(merged.find((topic) => /hücre/i.test(topic.title))?.sourceCount).toBe(2);
  });
});
