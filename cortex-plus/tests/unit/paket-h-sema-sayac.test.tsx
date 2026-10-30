// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("openai", () => ({ default: class {} }));
vi.mock("@/lib/ai/moderation", () => ({ moderate: async () => ({ action: "allow" }) }));
vi.mock("@/lib/env", () => ({ env: { OPENAI_CONTENT_MODEL: "luna", OPENAI_ADVANCED_MODEL: "big" } }));

import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import type { LessonV3 } from "@/lib/learning/lesson-v3";
import { FIGURE_READ_PROMPT, appendFigureTranscript, figureTranscript } from "@/lib/documents/extract-image-text";
import {
  FIGURE_APPENDIX_LABEL,
  figureHintLines,
  figureHintsFromRows,
  isDataLine,
} from "@/lib/learning/figure-pages";
import {
  figureHintsFor,
  figureSourceFor,
  hintAtoms,
  hintMatchesText,
  isFigurePage,
  planFigureSources,
  type SourceDocRef,
} from "@/lib/learning/source-preview";
import { lessonStepCounter } from "@/lib/learning/activity-duration";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/*
  Paket H (29 Ekim 2026): belgedeki şema kartı ve ders adım sayacı.

  Şema: "şekil sayfası" kararı görselden değil metinden türüyordu — kelime kapısı + metni geri yazan
  şekil istemi + yalnız mazereti süzen `figureTranscript`; içindekiler sayfası bile ek alıyor, kart
  konunun ilk sayfasında şekilsiz açılıyordu. Şimdi ek yalnız yeni bilgi taşır, sayfa ancak veri
  taşıyan yeni satırla şekil sayfasıdır, kart değeri anan ekranda ve ders başına bir kez.

  Sayaç: payda üç kaynaktan geliyordu ve üçü farklı sayı üretiyordu ("2/7" sonra "3/9"). Yazım
  sürerken payda yok; mühürde ilk toplam kilitli.
*/

const read = (path: string) => readFileSync(path, "utf8");

/* ───────────── 1. Şekil okuması: metin katmanının tekrarı eke girmez ───────────── */

describe("Paket H · şekil okuması metni tekrar yazmaz", () => {
  it("tarih: içindekiler sayfasının satırlarını geri yazan okuma boş döner, ek yazılmaz", () => {
    const textLayer = "İÇİNDEKİLER\n1. Anayasacılık Tarihi\n2. Devlet Organları Şeması\n3. Kronoloji Grafiği\n4. Temel Haklar";
    const modelReply = "İçindekiler\n1. Anayasacılık Tarihi\n2. Devlet Organları Şeması\n3. Kronoloji Grafiği\n4. Temel Haklar";
    expect(figureTranscript(modelReply, { textLayer })).toBeNull();
    expect(appendFigureTranscript(textLayer, figureTranscript(modelReply, { textLayer }))).toBe(textLayer);
  });

  it("matematik: paragrafı tekrarlayan satır düşer, grafiğin değerleri kalır", () => {
    const textLayer = "f ve g fonksiyonlarının grafiği aşağıda verilmiştir. Grafiği kullanarak soruları çözünüz.";
    const reply = "f ve g fonksiyonlarının grafiği aşağıda verilmiştir.\nf(−1) = 4\ng(2) = 0\n(0, 3)";
    expect(figureTranscript(reply, { textLayer })).toBe("f(−1) = 4\ng(2) = 0\n(0, 3)");
    // Metin katmanı verilmezse eski davranış: yalnız mazeret düşer.
    expect(figureTranscript("Şekil burada görünmediği için belirlenemez.\ng(2) = 0")).toBe("g(2) = 0");
  });

  it("istem düz metni tekrar yazmamayı söyler; sonuç şekil okumasını işaretler", () => {
    expect(FIGURE_READ_PROMPT).toContain("Sayfanın düz metnini tekrar yazma");
    expect(FIGURE_READ_PROMPT).toContain("yalnız şekil, grafik, eksen, ok, etiket ve tablo değerlerini yaz");
    const source = read("src/lib/documents/extract-image-text.ts");
    expect(source).toContain("figureRead?: boolean");
    expect(source).toContain('figureTranscript(raw, { textLayer: options?.textLayer })');
    // Metin katmanı iki yoldan da gider: PDF metin katmanı ve Office sayfası.
    expect(read("src/lib/documents/pdf-ingestion.ts")).toContain("textLayer: keepText ?? null");
    expect(read("src/lib/documents/office-figures.ts")).toContain("textLayer: pages[image.pageIndex] ?? null");
  });
});

