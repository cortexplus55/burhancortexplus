// @vitest-environment jsdom
/**
 * Paket I (30 Ekim 2026) — belge sürümü ve konu dışı belge fark edilir.
 *
 * Canlı stres testi: oranı başka yazan eski kopya yüklemede işaretlenmedi, öğretmen iki değeri de verdi;
 * başka dersin rehberi konuya dönüşmedi ama uyarı da çıkmadı ve haritayı değiştirdi. Örnekler üç farklı
 * dersten; kodda ders adı ya da terim yok.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  checkMaterialSet,
  detectUnrelatedDocuments,
  detectVersionPairs,
  periodMarks,
  versionNotice,
  type SimilarityDocument,
} from "@/lib/documents/material-similarity";
import {
  applyEquivalenceVerdicts,
  assignContradictions,
  formatContradictions,
  relateClaims,
  type ContradictionDocument,
} from "@/lib/learning/source-contradictions";
import {
  MaterialNotesCard,
  droppedByChoices,
  freshMaterialNotes,
  materialNoteKeys,
} from "@/components/parity/material-notes-card";

const read = (path: string) => readFileSync(path, "utf8");

function doc(
  documentId: string,
  fileName: string,
  pages: string[],
  createdAt: string | null = null,
): SimilarityDocument {
  return { documentId, fileName, createdAt, pages: pages.map((text, index) => ({ pageNumber: index + 1, text })) };
}

/* ───────── Muhasebe notu: iki sürüm (dönem ve oran farklı) ───────── */

function accounting(period: string, rate: string): string[] {
  return [
    `Genel Muhasebe Ders Notu — ${period} Öğretim Yılı\nMuhasebenin temel kavramları işletmenin varlıklarını ve kaynaklarını izler. Varlıklar dönen ve duran varlıklar olarak ikiye ayrılır; kaynaklar yabancı kaynaklar ve özkaynaklardan oluşur. Bilanço eşitliği varlıkların kaynaklara eşit olmasını söyler ve her kayıt bu eşitliği korur.`,
    `Mizan, büyük defterdeki hesapların borç ve alacak toplamlarını ve kalanlarını gösteren çizelgedir. Genel geçici mizan dönem sonu işlemlerinden önce, kesin mizan dönem sonu işlemlerinden sonra düzenlenir. Mizanda borç toplamı alacak toplamına eşit olmalıdır; eşit değilse kayıt hatası aranır.`,
    `Tekdüzen hesap planı hesapları sınıf, grup ve hesap düzeyinde kodlar. Dönen varlıklar birinci sınıfta, duran varlıklar ikinci sınıfta yer alır. Katma değer vergisi genel oranı yüzde ${rate} olarak uygulanır; satış faturasında hesaplanan katma değer vergisi hesabına alacak kaydedilir.`,
    `Amortisman duran varlığın maliyetinin faydalı ömrüne dağıtılmasıdır. Normal amortismanda her yıl aynı tutar ayrılır; azalan bakiyeler yönteminde oran normal oranın iki katıdır ve kalan değer üzerinden hesaplanır. Örnek: maliyeti yüz bin lira olan makinenin faydalı ömrü beş yıldır.`,
  ];
}

/* ───────── Veri yapıları: not + slayt (aynı ders), bitki rehberi (ilgisiz) ───────── */

