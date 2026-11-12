// @vitest-environment jsdom
import { existsSync, readFileSync, statSync } from "node:fs";
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
import { TourPlusPreview } from "@/components/landing/tour/plus-previews";
import { TourProductScreen } from "@/components/landing/tour/product-screens";
import { PLUS_ONLY_ACTIONS, PLUS_ONLY_NODE_KINDS } from "@/lib/billing/free-meters";
import { FREE_PAGE_TOTAL } from "@/lib/billing/free-tier-copy";
import demoLesson from "@/lib/demo/lesson.json";
import { clearGuestDocuments } from "@/lib/documents/guest-handoff";
import {
  TOUR_CARDS,
  TOUR_LESSON,
  TOUR_PODCAST_SAMPLE,
  TOUR_QUIZ,
  TOUR_SKETCH,
  TOUR_TRUE_FALSE,
  tourTwoOptionHint,
} from "@/lib/demo/guest-tour";
import { buildCramSheet } from "@/lib/learning/cram-sheet";
import { gradeLessonSectionCheck } from "@/lib/learning/lesson-play";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import { lessonV3Schema, screenCheck, v3ToV2 } from "@/lib/learning/lesson-v3";
import { trueFalseExplanation } from "@/lib/learning/true-false-quality";
import { TWO_OPTION_CHIP } from "@/lib/learning/twin-question-copy";
import { SKETCH_DIAGRAM_KINDS, sketchFormulaSteps } from "@/lib/learning/video-lesson";
import {
  GUEST_DOCUMENT_NEXT,
  JOURNEY_COPY,
  JOURNEY_FILE,
  JOURNEY_FINAL,
  JOURNEY_NEXT_LABEL,
  JOURNEY_OWN,
  JOURNEY_PLUS_ALSO,
  JOURNEY_PLUS_PLAY,
  JOURNEY_PLUS_PREVIEWS,
  JOURNEY_PRODUCT_STEPS,
  JOURNEY_RESULT,
  JOURNEY_ROADMAP,
  JOURNEY_STEP_IDS,
  JOURNEY_STEPS,
  isProductStep,
  journeyGoals,
  journeyGuideLine,
  journeyScore,
  journeySignupHref,
  nextJourneyStep,
  ownReadyTitle,
} from "@/lib/marketing/landing-journey";
import { AUDIENCE_SEGMENTS, audienceSegment } from "@/lib/marketing/landing-showcase";
import { FREE_PLAN_POINTS, HERO_FACTS, PLUS_PLAN_POINTS } from "@/lib/marketing/landing-content";

/*
  11 Kasım 2026, ürün sahibi: misafir ana sayfada örnek bir notu tarama alanına bırakıp ürünü yedi adımda kendi
  tıklamasıyla yaşasın (not → yol haritası → ders → soru → kart → doğru/yanlış → Plus vitrini); tur sıfır model
  maliyetiyle, hiç ağ isteği atmadan çalışsın.

  Aynı gün, ikinci kurgu: "Sistemde nasıl bir ekranla karşılaşacaklar, onu göstermemiz lazım. Kodlama kurgusunu iyi
  yap; görsel olarak da sisteme uysun." Ders, soru, kart ve doğru/yanlış adımlarında tur kendi çizimini değil ürünün
  kendi bileşenlerini çalıştırır; örnek veri ürünün veri biçimindedir ve ürünle aynı işlevle notlanır.

  Aynı gece, kokpit (canlı denetimden altı kusur): tur kahramanın içinde, ilk ekranda. Birinci adım iki kapılı (hazır
  örnek not ya da misafirin kendi dosyası; dosya sunucuya gitmez). Her ürün adımının altında "sıradaki adım" düğmesi.
  Plus adımında kuru liste yerine ürünün kendi parçalarıyla üç canlı önizleme. "Hiçbir dosya yüklenmez" uyarısı kalktı.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

Element.prototype.scrollIntoView = vi.fn();
// jsdom ses oynatmayı uygulamaz; önizleme adımdan çıkarken sesi susturur (günlük kirlenmesin).
window.HTMLMediaElement.prototype.pause = () => undefined;

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Bekleyen dosyanın işareti sekme oturumunda ve bellekte durur: testler arasında temizlenir.
  await clearGuestDocuments();
  window.sessionStorage.clear();
});

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));
const noop = () => undefined;
/** Düğmenin adı: süs simgesi (aria-hidden) sayılmaz. */
const nextName = (label: string) => new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

