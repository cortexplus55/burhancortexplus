// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";

/*
  Paket J3 #13 (31 Ekim 2026, ürün sahibinin kararı): "⚠️ Akıllı Hoca Uyarısı" ve bulanık fotoğraf algılayıcı.

  1) Notta evrensel bir formül açıkça yanlış yazılmışsa ("E = mc³") derste sarı kutu. Katalog yalnız evrensel matematik /
     fizik / kimya formülleri — kaynak sayı önceliğinin bilinçli, dar istisnası; eşik ve sınıflandırma asla.
  2) Yüklenen fotoğraf okunamayacak kadar bulanık ya da karanlıksa yüklemeden önce sorulur; yükleme engellenmez.

  Model çağrısı yok: ders motoru sahte, ölçüler yapay gri tonlu dizilerle.
*/

const h = vi.hoisted(() => ({
  engineInputs: [] as Record<string, unknown>[],
  published: [] as Record<string, unknown>[],
  cleanText: "",
}));

vi.mock("@/lib/learning/teacher-lesson-run", () => ({
  runTeacherLesson: async (_service: unknown, input: Record<string, unknown>) => {
    h.engineInputs.push(input);
    const onPublish = input.onPublish as ((published: unknown) => Promise<void> | void) | undefined;
    await onPublish?.({ lesson: SAMPLE_LESSON, done: false, upcoming: ["Kütle-enerji"] });
    return {
      ok: true,
      lesson: SAMPLE_LESSON,
      calls: 1,
      ms: 0,
      remainingLow: [],
      fixTriggers: [],
      dropped: [],
      draftNote: null,
    };
  },
}));
vi.mock("@/lib/documents/clean-pages", () => ({
  documentRunningHeaders: async () => [],
  ensureCleanPages: async () => [{ page: 1, text: h.cleanText, cleaned: false }],
}));
vi.mock("@/lib/learning/student-pedagogy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learning/student-pedagogy")>()),
  studentOptionCount: async () => 5,
}));
vi.mock("@/lib/learning/lesson-generation-failures", () => ({
  recordLessonGenerationFailure: async () => undefined,
}));

import {
  NOTE_WARNING_CAP,
  copulaSuffix,
  findFormulaTypos,
  formulaTypoWarning,
  noteWarningsPromptLine,
  readNoteWarnings,
  type FormulaTypo,
} from "@/lib/learning/formula-typos";
import { teacherUserPrompt, type TeacherLessonInput } from "@/lib/learning/teacher-lesson";
import { lessonSanityUserPrompt } from "@/lib/learning/lesson-sanity";
import { teacherLessonPayload } from "@/lib/learning/node/lesson";
import type { NodePayloadInput } from "@/lib/learning/node/generate";
import { publicNodePayload } from "@/lib/learning/node/payload";
import { studentOutputPayload } from "@/lib/learning/student-output-firewall";
import { teachingActivityForKind } from "@/lib/learning/teaching-standards";
import type { LessonV3 } from "@/lib/learning/lesson-v3";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import {
  assessPhotoQuality,
  flagLowQualityPhotos,
  photoQualityPrompt,
  qualityFromGray,
  type PhotoQuality,
} from "@/lib/documents/photo-quality";
import { runUploadPipeline } from "@/lib/documents/upload-engine";
import { useUniversalDocumentUpload } from "@/lib/documents/use-universal-upload";
import { PhotoQualityPrompt } from "@/components/parity/photo-quality-prompt";

afterEach(cleanup);

const SAMPLE_LESSON = {
  format: 3,
  title: "Kütle ve Enerji",
  overview: "Kütle de bir enerji biçimidir.",
  screens: [
    {
      heading: "Kütle-enerji",
      concept: "Kütle-enerji",
      blocks: [
        { type: "text", text: "Durgun bir cismin enerjisi **E = mc²** ile bulunur." },
        {
          type: "check",
          check: {
            type: "trueFalse",
            prompt: "Işık hızı formülde karesiyle geçer.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 0,
            explanation: "c² terimi vardır.",
          },
        },
      ],
    },
    {
      heading: "Momentum",
      concept: "Momentum",
      blocks: [
        { type: "text", text: "Kuvvet, kütle ile ivmenin çarpımıdır." },
        {
          type: "check",
          check: {
            type: "trueFalse",
            prompt: "Kuvvet kütlenin ivmeye bölümüdür.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation: "F = m·a.",
          },
        },
      ],
    },
  ],
  summary: ["E = mc²", "F = m·a"],
} as unknown as LessonV3;