const DS_NOTES = [
  "Bağlı liste düğümlerden oluşur; her düğüm veri alanını ve sonraki düğümün işaretçisini tutar. Bağlı listede ekleme ve silme işaretçi değiştirerek yapılır. Dizide indis ile erişim sabit zamanlıdır, bağlı listede ise düğümler baştan dolaşılır.",
  "Yığın son giren ilk çıkar ilkesiyle çalışır. Push işlemi yığının tepesine eleman ekler, pop işlemi tepedeki elemanı çıkarır. Yığın dizi ya da bağlı liste ile gerçeklenir; fonksiyon çağrıları ve ifade değerlendirme yığın kullanır.",
  "Kuyruk ilk giren ilk çıkar ilkesiyle çalışır. Enqueue kuyruğun sonuna eleman ekler, dequeue baştaki elemanı çıkarır. Dairesel dizi ile gerçeklenen kuyrukta baş ve son indisleri modüler aritmetikle ilerler.",
  "Hash tablosu anahtarı hash fonksiyonuyla dizinin bir indisine eşler. Çakışma iki anahtarın aynı indise düşmesidir; zincirleme yönteminde her indiste bir bağlı liste tutulur, açık adreslemede boş indis aranır. Yük faktörü tablonun doluluk oranıdır.",
  "Sıralama algoritmaları: seçmeli sıralama her adımda en küçük elemanı seçer, ekleme sıralaması elemanı sıralı kısma yerleştirir, hızlı sıralama pivot ile böler, birleştirme sıralaması dizileri böler ve birleştirir. Zaman karmaşıklığı büyük O gösterimiyle ifade edilir.",
];
const DS_SLIDES = [
  "Yığın Veri Yapısı\nSon giren ilk çıkar. Push tepeye ekler, pop tepeden çıkarır. Yığın dizi ya da bağlı liste ile gerçeklenir. Fonksiyon çağrıları yığın kullanır.",
  "Kuyruk Veri Yapısı\nİlk giren ilk çıkar. Enqueue sona ekler, dequeue baştan çıkarır. Dairesel dizi ile kuyruk; baş ve son indisleri modüler ilerler.",
  "Hash Tablosu\nHash fonksiyonu anahtarı indise eşler. Çakışma: zincirleme ile bağlı liste, açık adresleme ile boş indis. Yük faktörü doluluk oranı.",
  "Sıralama Algoritmaları\nSeçmeli sıralama, ekleme sıralaması, hızlı sıralama ve birleştirme sıralaması. Pivot ile bölme. Zaman karmaşıklığı büyük O gösterimi.",
  "Bağlı Liste\nDüğüm veri ve sonraki düğümün işaretçisini tutar. Ekleme ve silme işaretçi değiştirerek yapılır. Dizide indis ile sabit zamanlı erişim.",
];
const PLANT_GUIDE = [
  "Domates fidesi güneşli bir yere dikilir; toprak süzek ve organik maddece zengin olmalıdır. Fide dikiminden önce toprak bellenir ve yanmış gübre karıştırılır. Fideler arasında elli santim mesafe bırakılır.",
  "Sulama sabah erken saatlerde yapılır; yaprakların ıslanmasından kaçınılır. Damla sulama domates fidesi için en uygun yöntemdir. Toprak nemi parmakla kontrol edilir, kuru toprak sulanır.",
  "Gübreleme çiçeklenme öncesinde azotlu gübreyle, meyve döneminde potasyumlu gübreyle yapılır. Kompost toprağın yapısını iyileştirir. Yaprak sararması azot eksikliğini gösterebilir.",
  "Budama yan sürgünleri alarak meyve verimini artırır. Domates bitkisi kazıkla desteklenir. Yaprak biti ve beyaz sinek zararlıları için sarımsaklı su ve sabunlu su spreyi kullanılır.",
  "Hasat meyve rengini aldığında yapılır. Olgun domates serin ve gölge bir yerde saklanır. Tohum almak için iyi gelişmiş meyveler seçilir, tohumlar yıkanıp kurutulur.",
];

/* ───────── Biyoloji notu: aynı dosya iki kez ───────── */

const BIOLOGY = [
  "Mitoz bölünmede bir hücreden kalıtsal olarak aynı iki hücre oluşur. Profaz evresinde kromozomlar belirginleşir, metafazda ekvatoral düzlemde dizilir, anafazda kardeş kromatitler kutuplara çekilir, telofazda çekirdek zarı yeniden oluşur.",
  "Mayoz bölünmede kromozom sayısı yarıya iner ve dört hücre oluşur. Krossing over profaz bir evresinde homolog kromozomlar arasında parça değişimidir ve kalıtsal çeşitliliği artırır.",
  "Hücre döngüsünün kontrol noktaları bölünmenin doğru ilerlemesini denetler. G1 kontrol noktasında hücre büyüklüğü ve hasar denetlenir; metafaz kontrol noktasında iğ ipliklerinin kromozomlara bağlanması kontrol edilir.",
];

