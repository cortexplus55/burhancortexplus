// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { DEMO_PODCASTS } from "@/lib/demo/demo-podcasts";
import { GUEST_TOUR_CONTENT, GUEST_TOUR_LESSONS, GUEST_TOUR_PREPS, guestTourContent, guestTourWarningSteps } from "@/lib/demo/guest-tour-tracks";
import { mcqAnswerMismatch } from "@/lib/learning/answer-consistency";
import { unsafeStoredCheck } from "@/lib/learning/answer-key-consistency";
import { buildCramSheet } from "@/lib/learning/cram-sheet";
import { gradeLessonSectionCheck } from "@/lib/learning/lesson-play";
import { lessonV3Schema, screenCheck, v3ToV2 } from "@/lib/learning/lesson-v3";
import { trueFalseExplanation } from "@/lib/learning/true-false-quality";
import { lawTreeDepth, lawTreeOf, parseReelVisual } from "@/lib/learning/visual-scenes/schema";
import {
  GUEST_DEMO_TRACKS,
  GUEST_TRACK_IDS,
  guestDemoTrack,
  isGuestTrackId,
  segmentForTrack,
  trackForSegment,
  trackHasPodcast,
  type GuestTrackId,
} from "@/lib/marketing/guest-demo-tracks";
import {
  JOURNEY_FILE,
  JOURNEY_PLUS_PREVIEWS,
  JOURNEY_ROADMAP,
  JOURNEY_WARNING,
  JOURNEY_WARNING_STEPS,
  journeyFile,
  journeyPlusPreviews,
  journeyRoadmap,
  journeyScanFindings,
  journeyWarning,
} from "@/lib/marketing/landing-journey";
import { AUDIENCE_SEGMENT_IDS } from "@/lib/marketing/landing-showcase";

/*
  Faz 7 (20 Kasım 2026): ana sayfanın 7 adımlı turu seçilen branşın örnek notuyla oynanır (lise matematik,
  mühendislik, TUS farmakoloji, KPSS anayasa). Her branşın yedi adımı kendi verisini taşır ve bu veri ürünün kendi
  biçimindedir: ders ürünün şemasından geçer ve ürünle aynı işlevle notlanır, iki şık ipucu cevabı söylemez, çizimli
  video sahnesi ürünün ayrıştırıcısından geçer, sınav sabahı kâğıdı ürünün derleyicisiyle branşın dersinden çıkar.
*/

afterEach(cleanup);

const TRACKS = [...GUEST_TRACK_IDS];
const fold = (text: string) => text.toLocaleLowerCase("tr");
const words = (text: string) => text.replace(/\*\*/g, "").trim().split(/\s+/).filter(Boolean).length;

/** Her branşın kendine özgü işaretleri: dosya, sahne arketipi, kâğıtta görünmesi gereken formül ya da spot. */
const EXPECT: Record<GuestTrackId, { file: string; pages: number; units: string[]; archetype: string | null; sheet: RegExp; key: string; glyphs: string[] }> = {
  lise: {
    file: "Köklü_Sayılar_Ders_Notu.pdf",
    pages: 6,
    units: ["Köklü ifadelerin tanımı ve çift derece kuralı"],
    archetype: null,
    sheet: /\$\\sqrt\[2n\]\{a\^\{2n\}\} = \|a\|\$/,
    key: "2",
    glyphs: ["√((−4)²)", "³√(−8)"],
  },
  muhendislik: {
    file: "Akiskanlar_ve_Termodinamik_Vize_Notu.pdf",
    pages: 14,
    units: ["Kaldırma Kuvveti Vektörleri", "Bernoulli Denklemi", "Süreklilik & Basınç Kayıpları"],
    archetype: "ENGINEERING_PHYSICS_MECHANICS",
    sheet: /F_k = V_\{\\text\{batan\}\} \\cdot d_\{\\text\{sıvı\}\} \\cdot g/,
    key: "40 N",
    glyphs: ["m³", "kg/m³", "m/s²"],
  },
  tus: {
    file: "Kardiyoloji_Antiaritmikler_TUS_Notu.pdf",
    pages: 18,
    units: ["Vaughan-Williams Sınıflandırması", "Sınıf I Na⁺ Kanal Blokajı", "Sınıf III K⁺ Blokajı & Torsades de Pointes", "Klinik Tuzak Spotları"],
    archetype: "MEDICAL_BIOLOGY_PATHWAY",
    sheet: /Amiodaron Sınıf III olmasına rağmen tüm sınıfların özelliğini taşır/,
    key: "Sotalol",
    glyphs: ["Na⁺", "K⁺", "Ca²⁺", "β₁"],
  },
  hukuk: {
    file: "Anayasa_Yasama_Sureci_Notu.pdf",
    pages: 12,
    units: ["TBMM Toplantı/Karar Yeter Sayıları", "Nitelikli Çoğunluklar (3/5 vs 2/3)", "Cumhurbaşkanı Veto & AYM Denetimi"],
    archetype: "LAW_SOCIAL_FLOWCHART",
    sheet: /salt çoğunluğu \(301\)/,
    key: "301",
    glyphs: ["600 / 2 + 1 = 301", "600 / 4 + 1 = 151"],
  },
};