describe("turun örnek verisi ürünün veri biçiminde ve doğru", () => {
  it("yedi adım, sırayla; dört adım ürünün kendi ekranı", () => {
    expect(JOURNEY_STEP_IDS).toEqual(["upload", "roadmap", "lesson", "question", "cards", "check", "plus"]);
    expect(JOURNEY_STEPS.map((step) => step.id)).toEqual([...JOURNEY_STEP_IDS]);
    expect(journeyGuideLine("upload")).toMatch(/^Adım 1\/7: /);
    expect(journeyGuideLine("plus")).toMatch(/^Adım 7\/7: /);
    // Misafirin kendi dosyası bekliyorken ekranda örnek not ve çekirdek yok: satır onu anlatmaz, dosyayı anlatır.
    expect(journeyGuideLine("upload")).toContain("çekirdeğe");
    expect(journeyGuideLine("upload", { ownDocument: true })).toBe(`Adım 1/7: ${JOURNEY_OWN.guide}`);
    expect(JOURNEY_OWN.guide).not.toMatch(/çekirde|sürükle/);
    expect(journeyGuideLine("roadmap", { ownDocument: true })).toBe(journeyGuideLine("roadmap"));
    expect(nextJourneyStep("upload")).toBe("roadmap");
    expect(nextJourneyStep("plus")).toBeNull();
    expect([...JOURNEY_PRODUCT_STEPS]).toEqual(["lesson", "question", "cards", "check"]);
    expect(isProductStep("lesson")).toBe(true);
    expect(isProductStep("roadmap")).toBe(false);
    // Her ürün adımının "sıradaki adım" düğmesi var.
    expect(Object.keys(JOURNEY_NEXT_LABEL).sort()).toEqual([...JOURNEY_PRODUCT_STEPS].sort());
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

  it("Plus önizlemelerindeki her şey gerçekten Plus'ta; ücretsiz sütun yalnız ücretsiz olanları sayar", () => {
    expect(JOURNEY_PLUS_PREVIEWS.map((item) => item.id)).toEqual(["podcast", "video", "sheet"]);
    for (const kind of ["podcast", "oral", "written_exam"]) expect(PLUS_ONLY_NODE_KINDS.has(kind), kind).toBe(true);
    expect(PLUS_ONLY_ACTIONS.some((action) => /VIDEO/.test(action))).toBe(true);
    // Önizlemesi olmayan Plus özellikleri tek satırda adıyla.
    for (const word of ["sözlü deneme", "yazılı deneme"]) expect(JOURNEY_PLUS_ALSO.toLocaleLowerCase("tr")).toContain(word);
    const freeText = `${FREE_PLAN_POINTS.join(" ")} ${HERO_FACTS.join(" ")} ${JOURNEY_FINAL.title} ${JOURNEY_FINAL.body}`.toLocaleLowerCase("tr");
    expect(freeText).not.toMatch(/podcast|video|sözlü|yazılı deneme|ikiz sınav|sınav sabahı/);
    const plusText = PLUS_PLAN_POINTS.join(" ").toLocaleLowerCase("tr");
    for (const word of ["podcast", "video", "sözlü", "yazılı deneme", "sınav sabahı"]) expect(plusText).toContain(word);
    expect(JOURNEY_FINAL.title).toContain("süre sınırı olmadan ücretsiz");
    expect(journeySignupHref("akademik")).toBe("/kayit?hedef=akademik");
  });

  it("her önizleme neyin kesiti olduğunu söyler; soğuk 'hiçbir dosya yüklenmez' uyarısı yok", () => {
    for (const item of JOURNEY_PLUS_PREVIEWS) expect(item.note.length, item.id).toBeGreaterThan(30);
    // Podcast kesiti turdaki nottan değil, gerçek bir bölümden; kart bunu açıkça yazar.
    expect(JOURNEY_PLUS_PREVIEWS[0]!.note).toMatch(/Gerçek bir bölümden kesit/);
    expect(JOURNEY_PLUS_PREVIEWS[1]!.note).toMatch(/Sessiz önizleme/);
    const copy = withoutComments(read("src/lib/marketing/landing-journey.ts"));
    expect(copy).not.toMatch(/hiçbir dosya yüklenmez|Tanıtım turu:/);
    expect(copy).not.toMatch(/10 saniyede|%100|herkes /i);
  });
});

describe("Plus önizlemelerinin verisi gerçek", () => {
  it("podcast kesiti örnek dersin hazır bölümünün ilk iki satırı; süreler ölçülen süreler; ses dosyası depoda", () => {
    const lines = demoLesson.podcast.chapters.flatMap((chapter: { lines: { speaker: string; text: string }[] }) => chapter.lines);
    expect(TOUR_PODCAST_SAMPLE.lines).toHaveLength(2);
    TOUR_PODCAST_SAMPLE.lines.forEach((line, at) => {
      expect(line.text).toBe(lines[at]!.text);
      expect(line.speaker).toBe(lines[at]!.speaker);
      expect(line.endMs - line.startMs).toBe(demoLesson.audio[at]!.durationMs);
    });
    expect(TOUR_PODCAST_SAMPLE.lines[0]!.startMs).toBe(0);
    expect(TOUR_PODCAST_SAMPLE.lines[1]!.startMs).toBe(TOUR_PODCAST_SAMPLE.lines[0]!.endMs);
    expect(TOUR_PODCAST_SAMPLE.durationMs).toBe(TOUR_PODCAST_SAMPLE.lines[1]!.endMs);
    // Yaklaşık on beş saniye: düğmenin sözüyle aynı.
    expect(TOUR_PODCAST_SAMPLE.durationMs).toBeGreaterThan(13_000);
    expect(TOUR_PODCAST_SAMPLE.durationMs).toBeLessThan(16_000);
    expect(JOURNEY_PLUS_PLAY.podcast).toContain("15 saniyelik");
    const file = `public${TOUR_PODCAST_SAMPLE.src}`;
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(50_000);
    expect(statSync(file).size).toBeLessThan(400_000);
  });

  it("çizimli video sahneleri ürünün sahne biçiminde; formül adımları ok işaretinden bölünür ve hesap tutar", () => {
    expect(TOUR_SKETCH.scenes).toHaveLength(2);
    for (const scene of TOUR_SKETCH.scenes) {
      expect(SKETCH_DIAGRAM_KINDS).toContain(scene.diagram.diagramKind);
      expect(scene.diagram.items.length).toBeGreaterThanOrEqual(2);
      expect(scene.narration.split(/\s+/).length).toBeLessThanOrEqual(26);
      expect((scene.keyFact ?? "").split(/\s+/).length).toBeLessThanOrEqual(8);
    }
    expect(sketchFormulaSteps(TOUR_SKETCH.scenes[0]!.formula!)).toEqual(["\\sqrt{(-4)^2}", "|−4|", "4"]);
    expect(Math.sqrt((-4) ** 2)).toBe(4);
    expect(sketchFormulaSteps(TOUR_SKETCH.scenes[1]!.formula!)).toEqual(["\\sqrt[3]{-8}", "−2"]);
    expect(Math.cbrt(-8)).toBe(-2);
  });

  it("sınav sabahı kâğıdı turdaki dersten, ürünün derleyicisiyle çıkar", () => {
    const sheet = buildCramSheet({ topics: [{ key: "tur", label: "Kök dışına çıkarma" }], lessons: [{ topicKey: "tur", lesson: TOUR_LESSON }] });
    expect(sheet.empty).toBe(false);
    const kinds = sheet.sections.flatMap((section) => section.items.map((item) => item.kind));
    expect(kinds).toContain("formula");
    expect(kinds).toContain("trap");
  });
});

describe("kurgu: tur ürünün kendi ekranlarını çalıştırır", () => {
  it("tur dosyaları ağ isteği atmaz, sunucu modülü içe aktarmaz", () => {
    for (const path of [
      "src/lib/marketing/landing-journey.ts",
      "src/lib/demo/guest-tour.ts",
      "src/lib/documents/guest-handoff.ts",
      "src/components/landing/futuristic-guided-journey.tsx",
      "src/components/landing/tour/product-screens.tsx",
      "src/components/landing/tour/plus-previews.tsx",
    ]) {
      const source = withoutComments(read(path));
      expect(source, path).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|\/api\/|supabase|server-only|openai/i);
    }
    // Örnek veri yalnız ürünün tiplerini içe aktarır.
    expect(read("src/lib/demo/guest-tour.ts").match(/^import .*$/gm)).toEqual([
      'import type { LessonV3 } from "@/lib/learning/lesson-v3";',
      'import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";',
      'import type { SketchScene } from "@/lib/learning/video-lesson";',
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
    for (const old of ["lj-formula", "lj-option", "lj-flip", "lj-truth", "lj-wave", "JOURNEY_LESSON", "JOURNEY_QUESTION", "JOURNEY_PLUS_CARDS"]) {
      expect(journey, old).not.toContain(old);
    }
    // Sunucu eylemi ve tur aynı notlandırma işlevini kullanır.
    expect(read("src/lib/learning/node/actions/grade-check.ts")).toContain("gradeLessonSectionCheck(");
  });

  it("Plus önizlemeleri de ürünün parçalarıdır: karaoke bileşeni, çizim tahtası, kâğıt görünümü ve derleyicisi", () => {
    const previews = withoutComments(read("src/components/landing/tour/plus-previews.tsx"));
    for (const real of ["<PodcastKaraokeLine", "<SketchBoard", "<CramSheetView", "buildCramSheet(", "captionChunks(", "sketchFormulaSteps("]) {
      expect(previews, real).toContain(real);
    }
    // Tarayıcının robot sesi kullanılmaz: kesit gerçek bölümün sesi.
    expect(previews).not.toMatch(/speechSynthesis|SpeechSynthesisUtterance/);
    expect(previews).toContain("src={sample.src}");
    // Tahta ürünün oynatıcı dosyasından dışa aktarılır; kâğıt önizlemede sayfanın ikinci h1'i olmaz.
    expect(read("src/components/parity/video-lesson.tsx")).toContain("export function SketchBoard(");
    const view = read("src/components/parity/cram-sheet-view.tsx");
    expect(view).toContain('const Title = preview ? "h3" : "h1";');
    expect(view).toContain('preview ? "cp-cram cp-cram-preview" : "cp-cram cp-cram-sheet"');
  });

  it("ürün ekranları ve önizlemeler ilk yükte yok: düz import() ile, Suspense sınırı olmadan yüklenir", () => {
    const journey = withoutComments(read("src/components/landing/futuristic-guided-journey.tsx"));
    expect(journey).toContain('import("@/components/landing/tour/product-screens")');
    expect(journey).toContain('import("@/components/landing/tour/plus-previews")');
    expect(journey).toContain('import type { TourScreenProps } from "@/components/landing/tour/product-screens";');
    expect(journey).toContain('import type { TourPlusPreviewProps } from "@/components/landing/tour/plus-previews";');
    expect(journey).not.toMatch(/Suspense|next\/dynamic|React\.lazy|\blazy\(/);
    // Kokpit ilk ekranda: parça ekrana yaklaşınca değil, ziyaretçi kokpite dokununca istenir.
    expect(journey).not.toContain("IntersectionObserver");
    expect(journey).toContain("onPointerEnter={loadScreens}");
    // Uygulamanın büyük stil dosyası yalnız ayrı parçalarda.
    expect(journey).not.toContain("parity-shell.css");
    expect(read("src/components/landing/tour/product-screens.tsx")).toContain('import "@/styles/parity-shell.css";');
    expect(read("src/components/landing/tour/plus-previews.tsx")).toContain('import "@/styles/parity-shell.css";');
  });

  it("parçalar geçişin içinde istenir: stil dosyaları inerken tıklamalar donmaz, ekran stilsiz açılmaz", () => {
    // 12 Kasım 2026, önizleme yayınında ölçüldü: import() olağan bir olayın içinde çağrılınca Next'in kökteki stil
    // bileşeni acil güncellemelerle aynı kümeye giriyor, stil dosyaları inene kadar hiçbir tıklama ekrana
    // yansımıyordu (sekme 1,8 sn). Davranışın kendisini e2e sınar (donusum.spec.ts); burada kalıp tutulur.
    const journey = withoutComments(read("src/components/landing/futuristic-guided-journey.tsx")).replace(/\s+/g, " ");
    for (const chunk of ["product-screens", "plus-previews"]) {
      expect(journey).toContain(`startTransition(() => { void import("@/components/landing/tour/${chunk}")`);
    }
    // Hazır ekran da geçişle yazılır: stil dosyalarıyla aynı kümede işlenir.
    expect(journey).toContain('startTransition(() => setScreens({ status: "ready", View: module.TourProductScreen }))');
    expect(journey).toContain('startTransition(() => setPreviews({ status: "ready", View: module.TourPlusPreview }))');
    // Parça dışında, geçişsiz bir import() kalmadı.
    expect(journey.match(/import\("/g)).toHaveLength(2);
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

  it("kartlar: önce çevir, sonra değerlendir; her dokunuşta kart 3B döner; iki karttan sonra biter", () => {
    const onDone = vi.fn();
    const { container } = render(<TourProductScreen screen="cards" onDone={onDone} onExit={noop} onQuestion={noop} onTruth={noop} />);
    expect(screen.queryByRole("group", { name: "Ne kadar bildin?" })).toBeNull();
    const card = container.querySelector("button.cp-exam-flash") as HTMLElement;
    // İlk çizimde dönüş yok; her dokunuş animasyonu yeniden başlatır.
    expect(card.getAttribute("data-turn")).toBeNull();
    click("Kartı çevir, cevabı göster");
    expect(card.getAttribute("data-turn")).toBe("a");
    fireEvent.click(within(screen.getByRole("group", { name: "Ne kadar bildin?" })).getAllByRole("button")[2]!);
    expect(onDone).not.toHaveBeenCalled();
    click("Kartı çevir, cevabı göster");
    expect(card.getAttribute("data-turn")).toBe("b");
    fireEvent.click(within(screen.getByRole("group", { name: "Ne kadar bildin?" })).getAllByRole("button")[2]!);
    expect(onDone).toHaveBeenCalledTimes(1);
    const css = read("src/styles/parity-shell.css");
    expect(css).toMatch(/\.cp-exam-flash\[data-turn\] \{\s*animation: cp-flash-turn-a/);
    expect(css).toMatch(/@keyframes cp-flash-turn-a \{[^}]*rotateY\(180deg\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.cp-exam-flash\[data-turn\],/);
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

describe("Plus önizlemeleri canlı çalışır, istek atmaz", () => {
  it("podcast: oynat düğmesi sesi başlatır, satırlar ve konuşan ses görünür; ses yüklenemezse sessiz akar", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const play = vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(noop);
    const { container } = render(<TourPlusPreview preview="podcast" />);
    for (const line of TOUR_PODCAST_SAMPLE.lines) expect(screen.getByText(line.text)).toBeTruthy();
    const audio = container.querySelector("audio") as HTMLAudioElement;
    expect(audio.getAttribute("src")).toBe(TOUR_PODCAST_SAMPLE.src);
    expect(audio.getAttribute("preload")).toBe("none");
    click(JOURNEY_PLUS_PLAY.podcast);
    expect(play).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".tpp-pod.is-playing")).toBeTruthy();
    expect(screen.getByRole("button", { name: JOURNEY_PLUS_PLAY.pause })).toBeTruthy();
    // İlk satır okunurken kelimeler ürünün karaoke bileşeniyle çizilir.
    expect(container.querySelector('.tpp-pod-line.is-now [data-karaoke="word"]')).toBeTruthy();
    // Ses hata verirse düğme ölü kalmaz: kelimeler sessiz akar ve ekran nedenini söyler.
    fireEvent.error(audio);
    expect(screen.getByText(new RegExp(JOURNEY_PLUS_PLAY.silent.slice(0, 20)))).toBeTruthy();
    expect(screen.getByRole("link", { name: "Örnek dersi aç" }).getAttribute("href")).toBe("/ornek");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("çizimli video: ürünün tahtası kendiliğinden oynar, sahneler sırayla döner, alt yazı akar", () => {
    vi.useFakeTimers();
    const { container } = render(<TourPlusPreview preview="video" />);
    expect(container.querySelector('.cp-video-frame.is-sketch [data-sketch="reel"]')).toBeTruthy();
    expect(screen.getByText(TOUR_SKETCH.scenes[0]!.sceneTitle)).toBeTruthy();
    expect(screen.getByText("Sahne 1/2")).toBeTruthy();
    expect(container.querySelector(".cp-video-caption")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(TOUR_SKETCH.sceneMs + 300);
    });
    expect(screen.getByText("Sahne 2/2")).toBeTruthy();
    expect(screen.getByText(TOUR_SKETCH.scenes[1]!.sceneTitle)).toBeTruthy();
    // Duraklatılınca sahne yerinde kalır.
    click(JOURNEY_PLUS_PLAY.pause);
    act(() => {
      vi.advanceTimersByTime(TOUR_SKETCH.sceneMs * 2);
    });
    expect(screen.getByText("Sahne 2/2")).toBeTruthy();
    expect(screen.getByRole("button", { name: JOURNEY_PLUS_PLAY.video })).toBeTruthy();
  });

  it("sınav sabahı kâğıdı: ürünün görünümü, önizleme kipinde (h3, yazdırma düğmesi yok)", () => {
    const { container } = render(<TourPlusPreview preview="sheet" />);
    const paper = container.querySelector(".tpp-paper .cp-cram.cp-cram-preview") as HTMLElement;
    expect(paper).toBeTruthy();
    expect(paper.querySelector("h1")).toBeNull();
    expect(paper.querySelector("h3#cram-title")).toBeTruthy();
    expect(paper.querySelector(".cp-cram-print")).toBeNull();
    // Baskı kurallarını tetikleyen sınıf önizlemede yok: ana sayfa yazdırılırken kâğıt sayfayı gizlemez.
    expect(container.querySelector(".cp-cram-sheet")).toBeNull();
    expect(paper.querySelectorAll(".cp-cram-item").length).toBeGreaterThanOrEqual(3);
  });
});

describe("kokpit sırası", () => {
  it("not → yol → ürün ekranı → … → Plus; her ürün adımında sıradaki adım düğmesi; ağ isteği yok", async () => {
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
    // Seçili sekmenin sınav sözü: üniversitede "Vizene".
    expect(screen.getByText("Vizene 7 gün var")).toBeTruthy();
    click(nextName(JOURNEY_ROADMAP.cta));

    // Ürün ekranı ayrı parça: yüklenince çerçevenin içinde ürünün ders ekranı durur.
    expect(screen.getByText(JOURNEY_COPY.real)).toBeTruthy();
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(container.querySelector(".tp-frame .tp-app .als")).toBeTruthy();

    // Adımlar oynanmadan da geçilir; her adımda çerçevenin içindeki ekran ve düğmenin sözü değişir.
    click(nextName(JOURNEY_NEXT_LABEL.lesson));
    expect(container.querySelector('.tp-frame[data-screen="question"]')).toBeTruthy();
    click(nextName(JOURNEY_NEXT_LABEL.question));
    expect(container.querySelector('.tp-frame[data-screen="cards"] .cp-exam-flash')).toBeTruthy();
    click(nextName(JOURNEY_NEXT_LABEL.cards));
    expect(container.querySelector('.tp-frame[data-screen="check"]')).toBeTruthy();
    click(nextName(JOURNEY_NEXT_LABEL.check));

    // Plus: dar ekranda üç önizleme seçiciyle tek tek; ilk açılan podcast.
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(JOURNEY_PLUS_PREVIEWS.map((item) => `${item.icon}${item.tab}`));
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelectorAll(".lj-plus-badge")).toHaveLength(1);
    expect(container.querySelector('[data-plus-preview="podcast"] [data-preview="podcast"]')).toBeTruthy();
    fireEvent.click(tabs[1]!);
    expect(container.querySelector('[data-plus-preview="video"] [data-preview="video"]')).toBeTruthy();
    fireEvent.click(tabs[2]!);
    expect(container.querySelector('[data-plus-preview="sheet"] .tpp-paper')).toBeTruthy();
    expect(screen.getByText(JOURNEY_PLUS_ALSO)).toBeTruthy();

    const signup = screen.getByRole("link", { name: new RegExp(JOURNEY_FINAL.cta) });
    expect(signup.getAttribute("href")).toBe("/kayit?hedef=universite");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("geniş ekranda üç önizleme yan yana, seçici yok", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("min-width"),
        media: query,
        addEventListener: noop,
        removeEventListener: noop,
      })),
    );
    const { container } = render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Adım \d: / })[6]!);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(screen.queryByRole("tablist", { name: "Plus önizlemeleri" })).toBeNull();
    expect(container.querySelectorAll(".lj-plus-grid.is-wide > .lj-plus-card")).toHaveLength(3);
    expect(container.querySelectorAll(".lj-plus-badge")).toHaveLength(3);
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
    click(nextName(JOURNEY_RESULT.cta));
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

  it("seçili sekme turun bağlamını değiştirir: dört profil de kendi cümlesini ve sınav sözünü görür", () => {
    for (const segment of AUDIENCE_SEGMENTS) {
      expect(segment.tourContext, segment.id).toMatch(/^Örnek not matematik/);
      expect(segment.tourContext.length, segment.id).toBeLessThanOrEqual(90);
      expect(journeyGoals(segment.examWord)[0]).toBe(`${segment.examWord} 7 gün var`);
    }
    expect(new Set(AUDIENCE_SEGMENTS.map((segment) => segment.tourContext)).size).toBe(4);
    expect(audienceSegment("universite").examWord).toBe("Vizene");
    const { container, rerender } = render(<FuturisticGuidedJourney segmentId="lise" />);
    expect(container.querySelector(".lj-context")?.textContent).toBe(audienceSegment("lise").tourContext);
    rerender(<FuturisticGuidedJourney segmentId="akademik" />);
    const context = container.querySelector(".lj-context") as HTMLElement;
    expect(context.textContent).toBe(audienceSegment("akademik").tourContext);
    expect(context.getAttribute("data-segment")).toBe("akademik");
    // Kokpitin kendi başlık bölümü yok: konsolun başında canlı etiketi ve turun adı.
    expect(screen.getByRole("heading", { level: 2, name: JOURNEY_COPY.title })).toBeTruthy();
    expect(container.querySelector(".lj-live")?.textContent).toContain(JOURNEY_COPY.live);
  });
});

describe("birinci adım: misafirin kendi dosyası", () => {
  const pdf = () => new File([new Uint8Array(2048)], "Anatomi_vize_notu.pdf", { type: "application/pdf" });

  it("iki kapı: hazır örnek not ve kendi dosyan; dosya seçici ürünün kabul ettiği türleri alır", () => {
    const { container } = render(<FuturisticGuidedJourney segmentId="lise" />);
    expect(screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.sampleCta) })).toBeTruthy();
    expect(screen.getByText(JOURNEY_FILE.meta).textContent).toMatch(/^Örnek not/);
    expect(screen.getByText(JOURNEY_OWN.title)).toBeTruthy();
    expect(screen.getByRole("button", { name: JOURNEY_OWN.pick })).toBeTruthy();
    const input = container.querySelector("input[data-guest-input]") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.multiple).toBe(true);
    for (const kind of [".pdf", ".docx", ".pptx", ".jpg", ".png"]) expect(input.accept).toContain(kind);
  });

  it("dosya seçilince sunucuya gitmez; onay kartı açılır ve kayıt bağlantısı dosyayı kuruluma taşır", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = render(<FuturisticGuidedJourney segmentId="universite" />);
    const input = container.querySelector("input[data-guest-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf()] } });
    expect(await screen.findByText(ownReadyTitle(["Anatomi_vize_notu.pdf"]))).toBeTruthy();
    const card = container.querySelector("[data-guest-document]") as HTMLElement;
    expect(within(card).getByText(JOURNEY_OWN.body).textContent).toContain(`toplam ${FREE_PAGE_TOTAL} sayfa`);
    const link = within(card).getByRole("link", { name: new RegExp(JOURNEY_OWN.cta) });
    expect(link.getAttribute("href")).toBe(`/kayit?hedef=universite&kaynak=belge&next=${encodeURIComponent(GUEST_DOCUMENT_NEXT)}`);
    // jsdom'da IndexedDB yok: kart dosyanın saklanamadığını söyler (verilmeyen söz yok).
    expect(within(card).getByText(JOURNEY_OWN.notKept)).toBeTruthy();
    // İşaret sekme oturumunda: kayıttan dönünce kart yeniden görünür.
    expect(JSON.parse(window.sessionStorage.getItem("cp:guest-doc") ?? "{}").names).toEqual(["Anatomi_vize_notu.pdf"]);
    // Son adımdaki kayıt düğmesi de belgeyi taşır.
    fireEvent.click(screen.getAllByRole("button", { name: /^Adım \d: / })[6]!);
    const final = screen.getByRole("link", { name: new RegExp(JOURNEY_FINAL.ctaWithDocument) });
    expect(final.getAttribute("href")).toContain("kaynak=belge");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("örnek tur dosya bekletilirken de oynanır; dosya kaldırılınca iki kapı geri gelir", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.change(container.querySelector("input[data-guest-input]") as HTMLInputElement, { target: { files: [pdf()] } });
    await screen.findByText(ownReadyTitle(["Anatomi_vize_notu.pdf"]));
    click(JOURNEY_OWN.remove);
    expect(container.querySelector("[data-guest-document]")).toBeNull();
    expect(window.sessionStorage.getItem("cp:guest-doc")).toBeNull();
    expect(screen.getByRole("button", { name: JOURNEY_OWN.pick })).toBeTruthy();
    fireEvent.change(container.querySelector("input[data-guest-input]") as HTMLInputElement, { target: { files: [pdf()] } });
    await screen.findByText(ownReadyTitle(["Anatomi_vize_notu.pdf"]));
    click(JOURNEY_OWN.playSample);
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.scanMs);
    });
    expect(screen.getByRole("heading", { name: "Yol haritan çıktı" })).toBeTruthy();
  });

  it("okunamayan tür reddedilir ve nedeni söylenir", async () => {
    const { container } = render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.change(container.querySelector("input[data-guest-input]") as HTMLInputElement, {
      target: { files: [new File(["x"], "oyun.exe", { type: "application/octet-stream" })] },
    });
    expect((await screen.findByRole("alert")).textContent).toContain("oyun.exe bu türde okunamıyor");
    expect(container.querySelector("[data-guest-document]")).toBeNull();
  });

  it("kayıt bağlantısı: belgesiz düz, belgeyle kaynak=belge ve kurulum hedefi", () => {
    expect(journeySignupHref("lise")).toBe("/kayit?hedef=lise");
    expect(journeySignupHref("yks-lgs", { withDocument: true })).toBe("/kayit?hedef=yks-lgs&kaynak=belge&next=%2Fdeneme-sinavlari%2Folustur");
    expect(ownReadyTitle(["a.pdf", "b.jpg", "c.jpg"])).toBe("3 dosya taramaya hazır!");
  });
});

describe("görünüm kuralları", () => {
  const css = read("src/styles/landing-journey.css");

  it("yazı 12 px altına inmez, dokunma alanı 44 px, hareket azaltmada durur", () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(15);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0.75);
    for (const selector of [".lj-stop", ".lj-cta", ".lj-next", ".lj-plus-tab"]) {
      const rule = css.match(new RegExp(`\\${selector} \\{[^}]*\\}`))?.[0] ?? "";
      const height = Number(rule.match(/min-height:\s*([\d.]+)rem/)?.[1] ?? 0);
      expect(height, selector).toBeGreaterThanOrEqual(2.75);
    }
    expect(css).toMatch(/\.lj-ghost,\n\.lj-chip \{[^}]*min-height: 2\.75rem/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    // Dolu düğme kâğıt beyazı, yazısı mürekkep (ikinci tur: mavi düğme kalktı).
    expect(css).toMatch(/\.lj-cta \{[^}]*background: var\(--lj-paper\);[^}]*color: var\(--lj-paper-ink\)/);
    // "Sıradaki adım" düğmesi şeritten çerçeveli, dolu değil: çerçevedeki ürün düğmeleriyle yarışmaz.
    expect(css).toMatch(/\.lj-next \{[^}]*var\(--lj-ribbon\) border-box;/);
    const previews = read("src/styles/tour-previews.css");
    const previewSizes = [...previews.matchAll(/font-size:\s*([\d.]+)rem/g)].map((match) => Number(match[1]));
    expect(Math.min(...previewSizes)).toBeGreaterThanOrEqual(0.75);
    expect(previews).toMatch(/\.tpp-play \{[^}]*min-height: 2\.75rem/);
    expect(previews).toContain("@media (prefers-reduced-motion: reduce)");
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

  it("ana sayfa: kahraman ve kokpit tek ekranda; planlar ve SSS sonda; eski ara bölümler geri gelmedi", () => {
    const page = withoutComments(read("src/components/landing/landing-page.tsx"));
    expect(page).toContain("<AudienceHero />");
    for (const removed of ["<PlusMonth", "<AdvantageShowcase", "<AdvantageComparison", "<FeatureReel", "<HeroScene", "lp-proof", "lp-flow", "lp-bento"]) {
      expect(page, removed).not.toContain(removed);
    }
    expect(page.indexOf("<AudienceHero />")).toBeLessThan(page.indexOf('id="planlar"'));
    expect(page.indexOf('id="planlar"')).toBeLessThan(page.indexOf("lp-faq"));
    // Tur "Nasıl çalışır" çapasını taşır ve kahramanın içindedir.
    expect(read("src/components/landing/futuristic-guided-journey.tsx")).toContain('id="nasil" className="lj"');
    const hero = withoutComments(read("src/components/landing/audience-hero.tsx"));
    expect(hero).toContain('<div className="hm-hero-cockpit">');
    expect(hero.indexOf("<AudienceTabs")).toBeLessThan(hero.indexOf("<FuturisticGuidedJourney"));
    expect(hero.indexOf("<FuturisticGuidedJourney")).toBeLessThan(hero.indexOf("HERO_FACTS.map"));
    // Durağan sahne ve film şeridi dosyaları silindi.
    expect(existsSync("src/components/landing/hero-scene.tsx")).toBe(false);
    expect(existsSync("src/components/landing/feature-reel.tsx")).toBe(false);
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