/* ───────────── 1. Akıllı hoca uyarısı: katalog ───────────── */

describe("notta yanlış yazılmış evrensel formül", () => {
  it("ürün sahibinin örneklerini yakalar (fizik, matematik)", () => {
    const hits = (text: string) => findFormulaTypos(text).map((hit) => [hit.found, hit.standard]);
    expect(hits("Einstein'a göre E = mc³ formülüyle ifade edilir.")).toEqual([["E = mc³", "E = mc²"]]);
    expect(hits("Pisagor: a² + b² = c³")).toEqual([["a² + b² = c³", "a² + b² = c²"]]);
    expect(hits("Newton'un ikinci yasası F = m/a şeklindedir.")).toEqual([["F = m/a", "F = m·a"]]);
    expect(hits("(a+b)² = a² + b²")).toEqual([["(a+b)² = a² + b²", "(a + b)² = a² + 2ab + b²"]]);
    expect(hits("Δ = b² + 4ac")).toEqual([["Δ = b² + 4ac", "Δ = b² − 4ac"]]);
    expect(hits("sin²x − cos²x = 1")).toEqual([["sin²x − cos²x = 1", "sin²x + cos²x = 1"]]);
  });

  it("kimya ve öbür katalog formülleri: ideal gaz, yoğunluk, Ohm, dalga, kinetik enerji", () => {
    const ids = (text: string) => findFormulaTypos(text).map((hit) => hit.id);
    expect(ids("İdeal gaz denklemi PV = nR/T olarak yazılır.")).toEqual(["ideal-gaz"]);
    expect(ids("P.V = n.R/T")).toEqual(["ideal-gaz"]);
    expect(ids("Yoğunluk d = V/m")).toEqual(["yogunluk"]);
    expect(ids("ρ = m·V")).toEqual(["yogunluk"]);
    expect(ids("Ohm kanunu V = I/R")).toEqual(["ohm"]);
    expect(ids("U = R/I")).toEqual(["ohm"]);
    expect(ids("v = λ/f")).toEqual(["dalga"]);
    expect(ids("Ek = ½·m·v³")).toEqual(["kinetik"]);
    expect(ids("(a − b)² = a² − b²")).toEqual(["fark-karesi"]);
    expect(ids("sin²α − cos²α = 1")).toEqual(["trig-temel"]);
    expect(findFormulaTypos("sin²α − cos²α = 1")[0]!.standard).toBe("sin²α + cos²α = 1");
  });

  it("LaTeX ve OCR yazımlarını da okur", () => {
    expect(findFormulaTypos("$E = mc^3$").map((hit) => hit.id)).toEqual(["einstein"]);
    const frac = findFormulaTypos("Formül: $F = \\frac{m}{a}$");
    expect(frac.map((hit) => [hit.id, hit.found])).toEqual([["newton-2", "F = m/a"]]);
    expect(findFormulaTypos("$E_k = \\frac{1}{2}mv^3$").map((hit) => hit.id)).toEqual(["kinetik"]);
    expect(findFormulaTypos("\\sin^2 x - \\cos^2 x = 1").map((hit) => hit.id)).toEqual(["trig-temel"]);
    // Üst simgesini kaybetmiş OCR: harfe bitişik rakam üs.
    expect(findFormulaTypos("E = mc3").map((hit) => hit.id)).toEqual(["einstein"]);
  });

  it("doğru biçimleri, başka sol taraflı doğru düzenlemeleri ve başka formülleri işaretlemez", () => {
    const clean = [
      "E = mc²",
      "E = m·c²",
      "E=mc^2",
      "a² + b² = c²",
      "F = m·a",
      "F = ma",
      "F = m.a",
      "ΣF = m × a",
      "(a + b)² = a² + 2ab + b²",
      "(a+b)^2 = a^2 + b^2 + 2ab",
      "(a − b)² = a² − 2ab + b²",
      "Δ = b² − 4ac",
      "Δ = b2 - 4ac",
      "sin²x + cos²x = 1",
      "sin2x + cos2x = 1",
      "PV = nRT",
      "P·V = n·R·T",
      "V = I·R",
      "U = I.R",
      "v = λ·f",
      "c = λf",
      "d = m/V",
      "ρ = m/V",
      "Ek = ½·m·v²",
      "Ek = 1/2 m v^2",
      "Ek = mv²/2",
      // Doğru düzenlemeler: sol taraf başka.
      "a = F/m",
      "m = d·V",
      "V = m/d",
      "I = V/R",
      "R = V/I",
      "f = v/λ",
      "c² = a² − b²",
      "a² − b² = c²",
      // Aynı sol taraf, başka (doğru) formül.
      "E = m·g·h",
      "E = h·f",
      "E = 1/2 k x²",
      "F = m·g",
      "F = k·x",
      "v = λ/T",
      "d = v·t",
      "U = Q − W",
      "U = 3/2 nRT",
      "Q = m·c·ΔT",
      "a² + b² = (a+b)² − 2ab",
      "(a+b)² = (a+b)(a+b)",
      "2sin²x + cos²x = 1",
      "sin x + cos x = 1",
      // Sayısal sonuçlar.
      "F = 20 N",
      "Bu durumda V = 5 V olur.",
      "E = mc² = 9·10¹⁶ J",
      "v = 340 m/s",
      "d = 2,7 g/cm³",
      "Δ = 25",
    ];
    for (const text of clean) expect(findFormulaTypos(text), text).toEqual([]);
  });

  it("düz yazıyı, yarım kalmış ifadeyi ve notun kendi gösterdiği yanlışı işaretlemez", () => {
    const quiet = [
      "Enerji ve kütle arasındaki ilişkiyi Einstein açıkladı.",
      "Not: sınav 12 Kasım'da, salon = Amfi 2.",
      "Kur = 32,5 TL olarak alındı.",
      "Tarih: 1923 yılında Cumhuriyet ilan edildi.",
      // PDF'te üs ya da payda alt satıra düşer: yarım ifade uyarı açmaz.
      "E = mc",
      "E = m c 2",
      "Ek = m·v²",
      "(a+b)² = a² + b² +\n2ab",
      // Not yanlışı kendisi gösteriyor.
      "Sık yapılan hata: (a+b)² = a² + b² değildir.",
      "(a+b)² ≠ a² + b²",
      "Yanlış:\nE = mc³",
      "Tuzak: F = m/a sanılır.",
      // Soru, şık ve denklem çözümü.
      "A) E = mc³",
      "b) F = m/a",
      "E = mc³ ise m kaçtır?",
      "sin²x − cos²x = 1 denklemini çözünüz.",
      "a² + b² = c³ olduğuna göre c nedir",
    ];
    for (const text of quiet) expect(findFormulaTypos(text), text).toEqual([]);
  });

  it("aynı hatayı bir kez sayar, en çok üç uyarı verir, kaynak sırasını korur", () => {
    const text = [
      "1) E = mc³",
      "2) Yine E = mc³",
      "3) F = m/a",
      "4) Δ = b² + 4ac",
      "5) V = I/R",
      "6) v = λ/f",
    ].join("\r\n");
    const hits = findFormulaTypos(text);
    expect(hits).toHaveLength(NOTE_WARNING_CAP);
    expect(hits.map((hit) => hit.id)).toEqual(["einstein", "newton-2", "diskriminant"]);
  });
});