describe("dört branş, yedi adım: her adım branşın kendi verisi", () => {
  it("dört branş sabit sırayla; podcast kimlikleriyle aynı", () => {
    expect(TRACKS).toEqual(["lise", "muhendislik", "tus", "hukuk"]);
    expect(Object.keys(GUEST_DEMO_TRACKS)).toEqual(TRACKS);
    expect(Object.keys(GUEST_TOUR_CONTENT)).toEqual(TRACKS);
    expect(isGuestTrackId("tus")).toBe(true);
    expect(isGuestTrackId("ortaokul")).toBe(false);
    expect(guestDemoTrack(null).id).toBe("lise");
    expect(guestTourContent(undefined)).toBe(GUEST_TOUR_CONTENT.lise);
    // Kahramanın seçicisindeki ad ve alt satır (Faz 9).
    expect(TRACKS.map((id) => [GUEST_DEMO_TRACKS[id].pickLabel, GUEST_DEMO_TRACKS[id].field])).toEqual([
      ["Lise & YKS", "Matematik"],
      ["Üniversite", "Mühendislik"],
      ["TUS / Tıp", "Farmakoloji"],
      ["KPSS / Hukuk", "Anayasa"],
    ]);
  });

  for (const id of TRACKS) {
    describe(id, () => {
      const meta = GUEST_DEMO_TRACKS[id];
      const content = GUEST_TOUR_CONTENT[id];
      const expected = EXPECT[id];

      it("1. not: kendi dosyası, sayfa sayısı ve tarama bulguları", () => {
        expect(meta.file).toBe(expected.file);
        expect(meta.pages).toBe(expected.pages);
        const file = journeyFile(id);
        expect(file.name).toBe(expected.file);
        const findings = journeyScanFindings(id);
        expect(findings.map((item) => item.id)).toEqual(["pages", "topics", "warning", "figure"]);
        expect(findings[0]!.text).toBe(`${expected.pages} sayfa`);
        expect(findings[1]!.text).toBe(`${meta.units.length} konu`);
        expect(findings[2]!.text).toBe(meta.warning);
        expect(findings[3]!.text).toBe(meta.figure);
        // Ana sayfadaki örnek not kartı: dosya adı ve "N sayfa" (Faz 9.1: kart ders çekirdeğine götürülür).
        expect(file.pagesLabel).toBe(`${expected.pages} sayfa`);
        expect(file.send).toBe("Örnek notu çekirdeğe gönder");
      });

      it("2. yol: branşın konuları gün gün, ilk gün hazır ders; uyarının etiketi notun kendi satırından", () => {
        const roadmap = journeyRoadmap(id);
        for (const unit of expected.units) expect(meta.units).toContain(unit);
        expect(roadmap.days.slice(0, meta.units.length).map((day) => day.title)).toEqual([...meta.units]);
        expect(roadmap.days[0]!.ready).toBe(true);
        expect(roadmap.days.filter((day) => day.ready)).toHaveLength(1);
        expect(roadmap.days.at(-1)!.day).toMatch(/–7\. gün$/);
        expect(roadmap.cta).toBe("Şimdi 1. dersi aç");
        const warning = journeyWarning(id);
        expect(meta.warning.startsWith(`${warning.label}: “`)).toBe(true);
        expect(["Hoca uyarısı", "TUS spotu", "Sınav tuzağı"]).toContain(warning.label);
        // Uyarının kalıbı ders, soru, kart ve önermelerde var; yol haritasında yok (etiket ürün adımında parlar).
        expect(content.warningPattern.test(meta.warning) || id === "lise").toBe(true);
        expect(guestTourWarningSteps(id)).toEqual([...JOURNEY_WARNING_STEPS]);
        for (const day of roadmap.days) expect(content.warningPattern.test(day.title), day.title).toBe(false);
      });

      it("3. ders: ürünün şemasından olduğu gibi geçer; her ekranın sorusu ürünle aynı işlevle notlanır", () => {
        const parsed = lessonV3Schema.safeParse(content.lesson);
        expect(parsed.success).toBe(true);
        // Şemanın kapıları (anahtar hizalama, güvensiz soru, çelişen sahne) hiçbir şeyi değiştirmez ya da düşürmez.
        expect(parsed.data).toEqual(content.lesson);
        expect(content.lesson.screens).toHaveLength(2);
        expect(content.lesson.screens[0]!.blocks[0]!.type).toBe("check");
        const kinds = content.lesson.screens.flatMap((screen) => screen.blocks.map((block) => block.type));
        for (const kind of ["exam_trap_card", "memory_hook_card", "example"]) expect(kinds, kind).toContain(kind);
        const stored = v3ToV2(content.lesson);
        content.lesson.screens.forEach((screen, at) => {
          const check = screenCheck(screen)!;
          expect(check, screen.heading).toBeTruthy();
          expect(unsafeStoredCheck(check), screen.heading).toBe(false);
          if (check.type === "mcq") {
            expect(check.options).toHaveLength(5);
            expect(mcqAnswerMismatch(check), screen.heading).toBeNull();
          }
          const wrongPick = check.answerIndex === 0 ? 1 : 0;
          expect(gradeLessonSectionCheck(stored, at, { pick: check.answerIndex! }, "primary", "tr")?.correct).toBe(true);
          expect(gradeLessonSectionCheck(stored, at, { pick: wrongPick }, "primary", "tr")?.correct).toBe(false);
        });
        // Branşın uyarısı derste bir kutu olarak durur (lise: sınav tuzağı kartı ve formül).
        if (id !== "lise") {
          const notes = content.lesson.screens.flatMap((screen) => screen.blocks).filter((block) => block.type === "note");
          expect(notes.some((block) => block.type === "note" && meta.warning.includes(block.note.body))).toBe(true);
        }
      });

      it("4. soru: beş şık (A–E), tek anahtar; iki şık ipucu hangi çift seçilirse seçilsin cevabı ve hesabı söylemez", () => {
        expect(content.quiz).toHaveLength(1);
        const question = content.quiz[0]!;
        expect(question.multi).toBe(false);
        expect(question.options).toHaveLength(5);
        expect(new Set(question.options).size).toBe(5);
        expect(question.correct).toEqual([expected.key]);
        expect(question.options).toContain(expected.key);
        expect(question.optionWhy).toHaveLength(5);
        const answer = fold(expected.key);
        for (const a of question.options) {
          for (const b of question.options) {
            if (a === b) continue;
            const hint = content.twoOptionHint([a, b]);
            expect(hint.length, `${a}/${b}`).toBeGreaterThan(20);
            expect(hint, `${a}/${b}`).not.toMatch(/[0-9]|doğru (cevap|şık)|cevap\s/i);
            expect(fold(hint), `${a}/${b}`).not.toContain(answer);
          }
        }
      });

      it("5-6. kart ve doğru/yanlış: iki kart; önermelerde biri doğru, biri yanlış ve yanlışın doğrusu yazılı", () => {
        expect(content.cards).toHaveLength(2);
        for (const card of content.cards) {
          expect(card.front.length).toBeGreaterThan(10);
          expect(card.back.length).toBeGreaterThan(10);
        }
        expect(content.trueFalse.map((item) => item.correct)).toEqual([true, false]);
        const wrong = content.trueFalse[1]!;
        if (id !== "lise") expect(wrong.correctedStatement).toBeTruthy();
        expect(trueFalseExplanation(wrong)).toMatch(/^✏️ Doğrusu: /);
      });

      it("7. Plus: çizimli video sahnesi ürünün biçiminde ve doğru arketipte; kâğıt branşın dersinden çıkar", () => {
        const sketch = content.sketch;
        if (expected.archetype === null) {
          expect(sketch.kind).toBe("board");
        } else {
          expect(sketch.kind).toBe("reel");
          if (sketch.kind !== "reel") return;
          expect(sketch.scenes.length).toBeGreaterThanOrEqual(2);
          for (const scene of sketch.scenes) {
            expect(parseReelVisual(scene.visual, scene.beat), scene.sceneTitle).not.toBeNull();
            expect(words(scene.narration), scene.sceneTitle).toBeLessThanOrEqual(26);
            expect(words(scene.keyFact ?? ""), scene.sceneTitle).toBeLessThanOrEqual(8);
          }
          const main = parseReelVisual(sketch.scenes[0]!.visual, sketch.scenes[0]!.beat);
          expect(main?.kind).toBe("archetype");
          if (main?.kind !== "archetype") return;
          expect(main.scene.archetype).toBe(expected.archetype);
        }
        const sheet = buildCramSheet({
          topics: [{ key: "tur", label: content.prep.topic }],
          lessons: [{ topicKey: "tur", lesson: content.lesson }],
        });
        expect(sheet.empty).toBe(false);
        expect(sheet.itemCount).toBeGreaterThanOrEqual(3);
        const sheetText = [
          ...sheet.sections.flatMap((section) => section.items.map((row) => `${row.title ?? ""} ${row.text}`)),
          ...sheet.formulas.map((row) => row.text),
        ].join("\n");
        expect(sheetText).toMatch(expected.sheet);
        // Podcast önizlemesi yalnız kesiti olan branşta (`DEMO_PODCASTS`); kesiti yoksa sekme hiç yok.
        const previews = journeyPlusPreviews(id).map((item) => item.id);
        expect(previews).toEqual(DEMO_PODCASTS[id] ? ["podcast", "video", "sheet"] : ["video", "sheet"]);
        expect(trackHasPodcast(id)).toBe(Boolean(DEMO_PODCASTS[id]));
      });

      it("formül ve simge karakterleri ürünün metin bileşeninde düşmeden çizilir", () => {
        const text = JSON.stringify([content.lesson, content.quiz, content.cards, content.trueFalse]);
        for (const glyph of expected.glyphs) expect(text, glyph).toContain(glyph);
        const shown = (source: string) => {
          const { container } = render(createElement(RichBody, { text: source }));
          // KaTeX'in görünen katmanı (MathML yedeği değil) ve düz metin.
          const clone = container.cloneNode(true) as HTMLElement;
          clone.querySelectorAll(".katex-mathml").forEach((node) => node.remove());
          const out = clone.textContent ?? "";
          cleanup();
          return out;
        };
        const question = content.quiz[0]!;
        const rendered = shown(question.text) + shown(question.explanation ?? "") + content.cards.map((card) => shown(card.back)).join(" ");
        for (const glyph of expected.glyphs.filter((item) => text.includes(item) && (question.text + question.explanation + JSON.stringify(content.cards)).includes(item))) {
          expect(rendered, glyph).toContain(glyph);
        }
        if (id === "muhendislik") {
          // F_k ve d_sıvı: alt simgeler harf düşmeden çizilir (KaTeX ya da Unicode alt simge).
          const formula = shown(content.cards[0]!.back);
          for (const part of ["F", "k", "V", "batan", "d", "sıvı", "g"]) expect(formula, part).toContain(part);
          const note = shown("Kaldırma kuvvetinde sıvının yoğunluğu (d_sıvı) alınır.");
          expect(note).toContain("sıvı");
          expect(note).not.toContain("_");
        }
        if (id === "lise") {
          // KaTeX mutlak değer çizgisini "∣" (U+2223) ile çizer; kök derecesi ve üs düşmez.
          const formula = shown("$\\sqrt[2n]{a^{2n}} = |a|$").replace(/∣/g, "|");
          for (const part of ["2n", "a2n", "|a|"]) expect(formula, part).toContain(part);
        }
      });
    });
  }
});