/* ───────────── 2. Şekil sayfası kararı: ek veri taşımalı ve yeni olmalı ───────────── */

const withAppendix = (body: string, lines: string[]) => `${body}\n\n${FIGURE_APPENDIX_LABEL}\n${lines.join("\n")}`;

describe("Paket H · şekil sayfası ekten değil ekin içeriğinden", () => {
  it("tarih: 'şeması, kronoloji' geçen içindekiler sayfası ek metnin tekrarıysa şekil sayfası DEĞİL", () => {
    const toc = "İÇİNDEKİLER\n1. Anayasacılık Tarihi\n2. Devlet Organları Şeması\n3. Kronoloji Grafiği";
    expect(figureHintLines(withAppendix(toc, ["1. Anayasacılık Tarihi", "2. Devlet Organları Şeması", "Kronoloji grafiği"]))).toBeNull();
    // Ek yoksa da değil.
    expect(figureHintLines(toc)).toBeNull();
  });

  it("tarih: zaman çizelgesinin yeni yıl→olay satırları şekil sayfasıdır", () => {
    const page = withAppendix("Osmanlı-Türk anayasa gelişmeleri zaman çizelgesi.", [
      "1876 → Kanun-i Esasi",
      "1921 → Teşkilat-ı Esasiye Kanunu",
      "1924 → Cumhuriyet Anayasası",
    ]);
    expect(figureHintLines(page)).toEqual(["1876 → Kanun-i Esasi", "1921 → Teşkilat-ı Esasiye Kanunu", "1924 → Cumhuriyet Anayasası"]);
  });

  it("matematik: PDF s.3 grafik ekinde 'f(−1) = 4' → şekil sayfası; ipucu yalnız yeni satırlar", () => {
    const page = withAppendix("Fonksiyonların grafiği aşağıdadır. Grafiği okuyunuz.", [
      "Fonksiyonların grafiği aşağıdadır.",
      "f(−1) = 4",
      "g(2) = 0",
      "(0, 3)",
    ]);
    expect(figureHintLines(page)).toEqual(["f(−1) = 4", "g(2) = 0", "(0, 3)"]);
  });

  it("tıp: EKG çiziminin ek satırı (dalga sırası, aralık) şekil sayfasıdır; ilk 12 satır gider", () => {
    const lines = ["P dalgası → QRS kompleksi → T dalgası", "PR aralığı: 0,12–0,20 sn", ...Array.from({ length: 14 }, (_, i) => `Derivasyon V${i + 1}: ${i + 1} mm`)];
    const hints = figureHintLines(withAppendix("Normal EKG çizimi ve dalgaların adları.", lines));
    expect(hints).not.toBeNull();
    expect(hints).toHaveLength(12);
    expect(hints![0]).toBe("P dalgası → QRS kompleksi → T dalgası");
  });

  it("veri taşıyan satır: sayı, ok, eşitlik, koordinat, tablo; yalnız sözcük değil", () => {
    expect(isDataLine("1 → b")).toBe(true);
    expect(isDataLine("x = 3")).toBe(true);
    expect(isDataLine("(a, b)")).toBe(true);
    expect(isDataLine("| Yaş | Kilo |")).toBe(true);
    expect(isDataLine("Kronoloji grafiği")).toBe(false);
    expect(isDataLine("")).toBe(false);
  });

  it("eski kayıtlardaki sahte ek elenir; belge kümesi document_id ile ayrılır, sayfalar sıralı", () => {
    const rows = [
      { document_id: "pdf", page_number: 1, text_content: withAppendix("Devlet organları şeması ve açıklaması.", ["Devlet organları şeması"]) },
      { document_id: "pdf", page_number: 7, text_content: withAppendix("EKG", ["PR aralığı: 0,12–0,20 sn"]) },
      { document_id: "pdf", page_number: 3, text_content: withAppendix("Grafik", ["f(−1) = 4"]) },
      { document_id: "foto", page_number: 1, text_content: withAppendix("Defter", ["1 → b"]) },
      { document_id: "foto", page_number: 1, text_content: withAppendix("Defter", ["1 → b"]) },
    ];
    const byDoc = figureHintsFromRows(rows);
    expect(byDoc.get("pdf")?.map((hint) => hint.page)).toEqual([3, 7]);
    expect(byDoc.get("foto")).toEqual([{ page: 1, lines: ["1 → b"] }]);
    const page = read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx");
    expect(page).toContain('.select("document_id, page_number, text_content")');
    expect(page).toContain("figureHintsFromRows(figureRows ?? [])");
    expect(page).toContain("figurePages: figureHints.map((hint) => hint.page), figureHints");
  });
});