/* ───────────── 1b. Öğrenciye giden cümle ───────────── */

describe("uyarı cümlesi", () => {
  it("ürün sahibinin metni, Türkçe ekiyle", () => {
    expect(formulaTypoWarning({ found: "E = mc³", standard: "E = mc²" })).toBe(
      "⚠️ Notunda Dikkat Çeken Nokta: Notunda «E = mc³» geçiyor ancak standart kural «E = mc²»'dir, yazım hatası olabilir.",
    );
    expect(formulaTypoWarning({ found: "F = m/a", standard: "F = m·a" })).toBe(
      "⚠️ Notunda Dikkat Çeken Nokta: Notunda «F = m/a» geçiyor ancak standart kural «F = m·a»'dır, yazım hatası olabilir.",
    );
  });

  it("ek ifadenin okunuşuna uyar: kare 'dir, a 'dır, iks 'tir, üç / küp 'tür, ro 'dur", () => {
    expect(copulaSuffix("a² + b² = c²")).toBe("dir");
    expect(copulaSuffix("F = m·a")).toBe("dır");
    expect(copulaSuffix("P·V = n·R·T")).toBe("dir");
    expect(copulaSuffix("sin²x + cos²x = 1")).toBe("dir");
    expect(copulaSuffix("y = 2x")).toBe("tir");
    expect(copulaSuffix("x = 3")).toBe("tür");
    expect(copulaSuffix("V = a³")).toBe("tür");
    expect(copulaSuffix("m = ρ")).toBe("dur");
    expect(copulaSuffix("Δ = b² − 4ac")).toBe("dir");
  });

  it("yazar satırı yalnız uyarı varken; bozuk kayıt güvenle okunur", () => {
    expect(noteWarningsPromptLine([])).toBe("");
    expect(noteWarningsPromptLine(undefined)).toBe("");
    const line = noteWarningsPromptLine([{ found: "E = mc³", standard: "E = mc²" }]);
    expect(line).toContain("NOTTA YAZIM HATASI OLABİLİR: «E = mc³» (standart: «E = mc²»)");
    expect(line).toContain("Uyarı kutusunu sen yazma");
    expect(readNoteWarnings([{ id: "einstein", found: "E = mc³", standard: "E = mc²" }, { found: 3 }, null, "x"])).toEqual([
      { id: "einstein", found: "E = mc³", standard: "E = mc²" },
    ]);
    expect(readNoteWarnings(undefined)).toEqual([]);
  });
});

