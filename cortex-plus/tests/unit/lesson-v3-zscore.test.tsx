// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { lessonV3Schema, readLessonV2, screenCheck, type LessonV3 } from "@/lib/learning/lesson-v3";
import { sealLessonV3ForPlay, sealStoredLesson } from "@/lib/learning/lesson-play-v3";
import { TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM, lessonStructureIssues, verifySystem } from "@/lib/learning/teacher-lesson";

Element.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);

/*
  LessonV3 isteğinin üçüncü parçası (27 Eylül 2026): "Z-skoru ve hedef boy" dersi.
  Bir kavram iki ekrana yayılıyor (formül kartı + adımlar + çözümlü örnek), ilk
  ekran "önce dene" ile açılıyor. Bu ders şemadan, yapı denetiminden, mühürden ve
  ekrandan geçmeli; yazarın örneği de bu.
*/
const zscore: LessonV3 = {
  format: 3,
  title: "Z-skoru ve Hedef Boy",
  overview: "İki çocuk aynı boyda; biri için endişelenip öteki için endişelenmemek neden doğru olabilir?",
  objective: "Bir ölçümün Z-skorunu ve çocuğun hedef boyunu hesaplayabilmek.",
  screens: [
    {
      heading: "Z-skoru",
      concept: "Z-skoru",
      lead: "Ölçümün yaşıtlara göre nerede durduğunu sayıyla söyler.",
      blocks: [
        {
          type: "check",
          check: {
            type: "trueFalse",
            prompt: "Boyu yaşıtlarının ortalamasının altında olan her çocuk kısa boyludur.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation: "Ortalamanın altı tek başına kısalık değildir; ölçüt standart sapmadır.",
            corrected: "Kısa boy, boyun yaşıtlarına göre −2 SD'nin altında olmasıdır.",
          },
        },
        {
          type: "text",
          text: "**Z-skoru**, bir ölçümün yaşıtlarının ortalamasından kaç **standart sapma (SD)** uzakta olduğunu söyler. Sıfır ortalamadır; eksi değer ortalamanın altı, artı değer üstüdür.",
        },
        { type: "formula", formula: { title: "Z-skoru", expression: "Z = (ölçüm − ortalama) / SD", note: "SD: yaşıtların standart sapması" } },
        {
          type: "text",
          text: "Boyda **−2 SD'nin altı** kısa boy sayılır. Persentil eğrisinde bu yaklaşık 3. persentilin altına denk gelir.",
        },
        {
          type: "note",
          note: {
            title: "Günlük hayattan: aynı boy, farklı Z",
            body: "Aynı sınıftaki iki çocuğun boyu aynıdır; biri yaşıtlarından bir yaş küçük olduğu için onun Z-skoru daha yüksek çıkar.",
            tone: "info",
          },
        },
      ],
    },
    {
      heading: "Z-skoru: hesap",
      concept: "Z-skoru",
      blocks: [
        { type: "text", text: "Hesap üç adımdır; sonucu kısa boy eşiğiyle karşılaştır." },
        {
          type: "procedure",
          procedure: {
            title: "Z-skorunu hesapla",
            steps: [
              { label: "Farkı bul", detail: "Ölçümden yaşıtların ortalamasını çıkar." },
              { label: "Böl", detail: "Farkı standart sapmaya böl." },
              { label: "Karşılaştır", detail: "Sonuç −2'nin altındaysa kısa boy." },
            ],
          },
        },
        {
          type: "example",
          example: {
            prompt: "Boyu 100 cm olan çocuğun yaşıtlarında ortalama 110 cm, SD 4 cm.",
            givens: ["Ölçüm: 100 cm", "Ortalama: 110 cm", "SD: 4 cm"],
            unknown: "Z-skoru",
            steps: ["100 − 110 = −10 cm", "−10 / 4 = −2,5"],
            result: "Z = −2,5; −2'nin altında, kısa boy.",
            solution: "(100 − 110) / 4 = −2,5",
          },
        },
        {
          type: "check",
          check: {
            type: "mcq",
            prompt: "Ölçümü 104 cm, yaşıt ortalaması 110 cm, SD 3 cm olan çocuğun Z-skoru kaçtır?",
            options: ["−2", "−1", "+2", "−3"],
            answerIndex: 0,
            explanation: "(104 − 110) / 3 = −2. Eşikte, altı değil.",
            optionWhy: ["Doğru hesap.", "Farkı 6'ya böldün.", "İşaret ters.", "Farkı 2'ye böldün."],
            review: { prompt: "Z-skoru −2,4 çıkan çocuk için ne söylersin?" },
          },
        },
      ],
    },
    {
      heading: "Hedef Boy",
      concept: "Hedef boy",
      lead: "Çocuğun genetik boy beklentisini anne ve babadan bulur.",
      blocks: [
        { type: "text", text: "**Hedef boy**, anne ve babanın boyundan hesaplanan beklenen yetişkin boyudur. Erkekte 13 cm eklenir, kızda çıkarılır." },
        {
          type: "table",
          table: {
            caption: "Hedef boy",
            columns: ["Cinsiyet", "Formül"],
            rows: [
              ["Erkek", "(anne + baba + 13) / 2"],
              ["Kız", "(anne + baba − 13) / 2"],
            ],
          },
        },
        {
          type: "check",
          check: {
            type: "mcq",
            prompt: "Annesi 160 cm, babası 176 cm olan erkek çocuğun hedef boyu kaçtır?",
            options: ["174,5 cm", "161,5 cm", "168 cm", "181 cm"],
            answerIndex: 0,
            explanation: "(160 + 176 + 13) / 2 = 174,5 cm.",
            optionWhy: ["Doğru.", "Kız formülü.", "13 eklenmemiş.", "13 iki kez eklenmiş."],
            review: { prompt: "Aynı ailede kız çocuğun hedef boyu kaç olur?" },
          },
        },
      ],
    },
  ],
  summary: ["Kısa boy: −2 SD'nin altı.", "Z = (ölçüm − ortalama) / SD.", "Hedef boy: erkekte +13, kızda −13, ikiye böl."],
  nextFocus: [],
};