/* ───────────── 3. Kartın yeri: değeri anan ekran, ders başına bir kez ───────────── */

const shot = (sectionIndex: number, text: string, source?: { file: string; page?: number }) => ({
  sectionIndex,
  source,
  blocks: [{ type: "text", text }],
});

describe("Paket H · şema kartı değeri anan ekranda, aynı sayfa bir kez", () => {
  const mathDocs: SourceDocRef[] = [
    { id: "pdf", name: "trigonometri.pdf", pages: "s.3–5", figurePages: [3], figureHints: [{ page: 3, lines: ["f(−1) = 4", "g(2) = 0"] }] },
    { id: "foto", name: "defter.jpg" },
  ];

  it("ipucu parçaları: eşitlik ve sayı taşıyan yan; çıplak sayı parça değil", () => {
    expect(hintAtoms("f(−1) = 4")).toEqual(expect.arrayContaining(["f(-1)=4", "f(-1)"]));
    expect(hintAtoms("4")).toEqual([]);
    expect(hintAtoms("PR aralığı: 0,12–0,20 sn")).toEqual(expect.arrayContaining(["0,12-0,20sn", "praraligi"]));
    expect(hintMatchesText(["f(−1) = 4"], "Grafikte $f(-1) = 4$ noktası işaretli.")).toBe(true);
    expect(hintMatchesText(["f(−1) = 4"], "Bir fonksiyon her girdiye tek çıktı verir.")).toBe(false);
  });

  it("matematik, çok belgeli ders: kart yalnız grafiğin değerini anan ekranda ve bir kez", () => {
    const screens = [
      shot(0, "Bir fonksiyon her girdiye tek çıktı verir."),
      shot(1, "Grafikte f(−1) = 4 noktası işaretli: x = −1 için y = 4."),
      shot(2, "Aynı grafikte f(−1) = 4 değeri ikinci kez kullanılır."),
    ];
    const plan = planFigureSources(screens, mathDocs);
    expect([...plan.keys()]).toEqual([1]);
    expect(plan.get(1)).toEqual({ documentId: "pdf", page: 3, fileName: "trigonometri.pdf" });
    // Tek ekran için de aynı karar; çok belgeli derste null dönmez.
    expect(figureSourceFor({}, mathDocs, "Grafikte f(−1) = 4")).toEqual({ documentId: "pdf", page: 3, fileName: "trigonometri.pdf" });
    expect(figureHintsFor(plan.get(1)!, mathDocs)).toEqual(["f(−1) = 4", "g(2) = 0"]);
  });

  it("hiçbir ekran anmıyorsa açılış ekranı dışındaki ilk ekran; adımın kendi kaynağı şekil sayfasıysa o", () => {
    const quiet = [shot(0, "Giriş."), shot(1, "Tanım."), shot(2, "Örnek.")];
    expect([...planFigureSources(quiet, mathDocs).keys()]).toEqual([1]);
    const sourced = [shot(0, "Giriş."), shot(1, "Tanım.", { file: "trigonometri.pdf", page: 3 }), shot(2, "Örnek.")];
    expect([...planFigureSources(sourced, mathDocs).entries()]).toEqual([[1, { documentId: "pdf", page: 3, fileName: "trigonometri.pdf" }]]);
    // Kaynağı şekil sayfası olmayan adım kart almaz; belge yoksa plan boş.
    expect(planFigureSources([shot(0, "x", { file: "trigonometri.pdf", page: 4 })], mathDocs).size).toBe(0);
    expect(planFigureSources(quiet, []).size).toBe(0);
  });

  it("tıp: EKG sayfasının dalga etiketi anıldığı ekranda kart; tarih: içindekiler kart vermez", () => {
    const ekgDocs: SourceDocRef[] = [
      { id: "ekg", name: "kardiyoloji.pdf", figureHints: [{ page: 7, lines: ["P dalgası → QRS kompleksi → T dalgası", "PR aralığı: 0,12–0,20 sn"] }] },
    ];
    const ekgScreens = [
      shot(0, "Kalbin iletim sistemi sinoatriyal düğümden başlar."),
      shot(1, "P dalgası kulakçık kasılmasını gösterir."),
      shot(2, "PR aralığı 0,12–0,20 sn arasındadır."),
    ];
    expect([...planFigureSources(ekgScreens, ekgDocs).keys()]).toEqual([1]);

    const tarihDocs: SourceDocRef[] = [{ id: "kpss", name: "anayasa.pdf", pages: "s.1–12" }];
    const tarihScreens = [shot(0, "Anayasacılık tarihi 1876 ile başlar."), shot(1, "Kronoloji grafiği şeması.")];
    expect(planFigureSources(tarihScreens, tarihDocs).size).toBe(0);
    expect(isFigurePage({ documentId: "kpss", page: 1, fileName: "anayasa.pdf" }, tarihDocs)).toBe(false);
  });
});

