// @vitest-environment jsdom
/**
 * Konu başı "Bu Derste Ne Öğreneceğiz?" ve konu sonu "Bu Konudan Aklında Kalsın" (28 Kasım 2026).
 *
 * - Veri dersin kendisinden: havuz (hazır müfredat) dersi ve not dersi aynı işlevden geçer, model çağrısı yok.
 * - Önsöz yalnız ilk açılışta kendiliğinden; başlanmış derste ders doğrudan başlar, önsöz "Ders özeti" penceresinde.
 * - Kapanış kartı Sınav Sabahı Kağıdı'na ikincil bağlantı verir (yeni sekme: ders yarıda kapanmasın).
 * - `brief` verilmeyen kullanımlar (tur, ders sayfası, fikstür) eski giriş kartı ve özetle kalır.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { BRIEF_COPY, briefHasClosing, briefHasPreface, lessonBrief, lessonLevelLabel } from "@/lib/learning/lesson-brief";
import { poolLessonV3 } from "@/lib/content-pool/serve";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Hazır müfredat dersi: kazanım bölümleri, "Temel kavramlar" kutusu, sık yapılan hata, özet (havuzun biçimi). */
const POOL = poolLessonV3(
  {
    title: "Basit Makineler",
    overview: "Kaldıraç, makara ve eğik düzlem kuvvetten kazanç sağlar ama işten kazanç sağlamaz.",
    sections: [
      {
        outcome_code: "F.8.5.1",
        heading: "Kaldıraçlar",
        explanation: "Kaldıraçta yük ile kuvvetin desteğe uzaklıkları kuvvet kazancını belirler. Kuvvet kolu uzadıkça gereken kuvvet azalır.",
        key_points: ["Kuvvet × kuvvet kolu = yük × yük kolu"],
        common_mistakes: ["Kuvvet kazancının işten de kazanç sağladığını sanmak"],
      },
      {
        outcome_code: "F.8.5.2",
        heading: "Makaralar",
        explanation: "Sabit makara kuvvetin yönünü değiştirir, hareketli makara kuvvetten kazanç sağlar. Palangalarda ip sayısı kazancı gösterir.",
        key_points: ["Hareketli makarada kuvvet yükün yarısıdır"],
      },
      {
        outcome_code: "F.8.5.3",
        heading: "Eğik Düzlem",
        explanation: "Eğik düzlemde yol uzadıkça gereken kuvvet azalır. Yapılan iş değişmez.",
        key_points: ["Kuvvet × yol = yük × yükseklik"],
      },
    ],
    summary: "Basit makineler kuvvetten kazanç sağlar. Hiçbir basit makine işten kazanç sağlamaz. Kazanç kol ya da yol uzunluğuyla artar.",
    key_terms: [
      { term: "Kuvvet kazancı", definition: "Yükün uygulanan kuvvete oranı." },
      { term: "Destek noktası", definition: "Kaldıracın döndüğü nokta." },
      { term: "Palanga", definition: "Sabit ve hareketli makaraların birlikte kullanıldığı düzenek." },
    ],
    cards: [{ front: "a", back: "b" }],
  } as never,
  "Basit Makineler",
) as unknown as LessonV3;