describe("kahramanın tek seçicisi ↔ branş: tek durum (Faz 9)", () => {
  it("profil branşı açar: lise ve YKS/LGS matematik, üniversite mühendislik, akademik hukuk, TUS farmakoloji", () => {
    expect(AUDIENCE_SEGMENT_IDS.map((segment) => trackForSegment(segment))).toEqual(["lise", "lise", "muhendislik", "hukuk", "tus"]);
  });

  it("branş profili eşler; lise branşı lise ya da YKS/LGS profilinde yerinde kalır, TUS kendi profilinde", () => {
    expect(segmentForTrack("lise", "yks-lgs")).toBe("yks-lgs");
    expect(segmentForTrack("lise", "lise")).toBe("lise");
    expect(segmentForTrack("lise", "akademik")).toBe("lise");
    expect(segmentForTrack("muhendislik", "lise")).toBe("universite");
    expect(segmentForTrack("tus", "lise")).toBe("tus");
    expect(segmentForTrack("hukuk", "universite")).toBe("akademik");
    expect(segmentForTrack("tus", "akademik")).toBe("tus");
    expect(segmentForTrack("hukuk", "tus")).toBe("akademik");
    // Eşlenen profil branşı geri açar: dört branşın dördünde de (önce TUS akademik sekmede hukukla açılıyordu).
    for (const track of GUEST_TRACK_IDS) {
      for (const segment of AUDIENCE_SEGMENT_IDS) expect(trackForSegment(segmentForTrack(track, segment))).toBe(track);
    }
  });

  it("lise branşının değerleri turun öteden beri bilinen sabitleri", () => {
    expect(JOURNEY_FILE.name).toBe(journeyFile("lise").name);
    expect(JOURNEY_FILE.pagesLabel).toBe("6 sayfa");
    expect(JOURNEY_ROADMAP.days).toEqual(journeyRoadmap("lise").days);
    expect(JOURNEY_WARNING).toEqual(journeyWarning("lise"));
    expect(journeyPlusPreviews("lise")).toEqual(JOURNEY_PLUS_PREVIEWS);
  });
});