/* ───────────── 1c. Yazar istemi, doğrulayıcı, gövde ───────────── */

const WARNING: FormulaTypo = { id: "einstein", found: "E = mc³", standard: "E = mc²" };

function lessonInput(overrides: Partial<TeacherLessonInput> = {}): TeacherLessonInput {
  return {
    topicLabel: "Kütle ve Enerji",
    prepTitle: "YKS Fizik",
    pages: [{ page: 1, text: "Kütle-enerji eşdeğerliği\nE = mc³\nIşık hızı 3·10⁸ m/s'dir." }],
    upcomingTopics: [],
    ...overrides,
  };
}

describe("ders yazarı ve hafif doğrulayıcı", () => {
  it("uyarı yoksa istem değişmez; varsa tek satır gider ve yanlış formül kilit bilgi sayılmaz", () => {
    const plain = teacherUserPrompt(lessonInput());
    expect(plain).not.toContain("NOTTA YAZIM HATASI");
    const warned = teacherUserPrompt(lessonInput({ noteWarnings: [WARNING] }));
    expect(warned).toContain("NOTTA YAZIM HATASI OLABİLİR: «E = mc³» (standart: «E = mc²»)");
    const keyFacts = (prompt: string) => /KİLİT BİLGİLER[\s\S]*?(?=\n\n|$)/.exec(prompt)?.[0] ?? "";
    expect(keyFacts(warned)).not.toContain("E = mc³");
    // Kaynak yine olduğu gibi gider (kod notu değiştirmez).
    expect(warned).toContain("E = mc³\nIşık hızı");
    // Belgesiz derste satır yok.
    expect(teacherUserPrompt(lessonInput({ mode: "topic", noteWarnings: [WARNING] }))).not.toContain("NOTTA YAZIM HATASI");
  });

  it("doğrulayıcı anahtarı nottaki yazıma çevirmesin", () => {
    const base = { mode: "document" as const, topicLabel: "Kütle", source: "E = mc³", screens: [] };
    expect(lessonSanityUserPrompt(base)).not.toContain("NOTTA YAZIM HATASI");
    expect(lessonSanityUserPrompt({ ...base, noteWarnings: [WARNING] })).toContain(
      "«E = mc³» yanlış yazılmış; doğrusu «E = mc²»",
    );
  });

  it("ders gövdesi noteWarnings taşır (yayımlanan ilk parça da); notta hata yoksa alan hiç yok", async () => {
    const run = (sourceBlock: string) =>
      teacherLessonPayload(
        {
          service: {},
          userId: "u1",
          kind: "lesson",
          topicLabel: "Kütle ve Enerji",
          prepTitle: "YKS Fizik",
          sourceBlock,
          familiarity: "basics",
          mood: "ready",
          charge: false,
          examPoints: [],
          upcomingTopics: [],
          onLessonPublish: (payload: Record<string, unknown>) => {
            h.published.push(payload);
          },
        } as unknown as NodePayloadInput,
        teachingActivityForKind("lesson"),
        { documentId: "doc1", pages: [1] },
      );

    h.cleanText = "Kütle-enerji eşdeğerliği: E = mc³ formülüyle ifade edilir.";
    h.engineInputs.length = 0;
    h.published.length = 0;
    const warned = (await run("")) as Record<string, unknown>;
    expect(warned.noteWarnings).toEqual([{ id: "einstein", found: "E = mc³", standard: "E = mc²" }]);
    expect(h.engineInputs[0]!.noteWarnings).toEqual(warned.noteWarnings);
    expect(h.published[0]!.noteWarnings).toEqual(warned.noteWarnings);
    // Ders metnine bir şey eklenmez.
    expect(JSON.stringify(warned.lesson)).not.toContain("Dikkat Çeken");

    // Temizlik yazımı düzeltmiş olsa da ham kaynak bloğu notu gösterir.
    h.cleanText = "Kütle-enerji eşdeğerliği: E = mc² formülüyle ifade edilir.";
    const fromRaw = (await run("[s.1]\nE = mc³")) as Record<string, unknown>;
    expect(readNoteWarnings(fromRaw.noteWarnings).map((item) => item.id)).toEqual(["einstein"]);

    h.engineInputs.length = 0;
    const plain = (await run("E = mc²")) as Record<string, unknown>;
    expect("noteWarnings" in plain).toBe(false);
    expect("noteWarnings" in h.engineInputs[0]!).toBe(false);
  });

  it("öğrenciye giden gövdede (mühür + süzgeç) uyarı aynen kalır", () => {
    const payload = {
      type: "lesson",
      lesson: SAMPLE_LESSON,
      title: SAMPLE_LESSON.title,
      noteWarnings: [WARNING],
    };
    const sent = studentOutputPayload(publicNodePayload(payload, [], "lesson", { lessonFormat: 3 }));
    expect((sent as { noteWarnings?: unknown }).noteWarnings).toEqual([WARNING]);
    expect((sent as { lesson?: unknown }).lesson).toBeTruthy();
  });
});

