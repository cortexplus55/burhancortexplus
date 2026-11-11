// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img alt="" {...(props as object)} />,
}));

import { FuturisticGuidedJourney } from "@/components/landing/futuristic-guided-journey";
import { TourProductScreen } from "@/components/landing/tour/product-screens";
import { PLUS_ONLY_ACTIONS, PLUS_ONLY_NODE_KINDS } from "@/lib/billing/free-meters";
import { TOUR_CARDS, TOUR_LESSON, TOUR_QUIZ, TOUR_TRUE_FALSE, tourTwoOptionHint } from "@/lib/demo/guest-tour";
import { gradeLessonSectionCheck } from "@/lib/learning/lesson-play";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import { lessonV3Schema, screenCheck, v3ToV2 } from "@/lib/learning/lesson-v3";
import { trueFalseExplanation } from "@/lib/learning/true-false-quality";
import { TWO_OPTION_CHIP } from "@/lib/learning/twin-question-copy";
import {
  JOURNEY_COPY,
  JOURNEY_FILE,
  JOURNEY_FINAL,
  JOURNEY_PLUS_CARDS,
  JOURNEY_PRODUCT_STEPS,
  JOURNEY_RESULT,
  JOURNEY_ROADMAP,
  JOURNEY_STEP_IDS,
  JOURNEY_STEPS,
  isProductStep,
  journeyGuideLine,
  journeyScore,
  journeySignupHref,
  nextJourneyStep,
} from "@/lib/marketing/landing-journey";
import { FREE_PLAN_POINTS, HERO_FACTS, PLUS_PLAN_POINTS } from "@/lib/marketing/landing-content";