describe("podcast üretimi için branş dersleri ve hazırlık bilgisi dışa açık", () => {
  it("her branşın dersi ve { topic, title } bilgisi", () => {
    for (const id of TRACKS) {
      expect(GUEST_TOUR_LESSONS[id]).toBe(GUEST_TOUR_CONTENT[id].lesson);
      expect(GUEST_TOUR_PREPS[id].title.length).toBeGreaterThan(5);
      expect(GUEST_TOUR_PREPS[id].topic.length).toBeGreaterThan(5);
    }
  });
});

describe("çizimli video sahneleri: branşın mekanizması gerçekçi", () => {
  const scene = (id: GuestTrackId) => {
    const sketch = GUEST_TOUR_CONTENT[id].sketch;
    if (sketch.kind !== "reel") throw new Error("reel bekleniyordu");
    const main = parseReelVisual(sketch.scenes[0]!.visual, sketch.scenes[0]!.beat);
    if (main?.kind !== "archetype") throw new Error("arketip bekleniyordu");
    return main.scene;
  };

  it("mühendislik: akışkan kabında kaldırma kuvveti yukarı, ağırlık aşağı; denge G = F_k + T oranlı; cismin yoğunluğu formülde yok", () => {
    const data = scene("muhendislik");
    if (data.archetype !== "ENGINEERING_PHYSICS_MECHANICS") throw new Error("mekanik");
    expect(data.setting).toBe("fluid");
    const byName = Object.fromEntries(data.vectors.map((vector) => [vector.symbol, vector]));
    expect(byName.F_k?.direction).toBe("up");
    expect(byName.T?.direction).toBe("up");
    expect(byName.G?.direction).toBe("down");
    expect(byName.G!.magnitude).toBe(byName.F_k!.magnitude + byName.T!.magnitude);
    expect(data.logic.formula).toBe("F_k = V_batan · d_sıvı · g");
    expect(data.logic.distractors.map((item) => item.symbol)).toContain("d_cisim");
    // Dersin örneğiyle aynı sayılar: 2700 · 0,002 · 10 = 54 N, 1000 · 0,002 · 10 = 20 N, 54 − 20 = 34 N.
    expect(Math.round(2700 * 0.002 * 10)).toBe(54);
    expect(Math.round(1000 * 0.002 * 10)).toBe(20);
    // Konu testi: 0,005 · 800 · 10 = 40 N; çeldiriciler 4 (g yok), 50 (su sanılmış), 350 (G − F_k), 390 (cismin yoğunluğu).
    expect(Math.round(0.005 * 800 * 10)).toBe(40);
    expect(Math.round(0.005 * 1000 * 10)).toBe(50);
    expect(Math.round(7800 * 0.005 * 10)).toBe(390);
    expect(Math.round(7800 * 0.005 * 10 - 0.005 * 800 * 10)).toBe(350);
  });

  it("TUS: K⁺ kanalında kırmızı [X] blokaj, ardından QT uzaması ve torsades", () => {
    const data = scene("tus");
    if (data.archetype !== "MEDICAL_BIOLOGY_PATHWAY") throw new Error("tıp");
    const blocked = data.steps.find((step) => step.effect === "inhibit");
    expect(blocked?.label).toContain("K⁺");
    expect(data.steps.map((step) => step.label)).toEqual(expect.arrayContaining(["QT uzaması", "Torsades de pointes"]));
    expect(data.spotlight.text).toContain("Amiodaron");
  });

  it("hukuk: çok kademeli karar ağacı ve 360 / 400 çoğunluk barometresi (600 üye)", () => {
    const data = scene("hukuk");
    if (data.archetype !== "LAW_SOCIAL_FLOWCHART") throw new Error("hukuk");
    expect(lawTreeDepth(lawTreeOf(data))).toBeGreaterThanOrEqual(3);
    const rows = Object.fromEntries(data.majority.map((row) => [row.fraction, row]));
    expect(rows["3/5"]).toMatchObject({ count: 360, total: 600 });
    expect(rows["2/3"]).toMatchObject({ count: 400, total: 600 });
    expect(rows["1/3"]).toMatchObject({ count: 200, total: 600 });
    // Yeter sayıların kendisi: 600 / 3 = 200, 600 / 4 + 1 = 151, 600 / 2 + 1 = 301, 3/5 = 360, 2/3 = 400.
    expect([600 / 3, 600 / 4 + 1, 600 / 2 + 1, (600 * 3) / 5, (600 * 2) / 3]).toEqual([200, 151, 301, 360, 400]);
  });
});