/** Not dersi (öğretmen motoru): kavram kavram ekran, koyu terimler, sınav tuzağı, özet. */
const NOTE: LessonV3 = {
  format: 3,
  title: "Köklü Sayılar",
  overview: "Kökün dışına çıkarma ve kök içine alma.",
  screens: [
    {
      heading: "Kök dışına çıkarma",
      concept: "Kök dışına çıkarma",
      lead: "Tam kare çarpan kökün dışına çıkar.",
      blocks: [
        { type: "text", text: "**Tam kare çarpan** kökün dışına çıkar: $\\sqrt{12} = 2\\sqrt{3}$." },
        { type: "exam_trap_card", trap: { title: "Toplamı ayırmak", wrong: "√(a+b) = √a + √b sanmak", right: "Kök yalnız çarpıma dağılır; toplamı ayırmaz.", tell: "Toplama işareti" } },
      ],
    },
    {
      heading: "Kök içine alma",
      concept: "Kök içine alma",
      blocks: [{ type: "text", text: "Dıştaki sayının **karesi** alınıp köke çarpılır. **Kök derecesi** değişmez." }],
    },
    {
      heading: "Sıralama",
      concept: "Köklü sayıları sıralama",
      blocks: [{ type: "text", text: "Hepsini aynı köke çevirip içleri karşılaştır." }],
    },
  ],
  summary: ["Tam kare çarpan dışarı çıkar.", "Kök toplamı ayırmaz.", "Sıralamada önce aynı köke çevir."],
} as unknown as LessonV3;

describe("lessonBrief: dersin kendi verisinden, modelsiz", () => {
  it("havuz dersi: hedefler kazanım bölümleri, kilit kavramlar 'Temel kavramlar', dikkat 'Sık yapılan hata', kalsın özet", () => {
    const brief = lessonBrief(POOL);
    expect(brief.goals.map((goal) => goal.title)).toEqual(["Kaldıraçlar", "Makaralar", "Eğik Düzlem"]);
    expect(brief.goals[0]!.detail).toMatch(/^Kaldıraçta yük ile kuvvetin/);
    expect(brief.concepts).toEqual(["Kuvvet kazancı", "Destek noktası", "Palanga"]);
    expect(brief.caution).toEqual({ title: "Sık yapılan hata", text: "Kuvvet kazancının işten de kazanç sağladığını sanmak" });
    expect(brief.remember).toEqual([
      "Basit makineler kuvvetten kazanç sağlar.",
      "Hiçbir basit makine işten kazanç sağlamaz.",
      "Kazanç kol ya da yol uzunluğuyla artar.",
    ]);
    expect(briefHasPreface(brief)).toBe(true);
    expect(briefHasClosing(brief)).toBe(true);
  });

  it("not dersi: koyu terimler kavram, sınav tuzağının doğrusu dikkat kutusu", () => {
    const brief = lessonBrief(NOTE);
    expect(brief.goals.map((goal) => goal.title)).toEqual(["Kök dışına çıkarma", "Kök içine alma", "Köklü sayıları sıralama"]);
    expect(brief.goals[0]!.detail).toBe("Tam kare çarpan kökün dışına çıkar.");
    // Tek, küçük harfli çekimli sözcük ("karesi") başka kavram varken alınmaz.
    expect(brief.concepts).toEqual(["Tam kare çarpan", "Kök derecesi"]);
    expect(brief.caution).toEqual({ title: "Toplamı ayırmak", text: "Kök yalnız çarpıma dağılır; toplamı ayırmaz." });
    expect(brief.remember).toHaveLength(3);
  });

  it("kavram kutucuğu büyük harfle başlar ama 'pH' gibi adlar korunur; güçlü terim yoksa tek sözcükler alınır", () => {
    const lesson = {
      ...NOTE,
      screens: [
        { heading: "A", concept: "A", blocks: [{ type: "text", text: "**tampon çözelti** ve **pH** değeri; **asitlik** artar, **bazlık** azalır." }] },
        { heading: "B", concept: "B", blocks: [{ type: "text", text: "Metin." }] },
      ],
    } as unknown as LessonV3;
    expect(lessonBrief(lesson).concepts).toEqual(["Tampon çözelti", "pH"]);
    const onlyWeak = {
      ...NOTE,
      screens: [{ heading: "A", concept: "A", blocks: [{ type: "text", text: "**asitlik** artar, **bazlık** azalır." }] }],
    } as unknown as LessonV3;
    expect(lessonBrief(onlyWeak).concepts).toEqual(["Asitlik", "Bazlık"]);
  });

  it("veri yetmezse önsöz ve kapanış yok (ders doğrudan başlar)", () => {
    const thin = { format: 3, title: "Mol", screens: [{ heading: "Mol", blocks: [{ type: "text", text: "Mol bir sayma birimidir." }] }] } as unknown as LessonV3;
    const brief = lessonBrief(thin);
    expect(briefHasPreface(brief)).toBe(false);
    expect(briefHasClosing(brief)).toBe(false);
  });

  it("en çok 4 hedef, fazlası sayılır; 5'ten fazla madde kalsın kartına girmez", () => {
    const many = {
      ...NOTE,
      screens: Array.from({ length: 6 }, (_, at) => ({ heading: `Bölüm ${at + 1}`, concept: `Bölüm ${at + 1}`, blocks: [{ type: "text", text: `Bölüm ${at + 1} anlatımı burada yazıyor.` }] })),
      summary: ["Bir madde.", "İki madde.", "Üç madde.", "Dört madde.", "Beş madde.", "Altı madde."],
    } as unknown as LessonV3;
    const brief = lessonBrief(many);
    expect(brief.goals).toHaveLength(4);
    expect(brief.moreGoals).toBe(2);
    expect(brief.remember).toHaveLength(5);
  });

  it("anlatım düzeyi aşinalık kuşağından", () => {
    expect(lessonLevelLabel("new")).toBe("Başlangıç");
    expect(lessonLevelLabel("basics")).toBe("Temel");
    expect(lessonLevelLabel("confident")).toBe("İleri");
    expect(lessonLevelLabel(null)).toBeNull();
  });
});