/*
  11 Kasım 2026, ürün sahibi: misafir ana sayfada örnek bir notu tarama alanına bırakıp ürünü yedi adımda kendi
  tıklamasıyla yaşasın (not → yol haritası → ders → soru → kart → doğru/yanlış → Plus vitrini); tur sıfır model
  maliyetiyle, hiç ağ isteği atmadan çalışsın.

  Aynı gün, ikinci kurgu: "Sistemde nasıl bir ekranla karşılaşacaklar, onu göstermemiz lazım. Kodlama kurgusunu iyi
  yap; görsel olarak da sisteme uysun." Ders, soru, kart ve doğru/yanlış adımlarında tur kendi çizimini değil ürünün
  kendi bileşenlerini çalıştırır; örnek veri ürünün veri biçimindedir ve ürünle aynı işlevle notlanır.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));
const noop = () => undefined;

describe("turun örnek verisi ürünün veri biçiminde ve doğru", () => {
  it("yedi adım, sırayla; dört adım ürünün kendi ekranı", () => {
    expect(JOURNEY_STEP_IDS).toEqual(["upload", "roadmap", "lesson", "question", "cards", "check", "plus"]);
    expect(JOURNEY_STEPS.map((step) => step.id)).toEqual([...JOURNEY_STEP_IDS]);
    expect(journeyGuideLine("upload")).toMatch(/^Adım 1\/7: /);
    expect(journeyGuideLine("plus")).toMatch(/^Adım 7\/7: /);
    expect(nextJourneyStep("upload")).toBe("roadmap");
    expect(nextJourneyStep("plus")).toBeNull();
    expect([...JOURNEY_PRODUCT_STEPS]).toEqual(["lesson", "question", "cards", "check"]);
    expect(isProductStep("lesson")).toBe(true);
    expect(isProductStep("roadmap")).toBe(false);
  });

  it("ders ürünün LessonV3 şemasından geçer; her ekranın bir sorusu var; mühürlü pakette cevap yok", () => {
    const parsed = lessonV3Schema.safeParse(TOUR_LESSON);
    expect(parsed.success).toBe(true);
    expect(TOUR_LESSON.screens).toHaveLength(2);
    for (const screenItem of TOUR_LESSON.screens) expect(screenCheck(screenItem), screenItem.heading).toBeTruthy();
    // İlk ekran "önce dene": soru ilk blok.
    expect(TOUR_LESSON.screens[0]!.blocks[0]!.type).toBe("check");
    const kinds = TOUR_LESSON.screens.flatMap((item) => item.blocks.map((block) => block.type));
    for (const kind of ["formula", "exam_trap_card", "memory_hook_card", "example"]) expect(kinds, kind).toContain(kind);
    const sealed = JSON.stringify(sealLessonV3ForPlay(TOUR_LESSON));
    expect(sealed).not.toContain("answerIndex");
    expect(sealed).not.toContain("optionWhy");
  });

  it("ders soruları ürünle aynı işlevle notlanır", () => {
    const stored = v3ToV2(TOUR_LESSON);
    // 1. ekran: √((−5)²) = −5 önermesi yanlış.
    expect(Math.sqrt((-5) ** 2)).toBe(5);
    const right = gradeLessonSectionCheck(stored, 0, { pick: 1 }, "primary", "tr");
    expect(right?.correct).toBe(true);
    expect(right?.retryCheck).toBeTruthy();
    const wrong = gradeLessonSectionCheck(stored, 0, { pick: 0 }, "primary", "tr");
    expect(wrong?.correct).toBe(false);
    expect(wrong?.corrected).toContain("|−5| = 5");
    // 2. ekran: x < 0 iken √(x²) = −x.
    for (const x of [-3, -0.5, -12]) expect(Math.sqrt(x ** 2)).toBe(-x);
    expect(gradeLessonSectionCheck(stored, 1, { pick: 1 }, "primary", "tr")?.correct).toBe(true);
    expect(gradeLessonSectionCheck(stored, 1, { pick: 0 }, "primary", "tr")?.correct).toBe(false);
    // Çözümlü örnek: √((−3)²) + ∛(−27) = 0.
    expect(Math.sqrt((-3) ** 2) + Math.cbrt(-27)).toBe(0);
    expect(gradeLessonSectionCheck(stored, 9, { pick: 0 }, "primary", "tr")).toBeNull();
  });

  it("konu testi sorusu hesapla tutar; iki şık ipucu cevabı söylemez", () => {
    expect(Math.sqrt((-4) ** 2) + Math.cbrt(-8)).toBe(2);
    const question = TOUR_QUIZ[0]!;
    expect(TOUR_QUIZ).toHaveLength(1);
    expect(question.options).toHaveLength(5);
    expect(question.correct).toEqual(["2"]);
    expect(question.optionWhy).toHaveLength(5);
    for (const a of question.options) {
      for (const b of question.options) {
        if (a === b) continue;
        const hint = tourTwoOptionHint([a, b]);
        expect(hint.length, `${a}/${b}`).toBeGreaterThan(20);
        expect(hint, `${a}/${b}`).not.toMatch(/\d|doğru (cevap|şık)|cevap\s/i);
      }
    }
  });

  it("kartlar ve önermeler aynı kuralı söyler; yanlış önermenin doğrusu yazılı", () => {
    expect(TOUR_CARDS).toHaveLength(2);
    expect(TOUR_CARDS[0]!.back).toContain("|a|");
    expect(Math.cbrt(-27)).toBe(-3);
    expect(TOUR_TRUE_FALSE.map((item) => item.correct)).toEqual([true, false]);
    expect(Math.cbrt(-8)).toBe(-2);
    expect(trueFalseExplanation(TOUR_TRUE_FALSE[1]!)).toMatch(/^✏️ Doğrusu: ³√\(−8\) = −2/);
  });

  it("sonuç ziyaretçinin gerçek cevaplarından: uydurma yüzde yok", () => {
    expect(journeyScore({ questionCorrect: true, truth: { right: 2, total: 2 } })).toMatchObject({ correct: 3, answered: 3, pct: 100 });
    expect(journeyScore({ questionCorrect: false, truth: { right: 1, total: 2 } })).toMatchObject({ correct: 1, pct: 33, line: "3 sorudan 1 doğru" });
    expect(journeyScore({ questionCorrect: null, truth: { right: 0, total: 2 } })).toMatchObject({ correct: 0, answered: 2, pct: 0 });
    expect(journeyScore({ questionCorrect: null, truth: null })).toMatchObject({ answered: 0, pct: null });
  });

  it("Plus vitrinindeki her şey gerçekten Plus'ta; ücretsiz sütun yalnız ücretsiz olanları sayar", () => {
    expect(JOURNEY_PLUS_CARDS.map((card) => card.id)).toEqual(["podcast", "video", "oral", "exam"]);
    for (const kind of ["podcast", "oral", "written_exam"]) expect(PLUS_ONLY_NODE_KINDS.has(kind), kind).toBe(true);
    expect(PLUS_ONLY_ACTIONS.some((action) => /VIDEO/.test(action))).toBe(true);
    const freeText = `${FREE_PLAN_POINTS.join(" ")} ${HERO_FACTS.join(" ")} ${JOURNEY_FINAL.body}`.toLocaleLowerCase("tr");
    expect(freeText).not.toMatch(/podcast|video|sözlü|yazılı deneme|ikiz sınav|sınav sabahı/);
    const plusText = PLUS_PLAN_POINTS.join(" ").toLocaleLowerCase("tr");
    for (const word of ["podcast", "video", "sözlü", "yazılı deneme", "sınav sabahı"]) expect(plusText).toContain(word);
    expect(JOURNEY_FINAL.body).toContain("süre sınırı olmadan ücretsiz");
    expect(journeySignupHref("akademik")).toBe("/kayit?hedef=akademik");
  });
});

describe("kurgu: tur ürünün kendi ekranlarını çalıştırır", () => {
  it("tur dosyaları ağ isteği atmaz, sunucu modülü içe aktarmaz", () => {
    for (const path of [
      "src/lib/marketing/landing-journey.ts",
      "src/lib/demo/guest-tour.ts",
      "src/components/landing/futuristic-guided-journey.tsx",
      "src/components/landing/tour/product-screens.tsx",
    ]) {
      const source = withoutComments(read(path));
      expect(source, path).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|\/api\/|supabase|server-only|openai/i);
    }
    // Örnek veri yalnız ürünün tiplerini içe aktarır.
    expect(read("src/lib/demo/guest-tour.ts").match(/^import .*$/gm)).toEqual([
      'import type { LessonV3 } from "@/lib/learning/lesson-v3";',
      'import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";',
    ]);
  });

  it("ekranlar ürünün bileşenleridir; tur kendi ders, soru, kart çizimini taşımaz", () => {
    const screens = withoutComments(read("src/components/landing/tour/product-screens.tsx"));
    for (const real of ["<ExamLessonSteps", "<ExamQuizPlay", "<TwoOptionHint", "<FlashCard", "<CardGradeButtons", "<TrueFalseFocusCard"]) {
      expect(screens, real).toContain(real);
    }
    expect(screens).toContain("gradeLessonSectionCheck(");
    expect(screens).toContain("sealLessonV3ForPlay(TOUR_LESSON)");
    expect(screens).toContain("resolve={tourTwoOptionHint}");
    // Uygulamanın kendi kabuk sınıfları: ekranlar üründeki renk ve ölçülerle çizilir.
    expect(screens).toContain('className="tp-app dark cp-sor-root cp-sor-root--session"');
    const journey = withoutComments(read("src/components/landing/futuristic-guided-journey.tsx"));
    for (const old of ["lj-formula", "lj-option", "lj-flip", "lj-truth", "JOURNEY_LESSON", "JOURNEY_QUESTION"]) {
      expect(journey, old).not.toContain(old);
    }
    // Sunucu eylemi ve tur aynı notlandırma işlevini kullanır.
    expect(read("src/lib/learning/node/actions/grade-check.ts")).toContain("gradeLessonSectionCheck(");
  });

  it("ürün ekranları ilk yükte yok: düz import() ile, Suspense sınırı olmadan yüklenir", () => {
    const journey = withoutComments(read("src/components/landing/futuristic-guided-journey.tsx"));
    expect(journey).toContain('import("@/components/landing/tour/product-screens")');
    expect(journey).toContain('import type { TourScreenProps } from "@/components/landing/tour/product-screens";');
    expect(journey).not.toMatch(/Suspense|next\/dynamic|React\.lazy|\blazy\(/);
    // Uygulamanın büyük stil dosyası yalnız ayrı parçada.
    expect(journey).not.toContain("parity-shell.css");
    expect(read("src/components/landing/tour/product-screens.tsx")).toContain('import "@/styles/parity-shell.css";');
  });
});

describe("ürün ekranları örnek veriyle, istek atmadan çalışır", () => {
  it("konu testi: iki şık ipucu yerel; cevap kilitlenince sonuç bildirilir", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const onQuestion = vi.fn();
    const onDone = vi.fn();
    const { container } = render(<TourProductScreen screen="question" onDone={onDone} onExit={noop} onQuestion={onQuestion} onTruth={noop} />);
    expect(screen.getByText(TOUR_QUIZ[0]!.text)).toBeTruthy();
    click(TWO_OPTION_CHIP);
    const pair = within(container.querySelector(".cp-two") as HTMLElement);
    fireEvent.click(pair.getByRole("button", { name: "A" }));
    fireEvent.click(pair.getByRole("button", { name: "C" }));
    expect(await screen.findByText(/ilk terimin kök dışına hangi işaretle çıktığı/)).toBeTruthy();
    fireEvent.click(screen.getByText("2", { selector: "button *, button" }));
    click(/Kontrol et/);
    expect(onQuestion).toHaveBeenCalledWith(true);
    expect(screen.getByText(TOUR_QUIZ[0]!.explanation!)).toBeTruthy();
    click(/Testi bitir/);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("kartlar: önce çevir, sonra değerlendir; iki karttan sonra biter", () => {
    const onDone = vi.fn();
    render(<TourProductScreen screen="cards" onDone={onDone} onExit={noop} onQuestion={noop} onTruth={noop} />);
    expect(screen.queryByRole("group", { name: "Ne kadar bildin?" })).toBeNull();
    click("Kartı çevir, cevabı göster");
    fireEvent.click(within(screen.getByRole("group", { name: "Ne kadar bildin?" })).getAllByRole("button")[2]!);
    expect(onDone).not.toHaveBeenCalled();
    click("Kartı çevir, cevabı göster");
    fireEvent.click(within(screen.getByRole("group", { name: "Ne kadar bildin?" })).getAllByRole("button")[2]!);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("doğru/yanlış: iki önerme; sonuç gerçek cevaplardan bildirilir", () => {
    const onTruth = vi.fn();
    const onDone = vi.fn();
    render(<TourProductScreen screen="check" onDone={onDone} onExit={noop} onQuestion={noop} onTruth={onTruth} />);
    click(/^Doğru/);
    click("Sonraki önerme");
    click(/^Doğru/);
    click("Sonucu gör");
    // İlki doğru bilindi, ikincisi (yanlış önerme) "Doğru" denerek kaçırıldı.
    expect(onTruth).toHaveBeenCalledWith(1, TOUR_TRUE_FALSE.length);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("ders: ürünün ders ekranı açılır ve önce dene sorusu yerelde notlanır", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = render(<TourProductScreen screen="lesson" onDone={noop} onExit={noop} onQuestion={noop} onTruth={noop} />);
    expect(container.querySelector(".tp-app .als")).toBeTruthy();
    expect(screen.getByText(TOUR_LESSON.title)).toBeTruthy();
    click(/^Devam et/);
    expect(screen.getByText(screenCheck(TOUR_LESSON.screens[0]!)!.prompt)).toBeTruthy();
    click(/Doğru/);
    // Yanlış cevap: ürünün geri bildirimi ("Doğrusu") ve ardından açılan sınav tuzağı kartı aynı doğruyu yazar.
    expect((await screen.findAllByText(/√\(\(−5\)²\) = \|−5\| = 5/, { selector: ".als *" }, { timeout: 3000 })).length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("tur sırası", () => {
  it("not → yol → ürün ekranı → … → Plus; ağ isteği yok", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = render(<FuturisticGuidedJourney segmentId="universite" />);

    expect(screen.getByRole("status").textContent).toContain("Adım 1/7");
    click(new RegExp(JOURNEY_FILE.name));
    expect(screen.getByText(JOURNEY_FILE.scanning[0]!)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.scanMs);
    });
    expect(screen.getByRole("heading", { name: "Yol haritan çıktı" })).toBeTruthy();
    for (const day of JOURNEY_ROADMAP.days) expect(screen.getByText(day.title)).toBeTruthy();
    click(JOURNEY_ROADMAP.cta);

    // Ürün ekranı ayrı parça: yüklenince çerçevenin içinde ürünün ders ekranı durur.
    expect(screen.getByText(JOURNEY_COPY.real)).toBeTruthy();
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(container.querySelector(".tp-frame .tp-app .als")).toBeTruthy();

    // Adımlar oynanmadan da geçilir; her adımda çerçevenin içindeki ekran değişir.
    click(JOURNEY_COPY.skip);
    expect(container.querySelector('.tp-frame[data-screen="question"]')).toBeTruthy();
    click(JOURNEY_COPY.skip);
    expect(container.querySelector('.tp-frame[data-screen="cards"] .cp-exam-flash')).toBeTruthy();
    click(JOURNEY_COPY.skip);
    expect(container.querySelector('.tp-frame[data-screen="check"]')).toBeTruthy();
    click(JOURNEY_COPY.skip);

    expect(screen.getAllByText("Plus", { selector: ".lj-plus-badge" })).toHaveLength(JOURNEY_PLUS_CARDS.length);
    const signup = screen.getByRole("link", { name: new RegExp(JOURNEY_FINAL.cta) });
    expect(signup.getAttribute("href")).toBe("/kayit?hedef=universite");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("doğru/yanlış bitince sonuç halkası gerçek cevaplardan çizilir", async () => {
    const { container } = render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Adım \d: / })[5]!);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    const app = within(container.querySelector(".tp-app") as HTMLElement);
    fireEvent.click(app.getByRole("button", { name: /^Doğru/ }));
    fireEvent.click(app.getByRole("button", { name: "Sonraki önerme" }));
    fireEvent.click(app.getByRole("button", { name: /^Yanlış/ }));
    fireEvent.click(app.getByRole("button", { name: "Sonucu gör" }));
    expect(screen.getByText("2 sorudan 2 doğru")).toBeTruthy();
    expect(screen.getByText("%100")).toBeTruthy();
    click(new RegExp(JOURNEY_RESULT.cta.replace("?", "\\?")));
    expect(screen.getByRole("status").textContent).toContain("Adım 7/7");
  });

  it("ilerleme rayındaki her durak tıklanır; tur baştan oynanır", () => {
    render(<FuturisticGuidedJourney segmentId="lise" />);
    const stops = screen.getAllByRole("button", { name: /^Adım \d: / });
    expect(stops).toHaveLength(7);
    fireEvent.click(stops[6]!);
    expect(stops[6]!.getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("link", { name: new RegExp(JOURNEY_FINAL.cta) }).getAttribute("href")).toBe("/kayit?hedef=lise");
    click(JOURNEY_COPY.restart);
    expect(screen.getByRole("status").textContent).toContain("Adım 1/7");
  });

  it("sürükle-bırak da taramayı başlatır", () => {
    vi.useFakeTimers();
    render(<FuturisticGuidedJourney segmentId="lise" />);
    const zone = screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.zoneTitle) });
    fireEvent.dragOver(zone);
    fireEvent.drop(zone);
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.scanMs);
    });
    expect(screen.getByRole("heading", { name: "Yol haritan çıktı" })).toBeTruthy();
  });
});

describe("görünüm kuralları", () => {
  const css = read("src/styles/landing-journey.css");

  it("yazı 12 px altına inmez, dokunma alanı 44 px, hareket azaltmada durur", () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(15);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0.75);
    for (const selector of [".lj-stop", ".lj-cta"]) {
      const rule = css.match(new RegExp(`\\${selector} \\{[^}]*\\}`))?.[0] ?? "";
      const height = Number(rule.match(/min-height:\s*([\d.]+)rem/)?.[1] ?? 0);
      expect(height, selector).toBeGreaterThanOrEqual(2.75);
    }
    expect(css).toMatch(/\.lj-ghost,\n\.lj-chip \{[^}]*min-height: 2\.75rem/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    // Dolu düğme kâğıt beyazı, yazısı mürekkep (ikinci tur: mavi düğme kalktı).
    expect(css).toMatch(/\.lj-cta \{[^}]*background: var\(--lj-paper\);[^}]*color: var\(--lj-paper-ink\)/);
  });

  it("uygulama çerçevesi ürün ekranının görünüşüne dokunmaz; yalnız yerleşimi sığdırır", () => {
    const frame = withoutComments(read("src/styles/tour-product.css"));
    expect(frame).toMatch(/\.tp-app\.cp-sor-root \{[^}]*min-height: 0;/);
    expect(frame).toMatch(/\.tp-app \.als-top \{\s*position: static;/);
    // Çerçevenin içinde renk, yazı tipi ya da kenar kuralı yok: onlar ürünün kendi dosyalarından gelir.
    const inside = frame.split("}").filter((block) => /\.tp-app[ .]/.test(block.split("{")[0] ?? ""));
    for (const block of inside) expect(block).not.toMatch(/(^|\s)(color|background|font-family|border(-color)?):/);
    expect(frame).toMatch(/\.tp-app \.als-top button \{[^}]*min-height: 2\.75rem;/);
  });

  it("ana sayfa: kahraman + tur önce, planlar ve SSS sonda; eski ara bölümler geri gelmedi", () => {
    const page = withoutComments(read("src/components/landing/landing-page.tsx"));
    expect(page).toContain("<AudienceHero />");
    for (const removed of ["<PlusMonth", "<AdvantageShowcase", "<AdvantageComparison", "lp-proof", "lp-flow", "lp-bento"]) {
      expect(page, removed).not.toContain(removed);
    }
    expect(page.indexOf("<AudienceHero />")).toBeLessThan(page.indexOf('id="planlar"'));
    expect(page.indexOf('id="planlar"')).toBeLessThan(page.indexOf("lp-faq"));
    // Tur "Nasıl çalışır" çapasını taşır.
    expect(read("src/components/landing/futuristic-guided-journey.tsx")).toContain('id="nasil" className="lj"');
  });

  it("kanıt kartı ve tam karşılaştırma Özellikler sayfasında; kısa sürümün bağlantısı oraya gider", () => {
    const features = withoutComments(read("src/app/ozellikler/page.tsx"));
    expect(features).toContain("<AdvantageShowcase />");
    expect(features).toContain("<AdvantageComparison />");
    const sections = read("src/components/marketing/advantage-sections.tsx");
    expect(sections).toContain('<section id="farklar"');
    expect(sections).toContain('href="/ozellikler#farklar"');
    expect(sections).not.toContain('href="/#farklar"');
    // Menü sabit: sayfa içi bağlantının hedefi çubuğun altında kalmaz.
    expect(read("src/styles/parity-marketing.css")).toMatch(/section\[id\] \{\s*scroll-margin-top: 5\.5rem/);
  });

  it("üst menü: logo çekirdeği, şerit ve kaydırmada sabit; kayıt telefonda da görünür", () => {
    const header = read("src/components/marketing/parity-site-header.tsx");
    expect(header).toContain('<CortexMark size={40} priority className="mkh-mark" />');
    expect(header).toContain('className="mkh-rail"');
    expect(header).toContain("mk-btn-primary mkh-cta inline-flex min-h-[44px]");
    expect(header).not.toMatch(/mk-btn-primary hidden/);
    const shell = read("src/styles/parity-marketing.css");
    expect(shell).toMatch(/:is\(\.cinematic-home, \.cinematic-marketing\) > header\.mkh \{\s*position: sticky;\s*top: 0;/);
    expect(shell).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.mkh-halo,/);
  });
});