describe("kurgu: branş verisi saf veri, ilk yükte yalnız hafif bilgi", () => {
  const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

  it("branş dosyaları yalnız ürünün tiplerini içe aktarır; ağ isteği, sunucu modülü ya da model yok", () => {
    for (const path of [
      "src/lib/demo/guest-tracks/muhendislik.ts",
      "src/lib/demo/guest-tracks/tus.ts",
      "src/lib/demo/guest-tracks/hukuk.ts",
      "src/lib/demo/guest-tour-types.ts",
    ]) {
      const source = read(path);
      for (const line of source.match(/^import .*$/gm) ?? []) expect(line, path).toMatch(/^import type /);
      expect(source, path).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|\/api\/|supabase|server-only|openai/i);
    }
    for (const path of ["src/lib/demo/guest-tour-tracks.ts", "src/lib/marketing/guest-demo-tracks.ts"]) {
      expect(read(path), path).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|\/api\/|supabase|server-only|openai/i);
    }
  });

  it("tur bileşeni ağır branş verisini ilk yükte içe aktarmaz; ürün ekranları ve önizlemeler alır", () => {
    const journey = read("src/components/landing/futuristic-guided-journey.tsx");
    expect(journey).not.toMatch(/from "@\/lib\/demo\/guest-tour(-tracks)?"/);
    expect(journey).not.toMatch(/guest-tracks\//);
    expect(journey).toContain('from "@/lib/marketing/guest-demo-tracks"');
    expect(read("src/components/landing/tour/product-screens.tsx")).toContain('import { guestTourContent } from "@/lib/demo/guest-tour-tracks";');
    expect(read("src/components/landing/tour/plus-previews.tsx")).toContain('import { guestTourContent } from "@/lib/demo/guest-tour-tracks";');
    // Podcast kesitleri yalnız `DEMO_PODCASTS`tan.
    expect(read("src/components/landing/tour/plus-previews.tsx")).toContain("const podcast = DEMO_PODCASTS[track];");
  });
});