function play(lesson: LessonV3) {
  return sealLessonV3ForPlay(lesson);
}

describe("ders ekranı: önsöz ilk açılışta", () => {
  it("üst şerit, numaralı hedefler, kilit kavramlar, dikkat kutusu; tek ana düğme 'Derse başla'", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <ExamLessonSteps
        lesson={play(NOTE)}
        closeHref="/deneme-sinavlari/p"
        plannedMinutes={6}
        brief={{ autoOpen: true, levelLabel: "Temel", cramHref: "/deneme-sinavlari/p/sinav-sabahi" }}
      />,
    );
    const preface = screen.getByRole("region", { name: "Köklü Sayılar" });
    expect(within(preface).getByText(BRIEF_COPY.prefaceTitle)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Köklü Sayılar" })).toBeTruthy();
    expect(within(preface).getByText("~6 dk")).toBeTruthy();
    expect(within(preface).getByText("Anlatım: Temel")).toBeTruthy();
    const goals = within(preface).getByRole("region", { name: BRIEF_COPY.goalsTitle });
    expect([...goals.querySelectorAll(".als-goal-num")].map((node) => node.textContent)).toEqual(["01", "02", "03"]);
    expect(within(preface).getByRole("region", { name: BRIEF_COPY.conceptsTitle }).textContent).toContain("Tam kare çarpan");
    expect(within(preface).getByRole("complementary", { name: BRIEF_COPY.cautionTitle }).textContent).toContain("toplamı ayırmaz");
    // Eski giriş kartı ikinci kez çizilmez.
    expect(screen.queryByRole("region", { name: "Bu derste neler var" })).toBeNull();
    // Yapay zekâ notu önsözde.
    expect(preface.querySelector(".als-ai-notice")).toBeTruthy();
    const start = screen.getByRole("button", { name: BRIEF_COPY.start });
    expect(screen.queryByRole("button", { name: "Devam et" })).toBeNull();
    fireEvent.click(start);
    expect(screen.getByRole("heading", { level: 1, name: "Kök dışına çıkarma" })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("derse geçince 'Ders özeti' önsözü pencerede açar; 'Derse dön' ve Esc kapatır, ders yerinde kalır", () => {
    render(<ExamLessonSteps lesson={play(NOTE)} closeHref="/deneme-sinavlari/p" brief={{ autoOpen: true }} />);
    expect(screen.queryByRole("button", { name: BRIEF_COPY.reopen })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: BRIEF_COPY.start }));
    fireEvent.click(screen.getByRole("button", { name: BRIEF_COPY.reopen }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(BRIEF_COPY.goalsTitle)).toBeTruthy();
    expect(document.activeElement?.textContent).toBe(BRIEF_COPY.backToLesson);
    fireEvent.click(within(dialog).getByRole("button", { name: BRIEF_COPY.backToLesson }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Kök dışına çıkarma" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: BRIEF_COPY.reopen }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ders ekranı: başlanmış ders", () => {
  it("önsöz kendiliğinden açılmaz; ders ilk bölümle başlar, 'Ders özeti' ve yapay zekâ notu görünür", () => {
    render(<ExamLessonSteps lesson={play(NOTE)} closeHref="/deneme-sinavlari/p" brief={{ autoOpen: false }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Kök dışına çıkarma" })).toBeTruthy();
    expect(screen.queryByText(BRIEF_COPY.prefaceTitle)).toBeNull();
    expect(screen.getByRole("button", { name: BRIEF_COPY.reopen })).toBeTruthy();
    expect(document.querySelector(".als-ai-notice")).toBeTruthy();
  });
});

describe("ders ekranı: konu sonu", () => {
  function toEnd(cramLocked = false) {
    render(
      <ExamLessonSteps
        lesson={play(POOL)}
        closeHref="/deneme-sinavlari/p"
        brief={{ autoOpen: false, cramHref: "/deneme-sinavlari/p/sinav-sabahi", cramLocked }}
      />,
    );
    for (let guard = 0; guard < 20 && !screen.queryByRole("heading", { level: 1, name: BRIEF_COPY.closingTitle }); guard += 1) {
      fireEvent.click(screen.getByRole("button", { name: /Devam et|Dersi bitir/ }));
    }
  }

  it("'Bu Konudan Aklında Kalsın': onaylı maddeler ve Sınav Sabahı Kağıdı'na yeni sekmede bağlantı", () => {
    toEnd();
    expect(screen.getByRole("heading", { level: 1, name: BRIEF_COPY.closingTitle })).toBeTruthy();
    const list = screen.getByRole("list", { name: BRIEF_COPY.closingTitle });
    expect(list.querySelectorAll("li")).toHaveLength(3);
    expect(list.querySelectorAll("svg.als-closing-icon")).toHaveLength(3);
    const link = screen.getByRole("link", { name: /Sınav Sabahı Kağıdı/ });
    expect(link.getAttribute("href")).toBe("/deneme-sinavlari/p/sinav-sabahi");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.textContent).not.toContain("Plus");
    expect(screen.getByRole("button", { name: "Dersi bitir" })).toBeTruthy();
  });

  it("kâğıt bu hesapta Plus'taysa bağlantıda rozet", () => {
    toEnd(true);
    expect(screen.getByRole("link", { name: /Sınav Sabahı Kağıdı/ }).textContent).toContain("Plus");
  });
});

describe("brief verilmeyen kullanımlar değişmez", () => {
  it("eski giriş kartı ('Bu derste neler var') ve 'Devam et'; kapanış kartı yok", () => {
    render(<ExamLessonSteps lesson={play(NOTE)} closeHref="/deneme-sinavlari/p" />);
    expect(screen.getByRole("region", { name: "Bu derste neler var" })).toBeTruthy();
    expect(screen.queryByText(BRIEF_COPY.prefaceTitle)).toBeNull();
    expect(screen.getByRole("button", { name: "Devam et" })).toBeTruthy();
    for (let guard = 0; guard < 20 && !screen.queryByRole("button", { name: "Dersi bitir" }); guard += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
    }
    expect(screen.getByRole("heading", { level: 1, name: "Özet" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: BRIEF_COPY.closingTitle })).toBeNull();
  });
});
