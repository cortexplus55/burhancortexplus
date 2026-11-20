// @vitest-environment jsdom
/**
 * Sınav sabahı kâğıdı paketi (15 Kasım 2026, ürün sahibi). Canlı kâğıtta: maddeler kelime ortasında kesiliyordu,
 * şekle bağlı test sorusu kökleri "kural" diye basılıyordu, aynı tuzak iki kez geçiyordu, 32 maddenin 29'u "Sınavda
 * sorulur" etiketindeydi; süzgeç, formül özeti, A4 önizlemesi ve paylaşım yoktu; kâğıda yalnız öğretmen sohbetinin
 * menüsünden ulaşılıyordu. Örnekler farklı derslerden; üretim koduna ders sabiti girmez.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  buildCramSheet,
  classifyPoint,
  cramShareText,
  EXAM_POINT_STORED_MAX,
  fitCramText,
  missLesson,
  questionBound,
} from "@/lib/learning/cram-sheet";
import { readLessonV3 } from "@/lib/learning/lesson-v3";
import { CramSheetView } from "@/components/parity/cram-sheet-view";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

afterEach(() => cleanup());

describe("her madde tam biter", () => {
  it("kayıtta 220'de kesilmiş madde son tam cümlesine çekilir; tam cümle yoksa basılmaz", () => {
    const head = "Kaldırma kuvveti batan hacimle doğru orantılıdır.";
    const cut = `${head} Yoğunluğu büyük olan sıvıda aynı cisim daha az batar çünkü sıvının yoğunluğunun daha büyük olduğ`;
    const stored = cut.padEnd(EXAM_POINT_STORED_MAX, "x").slice(0, EXAM_POINT_STORED_MAX);
    expect(fitCramText(stored, { storedMax: EXAM_POINT_STORED_MAX })).toBe(head);
    const noSentence = "çok uzun ve hiç noktası olmayan bir madde ".repeat(8).slice(0, EXAM_POINT_STORED_MAX);
    expect(fitCramText(noSentence, { storedMax: EXAM_POINT_STORED_MAX })).toBeNull();
  });

  it("sonu üç noktayla kesilmiş metin son tam cümlede biter", () => {
    expect(fitCramText("Enflasyon fiyatların genel düzeyinin artmasıdır. Bu durumda alım gücü iki kat...")).toBe(
      "Enflasyon fiyatların genel düzeyinin artmasıdır.",
    );
  });

  it("sınırı aşan metin cümle sınırında biter, kelime ortasında değil", () => {
    const text = `${"Birinci cümle bilgisi burada yer alır. ".repeat(5)}Son cümle çok uzun ${"kelime ".repeat(30)}`;
    const out = fitCramText(text, { max: 220 })!;
    expect(out.endsWith(".")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(220);
  });

  it("kısa ve tam satır olduğu gibi kalır", () => {
    expect(fitCramText("Derinlik ↑ → basınç ↑")).toBe("Derinlik ↑ → basınç ↑");
  });
});

describe("soru kökü kural yapılmaz", () => {
  it("şekle, öncüle ya da şıkka bağlı kök tanınır", () => {
    expect(questionBound("K, L ve M noktaları 0,4 m derinliktedir.")).toBe(true);
    expect(questionBound("En büyük basınç III numaralı duruştadır.")).toBe(true);
    expect(questionBound("Bir kişi iki ayak yerdeyse iki... basınç yapar.")).toBe(true);
    expect(questionBound("Buna göre hangisi doğrudur?")).toBe(true);
    expect(questionBound("Yukarıdaki tabloya göre en hızlı tepkime ikincisidir.")).toBe(true);
    expect(questionBound("Doğru cevap C şıkkıdır çünkü kuvvet artar.")).toBe(true);
    // Bağımsız kurallar kalır (tarih, kimya, biyoloji).
    expect(questionBound("I. Dünya Savaşı 1914'te başladı.")).toBe(false);
    expect(questionBound("Periyodik tabloda soy gazlar en sağdaki gruptadır.")).toBe(false);
    expect(questionBound("Mitozda kromozom sayısı değişmez.")).toBe(false);
  });

  it("yanlıştan kavramsal ders: açıklamanın bağımsız ilk cümlesi, doğru/yanlışta doğru önerme", () => {
    expect(
      missLesson({
        mode: "choice",
        prompt: "Şekildeki K, L ve M noktalarından hangisinde basınç en büyüktür?",
        explanation: "Doğru cevap C şıkkıdır. Sıvı basıncı yalnız derinliğe ve sıvının yoğunluğuna bağlıdır; kabın şekline bağlı değildir.",
      }),
    ).toBe("Sıvı basıncı yalnız derinliğe ve sıvının yoğunluğuna bağlıdır; kabın şekline bağlı değildir.");
    expect(missLesson({ mode: "choice", prompt: "x?", trueFalse: true, corrected: "Fotosentez ışık enerjisiyle gerçekleşir." })).toBe(
      "Fotosentez ışık enerjisiyle gerçekleşir.",
    );
    expect(missLesson({ mode: "choice", prompt: "Hangisi?", explanation: "Yukarıdaki grafiğe göre B doğrudur." })).toBeNull();
    expect(missLesson({ mode: "recall", front: "ATP", back: "Hücrenin enerji taşıyan molekülüdür ve hızla yenilenir." })).toBe(
      "Hücrenin enerji taşıyan molekülüdür ve hızla yenilenir.",
    );
  });
});

describe("etiketler çeşitlenir, tekrar atılır", () => {
  it("madde biçiminden türünü alır", () => {
    expect(classifyPoint("Basınç P = F / A ile hesaplanır.")).toBe("formula");
    expect(classifyPoint("Mol ile molekül sayısı sık karıştırılır.")).toBe("warn");
    expect(classifyPoint("Birim yüzeye dik etki eden kuvvete basınç denir.")).toBe("definition");
    expect(classifyPoint("Osmanlı'nın ilk başkenti Söğüt'tür.")).toBe("point");
  });

  const lesson = (blocks: unknown[]) =>
    readLessonV3({ format: 3, title: "Basınç", screens: [{ heading: "Sıvı basıncı", blocks }] })!;

  it("aynı tuzak başka sözcüklerle ikinci kez basılmaz; formül özeti ve hoca uyarıları kâğıdın başında", () => {
    const sheet = buildCramSheet({
      topics: [{ key: "t", label: "Basınç" }],
      lessons: [
        {
          topicKey: "t",
          lesson: lesson([
            { type: "formula", formula: { title: "Sıvı basıncı", expression: "P = h \\cdot d \\cdot g" } },
            { type: "exam_trap_card", trap: { title: "Kap şekli", wrong: "Geniş kapta basınç daha büyüktür.", right: "Basınç kabın şekline bağlı değildir." } },
            { type: "exam_trap_card", trap: { title: "Kap", wrong: "Geniş kapta basınç her zaman daha büyüktür.", right: "Basınç kabın şekline hiç bağlı değildir." } },
          ]),
        },
      ],
      examPoints: [{ topicKey: "t", points: ["Basınç P = F / A ile hesaplanır.", "Birim yüzeye dik etki eden kuvvete basınç denir."] }],
      teacherRules: ["Hesaplarda g = 10 m/s² alınacaktır."],
    });
    const traps = sheet.sections.flatMap((section) => section.items.filter((item) => item.kind === "trap"));
    expect(traps).toHaveLength(1);
    expect(sheet.formulas.map((formula) => formula.text)).toEqual(["P = h \\cdot d \\cdot g", "Basınç P = F / A ile hesaplanır."]);
    expect(sheet.teacherRules).toEqual(["Hesaplarda g = 10 m/s² alınacaktır."]);
    const kinds = new Set(sheet.sections.flatMap((section) => section.items.map((item) => item.kind)));
    expect(kinds.has("definition")).toBe(true);
  });

  it("tek sözcükle ayrılan iki ayrı madde ikisi de kalır", () => {
    const sheet = buildCramSheet({
      topics: [{ key: "a", label: "Konu" }],
      lessons: [],
      examPoints: [{ topicKey: "a", points: ["Birinci konunun sınavda sorulan maddesi", "İkinci konunun sınavda sorulan maddesi"] }],
    });
    expect(sheet.sections[0]!.items).toHaveLength(2);
  });

  it("şekle bağlı yanlış satırı basılmaz, kavramsal ders basılır", () => {
    const sheet = buildCramSheet({
      topics: [],
      lessons: [],
      weakSpots: [
        { text: "K, L ve M noktaları 0,4 m derinliktedir. → Doğrusu: C", topic: "Basınç" },
        { text: "Sıvı basıncı kabın şekline bağlı değildir.", topic: "Basınç" },
      ],
    });
    expect(sheet.weakSpots.map((spot) => spot.text)).toEqual(["Sıvı basıncı kabın şekline bağlı değildir."]);
  });

  it("paylaşım metni bugün çalışan şeyi söyler (davetle aynı hazırlığa katılım)", () => {
    expect(cramShareText("Fizik vizesi")).toContain("Aynı hazırlığa katıl");
  });
});

describe("kâğıdın ekranı", () => {
  const sheet = buildCramSheet({
    topics: [{ key: "t", label: "Kimya" }],
    lessons: [
      {
        topicKey: "t",
        lesson: readLessonV3({
          format: 3,
          title: "Mol",
          screens: [
            {
              heading: "Mol",
              blocks: [
                { type: "formula", formula: { title: "Mol sayısı", expression: "n = m / M" } },
                { type: "exam_trap_card", trap: { title: "Birim", wrong: "Mol kütle birimidir.", right: "Mol madde miktarı birimidir." } },
                { type: "note", note: { title: "Akılda tut", body: "1 mol tanecik 6,02 · 10²³ tanedir.", tone: "remember" } },
              ],
            },
          ],
        })!,
      },
    ],
    weakSpots: [{ text: "Avogadro sayısı tanecik sayısını verir, kütleyi vermez.", topic: "Kimya" }],
  });
  const share = { url: "https://cortexplus.app/hazirlik-davet/abc", whatsappHref: "https://wa.me/?text=x", qrSrc: "data:image/svg+xml;base64,AA" };

  it("süzgeç çipleri: Formüller yalnız formül özetini, Yanıldığım Noktalar yalnız yanlışları gösterir", () => {
    render(<CramSheetView sheet={sheet} prepTitle="Kimya vizesi" examDay={null} homeHref="/x" share={share} />);
    expect(screen.getByRole("button", { name: /Tümü/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("region", { name: "Formül özeti" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Formüller/ }));
    expect(screen.getByRole("region", { name: "Formül özeti" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "En çok yanıldığın noktalar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Yanıldığım Noktalar/ }));
    expect(screen.getByRole("region", { name: "En çok yanıldığın noktalar" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Formül özeti" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Sınav Tuzakları/ }));
    expect(screen.getByText("Sınav tuzağı")).toBeTruthy();
    expect(screen.queryByText("Akılda tut")).toBeNull();
  });

  it("A4 önizlemesi görünümü değiştirir; paylaşım düğmeleri ve QR'lı imza var", () => {
    const { container } = render(<CramSheetView sheet={sheet} prepTitle="Kimya vizesi" examDay={null} homeHref="/x" share={share} />);
    const article = container.querySelector("article")!;
    expect(article.getAttribute("data-view")).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: /A4 Kağıt Önizlemesi/ }));
    expect(article.getAttribute("data-view")).toBe("paper");
    expect(screen.getByRole("link", { name: /WhatsApp'ta Paylaş/ }).getAttribute("href")).toBe(share.whatsappHref);
    expect(screen.getByRole("button", { name: /Bağlantıyı Kopyala/ })).toBeTruthy();
    const sign = container.querySelector(".cp-cram-sign")!;
    expect(within(sign as HTMLElement).getByText("Cortex Plus · cortexplus.app")).toBeTruthy();
    expect(sign.querySelector(".cp-cram-qr")!.getAttribute("src")).toBe(share.qrSrc);
  });

  it("yazdırmadan önce süzgeç Tümü'ne döner (kâğıdın tamamı basılır)", () => {
    render(<CramSheetView sheet={sheet} prepTitle="Kimya vizesi" examDay={null} homeHref="/x" share={share} />);
    fireEvent.click(screen.getByRole("button", { name: /Formüller/ }));
    window.dispatchEvent(new Event("beforeprint"));
    expect(screen.getByRole("button", { name: /Tümü/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("ön izlemede (ana sayfa turu) süzgeç, paylaşım ve imza yok", () => {
    const { container } = render(<CramSheetView sheet={sheet} prepTitle="Örnek" examDay={null} homeHref="/x" preview />);
    expect(container.querySelector(".cp-cram-toolbar")).toBeNull();
    expect(container.querySelector(".cp-cram-sign")).toBeNull();
  });
});

describe("bulunabilirlik ve baskı", () => {
  it("hazırlık sayfasında üst eylem ve Daha fazla menüsü; Çalışma Stüdyosu kartı", () => {
    const home = read("src/components/parity/exam-prep-home.tsx");
    expect(home).toContain("Sabah kâğıdı");
    expect(home).toContain("Sınav Sabahı Kağıdı");
    expect(home.match(/examPrepCramSheetHref\(prepId\)/g)?.length).toBeGreaterThanOrEqual(2);
    const hub = read("src/components/parity/tools-hub.tsx");
    expect(hub).toContain("⚡ Sınav Sabahı Kağıdı");
    expect(read("src/app/araclar/page.tsx")).toContain("loadLatestPrep(supabase, user.id)");
  });

  it("sayfa paylaşım kodunu açar (yoksa daveti imzalar), QR'ı yerel üretir; baskıda süzgeç gizli, imza basılır", () => {
    const page = read("src/app/deneme-sinavlari/[prepId]/sinav-sabahi/page.tsx");
    expect(page).toContain("ensurePrepShareCode(service, { prepId: input.prepId, userId: input.userId })");
    expect(page).toContain("createPrepInviteToken(input.prepId)");
    expect(page).toContain("qrSvgDataUri(url, { size: 160");
    const css = read("src/styles/cram-sheet.css");
    expect(css).toContain(".cp-cram-sheet .cp-cram-toolbar {");
    expect(css).toContain('.cp-cram-sheet[data-view="paper"] .cp-cram-page');
  });

  it("yükleyici soru kökü değil kavramsal ders ve notun kurallarını okur", () => {
    const loader = read("src/lib/learning/cram-sheet-load.ts");
    expect(loader).toContain("missLesson(stored)");
    expect(loader).toContain("loadSourceRules(service, await loadPrepDocumentIds(service, input.prepId)");
    expect(loader).not.toContain("reviewItemCramText(row.item)");
  });
});