/* ───────────── 4. Ekran: PPTX slayt eki kart ipucu satırlarıyla, kart bir kez ───────────── */

const textScreen = (heading: string, text: string) => ({ heading, concept: heading, blocks: [{ type: "text" as const, text }] });

describe("Paket H · ders ekranında kart", () => {
  it("matematik, PPTX: sayfa resmi yoksa kart ipucu satırlarını gösterir; sonraki ekranda kart yok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ page: 3, fileName: "slayt.pptx", signedUrl: null, text: "Slayt metni" }) })),
    );
    const lesson = {
      format: 3,
      title: "Küme Eşlemeleri",
      overview: "Bir eşleme her elemanı tek bir elemana götürür.",
      screens: [
        textScreen("Eşleme", "Eşleme, bir kümenin her elemanını öteki kümeden bir elemana bağlar."),
        textScreen("Örnek eşleme", "Slayttaki oklara bak: 1 → b ve 2 → c eşlemeleri çizilmiş."),
        textScreen("Ters eşleme", "Okların yönü ters çevrilince ters eşleme elde edilir."),
      ],
      summary: ["Eşleme oklarla gösterilir."],
    } as LessonV3;
    const sourceDocs = [
      { id: "pptx", name: "slayt.pptx", figurePages: [3], figureHints: [{ page: 3, lines: ["1 → b", "2 → c"] }] },
    ];
    const { container } = render(<ExamLessonSteps lesson={sealLessonV3ForPlay(lesson)} sourceDocs={sourceDocs} closeHref="/d" />);
    // Giriş kartı → 1. ekran: kart yok.
    fireEvent.click(screen.getByRole("button", { name: /Devam et/ }));
    expect(container.querySelector(".als-source-figure")).toBeNull();
    // 2. ekran okları anıyor: kart burada, gövdesi ipucu satırları (PDF değil, resim ucu yok).
    fireEvent.click(screen.getByRole("button", { name: /Devam et/ }));
    expect(container.querySelector(".als-source-figure")).not.toBeNull();
    await waitFor(() => expect(container.querySelectorAll(".als-source-figure-hints li")).toHaveLength(2));
    expect(container.querySelector(".als-source-figure")!.textContent).toContain("1 → b");
    expect(container.querySelector(".als-source-figure pre")).toBeNull();
    expect(container.querySelector(".als-source-figure")!.textContent).toContain("Kaynak Sayfayı Gör (Sayfa 3)");
    // 3. ekran: aynı sayfa ikinci kez çıkmaz.
    fireEvent.click(screen.getByRole("button", { name: /Devam et/ }));
    expect(container.querySelector(".als-source-figure")).toBeNull();
  });
});

/* ───────────── 5. Sayaç: yazım sürerken payda yok, mühürde kilitli ───────────── */