/* ───────────── 1d. Ders ekranı ───────────── */

describe("ders ekranındaki sarı kutu", () => {
  it("ilk ekranda, ürün sahibinin cümlesiyle; uyarı yoksa kutu yok", () => {
    const { container, rerender } = render(
      <ExamLessonSteps lesson={sealLessonV3ForPlay(SAMPLE_LESSON)} closeHref="/deneme-sinavlari/p" noteWarnings={[WARNING]} />,
    );
    const boxes = container.querySelectorAll(".als-note--typo");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.textContent).toBe(formulaTypoWarning(WARNING));
    rerender(<ExamLessonSteps lesson={sealLessonV3ForPlay(SAMPLE_LESSON)} closeHref="/deneme-sinavlari/p" />);
    expect(container.querySelector(".als-note--typo")).toBeNull();
  });

  it("ekran kayıttaki uyarıyı okur ve derse geçirir", async () => {
    const { readSource } = await import("./helpers/node-sources");
    const lesson = readSource("src/components/parity/exam-node/lesson.tsx");
    expect(lesson).toContain("noteWarnings={readNoteWarnings(payload.noteWarnings)}");
  });
});

/* ───────────── 2. Bulanık / karanlık fotoğraf ───────────── */

const W = 192;
const H = 256;

/** Yazılı sayfa: açık zemin, satırlar ve harf benzeri ince dikey çizgiler. */
function page(paper: number, ink: number, sparse = false): Float32Array {
  const gray = new Float32Array(W * H);
  let seed = 11;
  const noise = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 6;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const row = Math.floor(y / 16);
      const writes = (!sparse || row % 6 === 0) && x > 10 && x < (sparse ? 80 : W - 10);
      const stroke = writes && ((y % 16 < 8 && x % 4 === 0) || y % 16 < 2);
      gray[y * W + x] = stroke ? ink : paper + noise();
    }
  }
  return gray;
}