describe("LessonV3 — Z-skoru ve hedef boy örneği", () => {
  it("şemadan ve yapı denetiminden temiz geçer", () => {
    expect(lessonV3Schema.safeParse(zscore).success).toBe(true);
    expect(lessonStructureIssues(zscore, {})).toEqual([]);
  });

  it("V3 kuralları: ekran başına bir soru, kavram soruyla biter, kavramın ekranları art arda, metinsiz ekran yok", () => {
    const [first, second, third] = zscore.screens as [LessonV3["screens"][number], LessonV3["screens"][number], LessonV3["screens"][number]];
    const twoChecks: LessonV3 = { ...zscore, screens: [first, { ...second, blocks: [...second.blocks, third.blocks[2]!] }, third] };
    expect(lessonStructureIssues(twoChecks, {}).some((issue) => /tek 'check'/.test(issue.problem))).toBe(true);
    const openEnded: LessonV3 = { ...zscore, screens: [first, { ...second, blocks: second.blocks.slice(0, 3) }, third] };
    expect(lessonStructureIssues(openEnded, {}).some((issue) => /'Z-skoru' kavramı bir soruyla bitmeli/.test(issue.problem))).toBe(true);
    const split: LessonV3 = { ...zscore, screens: [first, third, second] };
    expect(lessonStructureIssues(split, {}).some((issue) => /art arda/.test(issue.problem))).toBe(true);
    const noText: LessonV3 = { ...zscore, screens: [first, { ...second, blocks: second.blocks.filter((block) => block.type !== "text") }, third] };
    expect(lessonStructureIssues(noText, {}).some((issue) => /en az bir 'text'/.test(issue.problem))).toBe(true);
    // 16 Ekim 2026 Beslenme dersi: ikinci ekran yeni parça taşımadan böldü; metin başka ekrandaki tabloya gönderdi.
    const needless: LessonV3 = {
      ...zscore,
      screens: [first, { ...second, blocks: second.blocks.filter((block) => block.type === "text" || block.type === "check") }, third],
    };
    expect(lessonStructureIssues(needless, {}).some((issue) => /gereksiz bölünmüş/.test(issue.problem))).toBe(true);
    const pointing: LessonV3 = {
      ...zscore,
      screens: [first, { ...second, blocks: [{ type: "text", text: "Tabloda eşiği ve sonucu birlikte oku." }, ...second.blocks] }, third],
    };
    expect(lessonStructureIssues(pointing, {}).some((issue) => /tabloya gönderiyor/.test(issue.problem))).toBe(true);
    const periodic: LessonV3 = {
      ...zscore,
      screens: [first, { ...second, blocks: [{ type: "text", text: "Periyodik tabloda soldan sağa okuyunca yarıçap küçülür." }, ...second.blocks] }, third],
    };
    expect(lessonStructureIssues(periodic, {}).some((issue) => /tabloya gönderiyor/.test(issue.problem))).toBe(false);
    expect(TEACHER_SYSTEM).toContain("Hesap, çok adımlı işlem ya da uzun tablo YOKSA kavramı bölme");
    // Severity: V3 kuralları yüksek.
    expect(lessonStructureIssues(twoChecks, {}).find((issue) => /tek 'check'/.test(issue.problem))?.severity).toBe("high");
  });

  it("mühür cevabı ve doğrusunu siler; blok sırası ve içerik kalır; notlandırma ekran = bölüm", () => {
    const sealed = sealLessonV3ForPlay(zscore);
    const blob = JSON.stringify(sealed);
    expect(blob).not.toMatch(/"answerIndex"|"optionWhy"|"corrected"|"explanation"/);
    expect(sealed.screens[1]!.blocks.map((block) => block.type)).toEqual(["text", "procedure", "example", "check"]);
    // Sunucu notlandırması V2 görünümünden: ekran 1'in sorusu bölüm 1'in sorusu.
    expect(readLessonV2(zscore)?.sections[1]?.check).toEqual(screenCheck(zscore.screens[1]!));
  });

  it("ekranda bloklar dizideki sırayla; kavram planı bir kez; önce dene cevaptan sonra açılır", () => {
    const { container } = render(<ExamLessonSteps lesson={sealLessonV3ForPlay(zscore)} closeHref="/deneme-sinavlari/p" />);
    // Giriş kartı: iki kavram, Z-skoru bir kez.
    const plan = container.querySelector(".als-intro-plan")!;
    expect(plan.querySelectorAll("li")).toHaveLength(2);
    expect(plan.textContent).toContain("Z-skoru");
    expect(plan.textContent).toContain("Hedef boy");
    fireEvent.click(screen.getByRole("button", { name: /Devam et/ }));
    // Önce dene: anlatım ve formül cevaptan önce yok.
    expect(container.innerHTML).toContain("kısa boyludur");
    expect(container.querySelector(".als-formula-card")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Yanlış/ }));
    const html = container.innerHTML;
    const text = html.indexOf("Z-skoru</strong>");
    const formula = html.indexOf("als-formula-card");
    const threshold = html.indexOf("SD'nin altı");
    expect(text).toBeGreaterThan(-1);
    expect(formula).toBeGreaterThan(text);
    // Formül iki metnin arasında: V2'de bu sıra yazılamıyordu.
    expect(threshold).toBeGreaterThan(formula);
  });

  it("yazar sayıyı kaynaktan aynen alır ve hesabı ekranlara böler; denetçi sayıyı denetler", () => {
    for (const system of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM]) {
      expect(system).toContain("SAYILAR: Kaynak bir sayı, eşik, aralık, oran ya da birim veriyorsa onu aynen yaz");
      expect(system).toContain("2-3 ekrana böl");
      expect(system).toContain('"format": 3');
      expect(system).toContain('{"type": "example"');
    }
    expect(verifySystem("document")).toContain("kaynaktaki bir sayının, eşiğin ya da birimin yanlış aktarılması");
    expect(verifySystem("topic")).toContain("sayı, eşik, birim");
  });
});