describe("Paket H · adım sayacı", () => {
  it("yazım sürerken 2 → 6 → 8 yazılırken etiket hep çıplak 'N'; mühürde '1 / 9' ve kilit", () => {
    const building = [2, 6, 8].map((written) => lessonStepCounter({ index: 0, writtenSteps: written, building: true }));
    expect(building.map((c) => c.label)).toEqual(["1", "1", "1"]);
    expect(building.every((c) => c.indeterminate)).toBe(true);
    expect(lessonStepCounter({ index: 0, writtenSteps: 9, building: false }).label).toBe("1 / 9");
    // Payload bir ekran büyüse de kilitli payda 9 kalır.
    expect(lessonStepCounter({ index: 0, writtenSteps: 10, building: false, lockedTotal: 9 }).label).toBe("1 / 9");
    expect(lessonStepCounter({ index: 4, writtenSteps: 10, building: false, lockedTotal: 9 }).label).toBe("5 / 9");
  });

  const zScreens = (n: number) =>
    Array.from({ length: n }, (_, i) => textScreen(`Z-skoru ${i + 1}`, `Z = (x − μ) / σ formülünün ${i + 1}. adımı burada anlatılır.`));

  it("matematik (Z-skoru): building iken 'Adım N', aria-valuemax ve '~N dk' yok; mühürde '1 / N' ve N sabit", () => {
    const base = { format: 3, title: "Z-skoru", overview: "Z-skoru bir değerin ortalamadan kaç standart sapma uzak olduğunu söyler." } as LessonV3;
    const { container, rerender } = render(
      <ExamLessonSteps lesson={sealLessonV3ForPlay({ ...base, screens: zScreens(2) } as LessonV3)} building upcoming={["Yorum"]} closeHref="/d" />,
    );
    const count = () => container.querySelector(".als-count")!.textContent ?? "";
    const bar = () => container.querySelector('[role="progressbar"]')!;
    expect(count()).toMatch(/Adım\s*1(?!\s*\/)/);
    expect(bar().hasAttribute("aria-valuemax")).toBe(false);
    expect(container.querySelector(".als-minutes")).toBeNull();
    expect(container.querySelector(".als-intro-meta")!.textContent).not.toMatch(/\d+ adım|dk/);

    rerender(<ExamLessonSteps lesson={sealLessonV3ForPlay({ ...base, screens: zScreens(6) } as LessonV3)} building upcoming={["Yorum"]} closeHref="/d" />);
    expect(count()).toMatch(/Adım\s*1(?!\s*\/)/);
    expect(bar().hasAttribute("aria-valuemax")).toBe(false);

    // Mühür: payda yazılan adımlardır ve kilitlenir.
    rerender(<ExamLessonSteps lesson={sealLessonV3ForPlay({ ...base, screens: zScreens(6), summary: ["Z-skoru uzaklığı ölçer."] } as LessonV3)} closeHref="/d" />);
    const sealed = count().match(/1 \/ (\d+)/);
    expect(sealed).not.toBeNull();
    const total = Number(sealed![1]);
    expect(total).toBeGreaterThanOrEqual(7);
    expect(bar().getAttribute("aria-valuemax")).toBe(String(total));
    const minutes = container.querySelector(".als-minutes")!.textContent;
    expect(minutes).toMatch(/~\d+ dk/);
    expect(container.querySelector(".als-intro-meta")!.textContent).toContain(`${total} adım`);

    // Payload bir ekran büyüdü (onarım / tazeleme): '/ N' ve '~N dk' değişmez.
    rerender(<ExamLessonSteps lesson={sealLessonV3ForPlay({ ...base, screens: zScreens(7), summary: ["Z-skoru uzaklığı ölçer."] } as LessonV3)} closeHref="/d" />);
    expect(count()).toContain(`1 / ${total}`);
    expect(bar().getAttribute("aria-valuemax")).toBe(String(total));
    expect(container.querySelector(".als-minutes")!.textContent).toBe(minutes);
    expect(container.querySelector(".als-intro-meta")!.textContent).toContain(`${total} adım`);
  });

  it("tıp (Pediatri gelişim basamakları): yeni oturum paydayı yeniden hesaplar; plan prop'u sayaca girmez", () => {
    const lesson = {
      format: 3,
      title: "Gelişim Basamakları",
      overview: "Basamaklar ay ay izlenir.",
      screens: [textScreen("Baş kontrolü", "2. ayda baş kontrolü başlar."), textScreen("Oturma", "6. ayda desteksiz oturur.")],
      summary: ["2. ay baş, 6. ay oturma."],
    } as LessonV3;
    const first = render(<ExamLessonSteps lesson={sealLessonV3ForPlay(lesson)} plannedScreens={9} closeHref="/d" />);
    const label = first.container.querySelector(".als-count")!.textContent ?? "";
    expect(label).toMatch(/1 \/ \d+/);
    expect(label).not.toContain("/ 11");
    const steps = read("src/components/parity/exam-lesson-steps.tsx");
    expect(steps).toMatch(/lessonStepCounter\(\{ index, writtenSteps: base\.length, building, lockedTotal: lockedTotalRef\.current \}\)/);
    expect(steps).not.toMatch(/lessonStepCounter\([^)]*plannedScreens/);
  });
});