function boxBlur(gray: Float32Array, radius: number, passes = 3): Float32Array {
  let current = gray;
  for (let pass = 0; pass < passes; pass += 1) {
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const yy = Math.min(H - 1, Math.max(0, y + dy));
            const xx = Math.min(W - 1, Math.max(0, x + dx));
            sum += current[yy * W + xx]!;
            count += 1;
          }
        }
        out[y * W + x] = sum / count;
      }
    }
    current = out;
  }
  return current;
}

describe("fotoğraf netlik ölçüsü", () => {
  it("keskin yazı geçer; ağır bulanık işaretlenir; hafif yumuşak ve soluk kurşun kalem geçer", () => {
    const sharp = page(215, 40);
    expect(qualityFromGray(sharp, W, H)).toMatchObject({ blurry: false, dark: false });
    expect(qualityFromGray(boxBlur(sharp, 3), W, H).blurry).toBe(true);
    // Hafif yumuşaklık (odak biraz kaçmış): uyarı yok.
    expect(qualityFromGray(boxBlur(sharp, 1, 1), W, H).blurry).toBe(false);
    // Seyrek, soluk kurşun kalem: kontrast düşük ama kenarlar keskin.
    const pencil = page(205, 160, true);
    const quality = qualityFromGray(pencil, W, H);
    expect(quality.score.contrast).toBeLessThan(10);
    expect(quality.blurry).toBe(false);
  });

  it("karanlık fotoğraf işaretlenir; tebeşirli kara tahta karanlık sayılmaz", () => {
    expect(qualityFromGray(page(35, 15), W, H).dark).toBe(true);
    expect(qualityFromGray(page(40, 220), W, H)).toMatchObject({ dark: false, blurry: false });
  });

  it("tarayıcı çözemezse ölçü yok (yükleme sürer)", async () => {
    expect(await assessPhotoQuality(new File(["x"], "not.jpg", { type: "image/jpeg" }))).toBeNull();
    expect(await assessPhotoQuality(new File(["x"], "not.pdf", { type: "application/pdf" }))).toBeNull();
  });
});

const BAD: PhotoQuality = { blurry: true, dark: false, score: { brightness: 180, contrast: 10, sharpness: 2, edge: 3, highlight: 200 } };
const GOOD: PhotoQuality = { blurry: false, dark: false, score: { brightness: 180, contrast: 60, sharpness: 900, edge: 120, highlight: 220 } };
const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });

describe("seçimdeki kötü fotoğraflar", () => {
  it("yalnız fotoğraflar ölçülür, sıra korunur; bütçe dolunca ölçülemeyen uyarısız geçer", async () => {
    const files = [photo("a.jpg"), new File(["%PDF"], "not.pdf", { type: "application/pdf" }), photo("bulanik.jpg"), photo("yavas.jpg")];
    const assessed: string[] = [];
    const flagged = await flagLowQualityPhotos(files, {
      budgetMs: 60,
      assess: async (file) => {
        assessed.push(file.name);
        if (file.name === "yavas.jpg") return new Promise<PhotoQuality | null>(() => undefined);
        return file.name === "bulanik.jpg" ? BAD : GOOD;
      },
    });
    expect(flagged.map((file) => file.name)).toEqual(["bulanik.jpg"]);
    expect(assessed).not.toContain("not.pdf");
  });

  it("motor soruyu yüklemeden önce sorar: Yeniden çek işaretleneni çıkarır, Yine de kullan olduğu gibi yükler", async () => {
    const files = [photo("net.jpg"), photo("bulanik.jpg")];
    const run = async (choice: "retake" | "use" | null) => {
      const uploaded: string[] = [];
      const asked: string[][] = [];
      await runUploadPipeline(
        files,
        {
          lanes: 1,
          photoSet: false,
          fastStart: false,
          expandPdf: async (list) => [...list],
          assessPhoto: async (file) => (file.name === "bulanik.jpg" ? BAD : GOOD),
        },
        {
          upload: async (file) => {
            uploaded.push(file.name);
            return { documentId: file.name };
          },
          process: async () => true,
          ...(choice
            ? {
                reviewPhotos: async (flagged: File[]) => {
                  asked.push(flagged.map((file) => file.name));
                  return choice;
                },
              }
            : {}),
        },
      );
      return { uploaded, asked };
    };
    expect(await run("retake")).toEqual({ uploaded: ["net.jpg"], asked: [["bulanik.jpg"]] });
    expect(await run("use")).toEqual({ uploaded: ["net.jpg", "bulanik.jpg"], asked: [["bulanik.jpg"]] });
    // Soruyu çizmeyen yüzey: ölçü de soru da yok.
    expect(await run(null)).toEqual({ uploaded: ["net.jpg", "bulanik.jpg"], asked: [] });
  });

  it("kanca soruyu ekrana verir ve cevabı bekler; soru kapalıysa hiç sormaz", async () => {
    const uploaded: string[] = [];
    const config = {
      lanes: 1,
      photoSet: false,
      fastStart: false,
      expandPdf: async (list: readonly File[]) => [...list],
      assessPhoto: async (file: File) => (file.name === "karanlik.jpg" ? { ...BAD, blurry: false, dark: true } : GOOD),
    };
    const handlers = {
      upload: async (file: File) => {
        uploaded.push(file.name);
        return { documentId: file.name };
      },
      process: async () => true as const,
    };
    const { result } = renderHook(() => useUniversalDocumentUpload(config, handlers, { photoQuality: true }));
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = result.current.run([photo("net.jpg"), photo("karanlik.jpg")]);
    });
    await waitFor(() => expect(result.current.photoQuality).toEqual({ flagged: ["karanlik.jpg"], total: 2 }));
    expect(uploaded).toEqual([]);
    act(() => result.current.answerPhotoQuality("retake"));
    await act(async () => {
      await done;
    });
    expect(result.current.photoQuality).toBeNull();
    expect(uploaded).toEqual(["net.jpg"]);

    uploaded.length = 0;
    const quiet = renderHook(() => useUniversalDocumentUpload(config, handlers));
    await act(async () => {
      await quiet.result.current.run([photo("karanlik.jpg")]);
    });
    expect(uploaded).toEqual(["karanlik.jpg"]);
  });

  it("soru kutusu ürün sahibinin cümlesiyle; iki seçenek", () => {
    expect(photoQualityPrompt(1)).toBe(
      "🔍 Bu fotoğraf çok bulanık/karanlık görünüyor, sayılar yanlış okunabilir — daha net çekmek ister misin?",
    );
    expect(photoQualityPrompt(3)).toBe(
      "🔍 Bu 3 fotoğraf çok bulanık/karanlık görünüyor, sayılar yanlış okunabilir — daha net çekmek ister misin?",
    );
    const onAnswer = vi.fn();
    const { container, rerender } = render(
      <PhotoQualityPrompt request={{ flagged: ["IMG_1.jpg"], total: 1 }} onAnswer={onAnswer} />,
    );
    expect(screen.getByRole("alert").textContent).toBe(photoQualityPrompt(1));
    fireEvent.click(screen.getByRole("button", { name: "Yeniden çek" }));
    fireEvent.click(screen.getByRole("button", { name: "Yine de kullan" }));
    expect(onAnswer.mock.calls).toEqual([["retake"], ["use"]]);

    rerender(<PhotoQualityPrompt request={{ flagged: ["a.jpg", "b.jpg"], total: 5 }} onAnswer={onAnswer} />);
    expect(container.textContent).toContain(photoQualityPrompt(2));
    expect(container.textContent).toContain("a.jpg, b.jpg");
    expect(container.textContent).toContain("öbür 3 dosya yüklenir");

    rerender(<PhotoQualityPrompt request={null} onAnswer={onAnswer} />);
    expect(container.querySelector("[data-photo-quality]")).toBeNull();
  });

  it("kurulum, telefon ve materyal ekle soruyu açar ve çizer", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "src/components/parity/exam-create-wizard.tsx",
      "src/components/parity/phone-upload-client.tsx",
      "src/components/parity/prep-add-material.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("{ photoQuality: true },");
      expect(source, file).toMatch(/<PhotoQualityPrompt request=\{\w+\.photoQuality\} onAnswer=\{\w+\.answerPhotoQuality\} \/>/);
    }
  });
});