describe("Paket I-10.1 — aynı belgenin iki sürümü", () => {
  it("muhasebe: dönemi 2025-2026 olan güncel önerilir; oran farkı metnin küçük bir kısmı", () => {
    const old = doc("v1", "muhasebe-eski.pdf", accounting("2022-2023", "18"), "2026-10-29T10:00:00Z");
    const fresh = doc("v2", "muhasebe.pdf", accounting("2025-2026", "20"), "2026-10-20T10:00:00Z");
    const [pair] = detectVersionPairs([old, fresh], { now: new Date("2026-10-30") });
    expect(pair).toMatchObject({ currentId: "v2", olderId: "v1", basis: "period", identical: false, currentPeriod: "2025-2026" });
    expect(pair!.similarity).toBeGreaterThan(0.6);
    const notice = versionNotice(pair!);
    expect(notice).toContain("iki sürümü");
    expect(notice).toContain("2025-2026");
  });

  it("dönem yazılı değilse yükleme zamanı; aynı dosya iki kez → 'aynı belge'", () => {
    const first = doc("b1", "biyoloji.pdf", BIOLOGY, "2026-10-01T08:00:00Z");
    const second = doc("b2", "biyoloji (1).pdf", BIOLOGY, "2026-10-28T08:00:00Z");
    const [pair] = detectVersionPairs([first, second]);
    expect(pair).toMatchObject({ currentId: "b2", olderId: "b1", basis: "upload", identical: true });
    expect(versionNotice(pair!)).toContain("aynı belge");
  });

  it("aynı dersin farklı belgeleri (not ve slayt) sürüm sayılmaz; tek belgede bakılmaz", () => {
    const notes = doc("n", "notlar.pdf", DS_NOTES);
    const slides = doc("s", "slaytlar.pptx", DS_SLIDES);
    expect(detectVersionPairs([notes, slides])).toEqual([]);
    expect(checkMaterialSet([notes])).toEqual({ versions: [], unrelated: [] });
  });

  it("dönem işareti: öğretim yılı, yarıyıl, tarih, güncelleme; tarih anlatan metindeki eski yıllar dönem değil", () => {
    expect(periodMarks("2025-2026 Güz yarıyılı", 2027).map((mark) => mark.value)).toContain(2026);
    expect(periodMarks("Bahar 2026 dönemi", 2027)[0]!.value).toBeCloseTo(2026.25);
    expect(periodMarks("Son güncelleme: 2025", 2027).map((mark) => mark.value)).toContain(2025);
    expect(periodMarks("Cumhuriyet 1923 yılında, anayasa 1982 yılında kabul edildi.", 2027)).toEqual([]);
    expect(periodMarks("2031-2032 planı", 2027)).toEqual([]);
  });
});

describe("Paket I-10.2 — konu dışı belge", () => {
  it("veri yapıları kursundaki bitki rehberi ilgisiz görünür; not ve slayt birbirine benzer", () => {
    const set = [doc("n", "notlar.pdf", DS_NOTES), doc("s", "slaytlar.pptx", DS_SLIDES), doc("p", "bahce-rehberi.pdf", PLANT_GUIDE)];
    const unrelated = detectUnrelatedDocuments(set, { subject: "Veri Yapıları" });
    expect(unrelated.map((item) => item.documentId)).toEqual(["p"]);
    // Ders adı verilmese de iki belge birbirini tuttuğu için üçüncüsü ilgisiz.
    expect(detectUnrelatedDocuments(set, {}).map((item) => item.documentId)).toEqual(["p"]);
  });

  it("iki belgede hangisinin konu dışı olduğunu ancak ders adı söyler", () => {
    const pairOnly = [doc("n", "notlar.pdf", DS_NOTES), doc("p", "bahce-rehberi.pdf", PLANT_GUIDE)];
    expect(detectUnrelatedDocuments(pairOnly, {})).toEqual([]);
    expect(detectUnrelatedDocuments(pairOnly, { subject: "Veri Yapıları" }).map((item) => item.documentId)).toEqual(["p"]);
  });

  it("aynı dersin belgeleri ilgisiz sayılmaz (muhasebe iki sürüm + biyoloji ayrı ders değil, kısa belge yargılanmaz)", () => {
    const accountingSet = [
      doc("v1", "muhasebe-eski.pdf", accounting("2022-2023", "18")),
      doc("v2", "muhasebe.pdf", accounting("2025-2026", "20")),
    ];
    expect(checkMaterialSet(accountingSet, { subject: "Muhasebe" }).unrelated).toEqual([]);
    const shortPhoto = doc("f", "foto.jpg", ["Mitoz evreleri tablosu."]);
    expect(detectUnrelatedDocuments([doc("b", "biyoloji.pdf", BIOLOGY), shortPhoto], { subject: "Biyoloji" })).toEqual([]);
  });
});