// 16 Ekim 2026 Astra kıyası: Astra belgede olmayan sınav bilgisini ("bal 1 yaşına kadar,
// botulizm") "metinde belirtilmiştir" diye veriyordu. Ürün sahibinin kararı: etiketli,
// denetlenmiş "Genel bilgi" kutusu; yalnız belgeli derste, en fazla iki.
describe("LessonV3 — Genel bilgi kutusu", () => {
  const withGeneral = (title: string, count = 1): LessonV3 => ({
    ...zscore,
    screens: zscore.screens.map((screen, index) =>
      index === 0
        ? {
            ...screen,
            blocks: [
              ...screen.blocks,
              ...Array.from({ length: count }, () => ({
                type: "note" as const,
                note: { title, body: "Bal, botulizm riski nedeniyle 1 yaşından önce verilmez.", tone: "general" as const },
              })),
            ],
          }
        : screen,
    ),
  });

  it("yalnız belgeli derste istenir; denetçi doğruluğunu ayrıca denetler", () => {
    expect(TEACHER_SYSTEM).toContain("GENEL BİLGİ KUTUSU");
    expect(TOPIC_TEACHER_SYSTEM).not.toContain("GENEL BİLGİ KUTUSU");
    expect(verifySystem("document")).toContain("H) 'Genel bilgi' notunda (tone 'general') yanlış");
    expect(verifySystem("document")).toContain("A-H 'high'");
  });

  it("etiketli ve en fazla iki", () => {
    expect(lessonStructureIssues(withGeneral("Genel bilgi: bal ve yaş"), {})).toEqual([]);
    expect(lessonStructureIssues(withGeneral("Bal ve yaş"), {}).some((issue) => /'Genel bilgi: …' ile başlamalı/.test(issue.problem))).toBe(true);
    expect(lessonStructureIssues(withGeneral("Genel bilgi: bal", 3), {}).some((issue) => /En fazla iki 'Genel bilgi'/.test(issue.problem))).toBe(true);
  });

  it("ekranda ayrı renkte; eski sekmenin V2 paketinde bilgi kutusu olur", () => {
    const lesson = withGeneral("Genel bilgi: bal ve yaş");
    const { container } = render(<ExamLessonSteps lesson={sealLessonV3ForPlay(lesson)} closeHref="/deneme-sinavlari/p" />);
    fireEvent.click(screen.getByRole("button", { name: /Devam et/ }));
    fireEvent.click(screen.getByRole("button", { name: /Yanlış/ }));
    expect(container.querySelector(".als-note--general")?.textContent).toContain("Genel bilgi: bal ve yaş");
    // Genel bilgi kutusu ekranın ilk notu: V2 görünümünde bölümün notu olur ve eski ekran tonu tanımaz.
    const [first, ...rest] = zscore.screens;
    const generalFirst: LessonV3 = {
      ...zscore,
      screens: [
        { ...first!, blocks: [{ type: "note", note: { title: "Genel bilgi: bal", body: "Bal 1 yaşından önce verilmez.", tone: "general" } }, ...first!.blocks] },
        ...rest,
      ],
    };
    const legacy = sealStoredLesson(generalFirst, { format: 2 }) as { sections: { note?: { title: string; tone?: string } }[] };
    expect(legacy.sections[0]?.note?.title).toBe("Genel bilgi: bal");
    expect(legacy.sections[0]?.note?.tone).toBe("info");
  });
});