describe("Paket I-10.3 — çelişki yalnız değer farklıysa; eski sürüm 'eski sürüm' diye anlatılır", () => {
  const definitions = (documentId: string, fileName: string, value: string): ContradictionDocument => ({
    documentId,
    fileName,
    definitions: [{ term: "Katma değer vergisi oranı", definition: value, pageNumbers: [3] }],
    formulas: [],
  });
  const topics = [{ title: "Tekdüzen Hesap Planı", sources: [{ documentId: "v1", pages: [3] }, { documentId: "v2", pages: [3] }] }];

  it("Paket H doğrulaması: iki kaynak da %20 diyorsa uyarı yok", () => {
    expect(relateClaims("Genel oran %20 olarak uygulanır.", "Genel oran %20 olarak uygulanır.")).toBe("same");
    const same = assignContradictions(topics, [definitions("v1", "a.pdf", "Genel oran %20."), definitions("v2", "b.pdf", "Genel oran %20.")]);
    expect(same.byTitle.size).toBe(0);
  });

  it("sürüm çifti varsa eski değer çelişki değil, güncel sürümün değeri söylenir", () => {
    const assignment = assignContradictions(topics, [
      definitions("v1", "muhasebe-eski.pdf", "Genel oran %18 olarak uygulanır."),
      definitions("v2", "muhasebe.pdf", "Genel oran %20 olarak uygulanır."),
    ]);
    // Yüzde birimsiz sayı: kod "aday" der, model "bağdaşmıyor" derse yazılır (canlıdaki akış).
    expect(assignment.candidates).toHaveLength(1);
    const items = applyEquivalenceVerdicts(assignment, ["conflict"]).byTitle.get("Tekdüzen Hesap Planı") ?? [];
    expect(items).toHaveLength(1);
    expect(formatContradictions(items)).toContain("kaynaklar çelişiyor");
    const versioned = formatContradictions(items, { versions: [{ currentId: "v2", olderId: "v1" }] });
    expect(versioned).toContain("eski sürüm");
    expect(versioned).toContain("güncel sürüm muhasebe.pdf «Genel oran %20 olarak uygulanır.»");
    expect(versioned).not.toContain("kaynaklar çelişiyor");
  });
});

describe("Paket I-10.1/10.2 — kurulumda bir kez sorulur", () => {
  afterEach(() => cleanup());

  const raw = {
    versions: [{ currentId: "v2", olderId: "v1", identical: false, message: "İki sürüm gibi görünüyor." }],
    unrelated: [{ documentId: "p", message: "\"bahce.pdf\" ilgisiz görünüyor; konu haritasına almadık." }],
  };

  it("not yalnız listede duran ve sorulmamış belgeler için; karar bir kez", () => {
    const notes = freshMaterialNotes(raw, ["v1", "v2", "p"], []);
    expect(notes.versions).toHaveLength(1);
    expect(notes.unrelated).toHaveLength(1);
    expect(freshMaterialNotes(raw, ["v2", "p"], []).versions).toEqual([]);
    expect(freshMaterialNotes(raw, ["v1", "v2", "p"], materialNoteKeys(notes))).toEqual({ versions: [], unrelated: [] });
  });

  it("varsayılan: güncel sürüm kalır, ilgisiz belge haritaya girmez; 'İkisini de' ve 'Yine de dahil et' seçilebilir", () => {
    const notes = freshMaterialNotes(raw, ["v1", "v2", "p"], []);
    expect(droppedByChoices(notes, ["current"], []).sort()).toEqual(["p", "v1"]);
    expect(droppedByChoices(notes, ["both"], ["p"])).toEqual([]);
    expect(droppedByChoices(notes, ["older"], [])).toEqual(["v2", "p"]);

    const applied: string[][] = [];
    render(
      createElement(MaterialNotesCard, {
        notes,
        nameOf: (id: string) => ({ v1: "eski.pdf", v2: "yeni.pdf", p: "bahce.pdf" })[id] ?? id,
        onApply: (drop: string[]) => applied.push(drop),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /İkisini de kullan/ }));
    fireEvent.click(screen.getByRole("button", { name: /Yine de dahil et/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bu seçimle devam et/ }));
    expect(applied).toEqual([[]]);
  });

  it("sihirbaz materyal adımından çıkarken denetimi sorar ve kartı gösterir", () => {
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain("/api/learning/exam-prep/material-check");
    expect(wizard).toContain("<MaterialNotesCard");
    expect(wizard).toContain("continueFromMaterial");
    const route = read("src/app/api/learning/exam-prep/material-check/route.ts");
    expect(route).toContain("readMaterialCheck");
    expect(route).not.toMatch(/generateJson|reserveCredits/);
    const intake = read("src/app/api/learning/exam-prep/intake/route.ts");
    expect(intake).toContain("formatContradictions(contradictionMap.get(topic.title) ?? [], { versions })");
  });
});
