/**
 * Evrensel seviye ve ders kalibrasyonu (20 Kasım 2026).
 *  1. Aynı konu (Türev) dört seviyede farklı ton, kelime, örnek, derinlik ve görsel yoğunlukla istenir.
 *  2. Kalibrasyon ders, video, öğretmen sohbeti, Farklı anlat, test, sözlü ve podcast'e bağlıdır.
 *  3. "İki şık arasında kaldım" soru başına bir kez.
 *  4. KVKK, koşullar ve yaş onayı yeni kayıt ucunda sunucuda zorunludur; onay anları profile yazılır.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  levelFromExam,
  levelFromGrade,
  pedagogicalCalibrationBlock,
  resolvePedagogicalProfile,
  subjectDomainOf,
} from "@/lib/learning/pedagogical-profile";
import { calibrationProfileFor, parseGradeLevel } from "@/lib/learning/student-pedagogy";

const h = vi.hoisted(() => ({
  created: [] as Record<string, unknown>[],
  profile: { terms_accepted_at: null, kvkk_accepted_at: null, age_confirmed_at: "2026-11-01T08:00:00.000Z" } as Record<
    string,
    string | null
  >,
  patches: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  redisPipeline: vi.fn(async () => null),
  peekCount: vi.fn(async () => 0),
  rateLimit: vi.fn(async () => ({ ok: true })),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => undefined,
}));
vi.mock("@/lib/api/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/guards")>()),
  guestLimit: async () => null,
}));
vi.mock("@/lib/auth/email-verification", () => ({ UNVERIFIED_FLAG: "email_unverified", sendVerification: async () => true }));
vi.mock("@/lib/email/preferences", () => ({ recordSignupMarketingConsent: async () => undefined }));
vi.mock("@/lib/supabase/server", () => {
  const service = {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        limit: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: table === "profiles" ? { ...h.profile } : null, error: null }),
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
        update: (patch: Record<string, unknown>) => {
          if (table === "profiles") h.patches.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      });
      return builder;
    },
    rpc: async () => ({ data: false, error: null }),
    auth: {
      admin: {
        createUser: async (attrs: Record<string, unknown>) => {
          h.created.push(attrs);
          return { data: { user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", email: attrs.email } }, error: null };
        },
      },
    },
  };
  return { createServiceClient: () => service, createClient: async () => service };
});

import { claimTwoOptionAnswer, clearTwoOptionMemory, readTwoOptionAnswer, twoOptionKey } from "@/lib/learning/two-option-once";
import { POST as signup } from "@/app/api/auth/signup/route";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("1 · aynı konu, dört seviye", () => {
  const cases = [
    { grade: "8. sınıf", exam: "LGS", level: 1, options: 4, density: "simple" },
    { grade: "12. sınıf", exam: "YKS", level: 2, options: 5, density: "standard" },
    { grade: "Üniversite", exam: "Matematik vize", level: 3, options: 5, density: "technical" },
    { grade: "Mezun", exam: "KPSS", level: 4, options: 5, density: "dense" },
  ] as const;

  it("Türev her seviyede ayrı ton, kelime, örnek, derinlik ve görsel yoğunluk alır", () => {
    const blocks = cases.map((item) => {
      const profile = resolvePedagogicalProfile(item.grade, item.exam, "Türev");
      expect(profile.level).toBe(item.level);
      expect(profile.optionCount).toBe(item.options);
      expect(profile.visual.density).toBe(item.density);
      expect(profile.subjectDomain).toBe("mathematics");
      return { profile, lesson: pedagogicalCalibrationBlock(profile, "lesson") };
    });
    for (const field of ["tone", "vocabulary", "examples", "depth"] as const) {
      expect(new Set(blocks.map((block) => block.profile[field])).size).toBe(4);
    }
    expect(new Set(blocks.map((block) => block.lesson)).size).toBe(4);
    // Görsel yoğunluk seviye yükseldikçe artar; yazı ölçeği küçülür.
    const labels = blocks.map((block) => block.profile.visual.maxLabels);
    expect([...labels].sort((a, b) => a - b)).toEqual(labels);
    const scales = blocks.map((block) => block.profile.visual.fontScale);
    expect([...scales].sort((a, b) => b - a)).toEqual(scales);
  });

  it("uzmanlık sınavları, üniversite ve ortaokul doğru seviyeye düşer", () => {
    for (const exam of ["TUS", "DUS", "KPSS", "ALES", "DGS", "YDS", "Hâkimlik", "Kaymakamlık"]) {
      expect(levelFromExam(exam)).toBe(4);
    }
    expect(levelFromExam("Fizik final")).toBe(3);
    expect(levelFromExam("LGS")).toBe(1);
    expect(levelFromExam("YKS")).toBe(2);
    expect(levelFromGrade("6. sınıf")).toBe(1);
    expect(levelFromGrade("11. sınıf")).toBe(2);
    expect(levelFromGrade("Üniversite")).toBe(3);
    expect(parseGradeLevel("Üniversite 2. sınıf")).toBe("Üniversite");
  });

  it("hazırlığın adı sınav söylüyorsa kayıttaki hedefi geçersiz kılar; branş konudan", () => {
    const profile = calibrationProfileFor(
      { gradeLevel: "12. sınıf", targetExam: "YKS" } as Parameters<typeof calibrationProfileFor>[0],
      { prepTitle: "TUS Farmakoloji", subject: "TUS Farmakoloji" },
    );
    expect(profile.level).toBe(4);
    expect(profile.subjectDomain).toBe("medicine");
    expect(subjectDomainOf("Arz ve talep")).toBe("economics");
  });

  it("yüzeye göre satır: test şık sayısını, ders ve video görseli söyler, sohbet söylemez", () => {
    const middle = resolvePedagogicalProfile("7. sınıf", "LGS", "Türev");
    expect(pedagogicalCalibrationBlock(middle, "quiz")).toContain("Şık sayısı: 4 (A–D)");
    expect(pedagogicalCalibrationBlock(middle, "video")).toMatch(/^Görsel: /m);
    expect(pedagogicalCalibrationBlock(middle, "chat")).not.toMatch(/^Görsel: /m);
    for (const surface of ["lesson", "video", "chat", "reexplain", "quiz", "oral", "podcast"] as const) {
      expect(pedagogicalCalibrationBlock(middle, surface)).toContain("seviyeden bağımsızdır");
    }
  });
});

describe("2 · kalibrasyon her öğretim yüzeyine bağlı", () => {
  it("ders, test, podcast, motor kabuğu (sözlü, kart, D/Y, video), sohbet ve Farklı anlat", () => {
    for (const path of [
      "src/lib/learning/teacher-lesson-run.ts",
      "src/lib/learning/teacher-quiz-run.ts",
      "src/lib/learning/teacher-podcast-run.ts",
    ]) {
      expect(read(path)).toMatch(/studentPedagogyBlock\(service, input\.userId, "(lesson|quiz|podcast)", \{ prepTitle: input\.prepTitle/);
    }
    const engine = read("src/lib/learning/teacher-engine-run.ts");
    expect(engine).toContain("prepTitle: options.prepTitle ?? null");
    expect(engine).toContain('options.label === "teacher_video" ? { calibration: "video" as const }');
    for (const path of ["src/lib/learning/node/oral.ts", "src/lib/learning/node/cards.ts", "src/lib/learning/node/true-false.ts", "src/lib/learning/video-run.ts"]) {
      expect(read(path)).toContain("prepTitle: input.prepTitle");
    }
    const chat = read("src/app/api/ai/chat/route.ts");
    expect(chat).toContain('studentCalibration(service, userId, "chat"');
    expect(chat).toContain("${calibrationLine}");
    expect(chat).toContain("await calibrationEarly,");
    const reexplain = read("src/app/api/learning/exam-prep/reexplain/route.ts");
    expect(reexplain).toContain('studentCalibration(service, userId, "reexplain"');
    expect(reexplain).toContain("systemAddendum: [SOURCE_NUMBER_PRIORITY, calibration.block].join(PARAGRAPH)");
  });
});

describe("3 · iki şık arasında kaldım: soru başına bir kez", () => {
  beforeEach(() => clearTwoOptionMemory());

  it("ikinci istek yeni ipucu almaz; ilk cevap aynen döner ve düğme kilitlenir", async () => {
    const key = twoOptionKey("ogrenci", "deneme", 2);
    const first = await claimTwoOptionAnswer(key, { hint: "Fark tanımda.", fallback: false, eliminated: "B" });
    const second = await claimTwoOptionAnswer(key, { hint: "Başka bir fark.", fallback: false, eliminated: "D" });
    expect(second).toEqual(first);
    expect(await readTwoOptionAnswer(key)).toEqual(first);
    const route = read("src/app/api/learning/two-option-hint/route.ts");
    expect(route).toContain("if (earlier) return NextResponse.json({ ok: true, ...earlier, used: true });");
    const chip = read("src/components/learning/two-option-hint.tsx");
    expect(chip).toContain("disabled={used}");
    expect(chip).toContain("TWO_OPTION_USED");
  });
});

describe("4 · KVKK, koşullar ve yaş sunucuda zorunlu", () => {
  const VALID = {
    email: "deneme.ogrenci@ornek.edu.tr",
    password: "Guvenli2026",
    fullName: "Deneme Öğrenci",
    consentAcceptedAt: new Date(Date.now() - 60_000).toISOString(),
    termsAccepted: true,
    kvkkAccepted: true,
    ageConfirmed: true,
  };
  const call = (body: Record<string, unknown>) =>
    signup(
      new Request("https://cortexplus.app/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
        body: JSON.stringify(body),
      }),
    );

  beforeEach(() => {
    h.created.length = 0;
    h.patches.length = 0;
  });

  it("onaylardan biri yoksa ya da true değilse hesap açılmaz", async () => {
    for (const field of ["termsAccepted", "kvkkAccepted", "ageConfirmed"] as const) {
      const missing: Record<string, unknown> = { ...VALID };
      delete missing[field];
      const res = await call(missing);
      expect(res.status).toBe(400);
      expect((await res.json()).reason).toBe("consent_required");
      const falsy = await call({ ...VALID, [field]: false });
      expect(falsy.status).toBe(400);
    }
    expect(h.created).toHaveLength(0);
  });

  it("üç onay varsa hesap açılır ve profildeki boş onay anları yazılır (dolu olan ezilmez)", async () => {
    const res = await call(VALID);
    expect(res.status).toBe(200);
    expect(h.created).toHaveLength(1);
    expect(h.patches).toHaveLength(1);
    const patch = h.patches[0]!;
    expect(Object.keys(patch).sort()).toEqual(["kvkk_accepted_at", "terms_accepted_at"]);
    expect(patch.terms_accepted_at).toBe(VALID.consentAcceptedAt);
    expect(patch.kvkk_accepted_at).toBe(VALID.consentAcceptedAt);
  });
});

/* ───────────── 5 · görsel motor: veri güdümlü ve seviyeye duyarlı ───────────── */

import { levelFromCalibrationBlock } from "@/lib/learning/pedagogical-profile";
import { parseVisualScene, type VisualScene } from "@/lib/learning/visual-scenes/schema";
import { sceneFrame } from "@/lib/learning/visual-scenes/layout";
import { layoutBlueprint } from "@/components/learning/visual-scenes/ArchitecturalBlueprintScene";
import { layoutLawDecision } from "@/components/learning/visual-scenes/LawDecisionScene";
import { layoutConceptStructure } from "@/components/learning/visual-scenes/ConceptStructureScene";
import { stampSceneLevel } from "@/lib/learning/teacher-lesson-run";
import { LESSON_V3_FORMAT, type LessonV3 } from "@/lib/learning/lesson-v3";

// Jenerik fikstürler: gerçek ders içeriği yok; yalnız biçim farkı.
const ARCH_A = {
  archetype: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  title: "Örtülü yapının kesiti",
  viewType: "section",
  elements: [
    { id: "o", label: "Üst örtü", role: "Yükü ayaklara aktarır", kind: "dome" },
    { id: "a", label: "Taşıyıcı ayaklar", role: "Düşey yükü indirir", kind: "column", count: 4 },
    { id: "t", label: "Temel", role: "Yükü zemine yayar", kind: "foundation" },
  ],
};
const ARCH_B = {
  archetype: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  title: "Aks planı",
  viewType: "plan",
  elements: [
    { label: "Kolonlar", role: "Aks kesişiminde", kind: "column", count: 3 },
    { label: "Kapı", role: "Giriş", kind: "opening", variant: "door" },
  ],
};
const LAW_A = {
  archetype: "LAW_SOCIAL_FLOWCHART",
  title: "Tek şart",
  decision: { question: "Şart sağlandı mı?", yes: "Geçerli", no: "Geçersiz" },
};
const LAW_B = {
  archetype: "LAW_SOCIAL_FLOWCHART",
  title: "Üç kademeli karar",
  nodes: [
    { id: "q1", text: "Birinci şart var mı?", yes: "q2", no: "Reddedilir" },
    { id: "q2", text: "İkinci şart var mı?", yes: "q3", no: "Tamamlanır" },
    { id: "q3", text: "Süre içinde mi?", yes: "Geçerli", no: "Hak düşer" },
  ],
  majority: [{ label: "Gerekli sayı", fraction: "2/3", count: 40, total: 60, actual: 45 }],
};
const CONCEPT_A = {
  archetype: "CONCEPT_STRUCTURE_VISUALIZER",
  title: "Dört aşamalı süreç",
  structure: "process",
  items: [{ label: "Birinci aşama" }, { label: "İkinci aşama" }, { label: "Üçüncü aşama" }, { label: "Dördüncü aşama" }],
};
const CONCEPT_B = {
  archetype: "CONCEPT_STRUCTURE_VISUALIZER",
  title: "Üç durakta kronoloji",
  structure: "timeline",
  items: [
    { date: "Birinci dönem", label: "Başlangıç" },
    { date: "İkinci dönem", label: "Gelişme" },
    { date: "Üçüncü dönem", label: "Sonuç" },
  ],
};

const parsed = (raw: Record<string, unknown>): VisualScene => {
  const scene = parseVisualScene(raw);
  expect(scene, String(raw.title)).not.toBeNull();
  return scene!;
};
const layoutOf = (raw: Record<string, unknown>, level?: 1 | 2 | 3 | 4) => {
  const scene = parsed(raw);
  const frame = sceneFrame("16:9", "lesson", level ?? null);
  if (scene.archetype === "ARCHITECTURE_SPATIAL_BLUEPRINT") return layoutBlueprint(scene as never, frame);
  if (scene.archetype === "LAW_SOCIAL_FLOWCHART") return layoutLawDecision(scene as never, frame);
  return layoutConceptStructure(scene as never, frame);
};
const signature = (layout: unknown) => JSON.stringify(layout);

describe("5 · görsel: farklı JSON farklı çizim, seviye yoğunluğu değiştirir", () => {
  it("mimarlık, hukuk ve genel kavram sahnesi giriş verisine göre ayrı yerleşim üretir", () => {
    for (const [a, b] of [
      [ARCH_A, ARCH_B],
      [LAW_A, LAW_B],
      [CONCEPT_A, CONCEPT_B],
    ] as const) {
      expect(signature(layoutOf(a))).not.toBe(signature(layoutOf(b)));
    }
  });

  it("aynı veri: seviye 1 daha büyük başlık ve daha az etiket, seviye 4 daha çok ayrıntı", () => {
    for (const raw of [ARCH_A, LAW_B, CONCEPT_A]) {
      const low = layoutOf(raw, 1) as { texts: { id: string; fontSize: number }[] };
      const high = layoutOf(raw, 4) as { texts: { id: string; fontSize: number }[] };
      const title = (layout: typeof low) => layout.texts.find((box) => box.id === "title")!.fontSize;
      expect(title(low), String(raw.title)).toBeGreaterThan(title(high));
      expect(low.texts.length, String(raw.title)).toBeLessThanOrEqual(high.texts.length);
    }
  });

  it("sahnenin seviyesi modelden değil öğrencinin profilinden yazılır", () => {
    const block = pedagogicalCalibrationBlock(resolvePedagogicalProfile("7. sınıf", "LGS", "Tarih"), "lesson");
    expect(levelFromCalibrationBlock(block)).toBe(1);
    expect(levelFromCalibrationBlock(pedagogicalCalibrationBlock(resolvePedagogicalProfile("Mezun", "TUS", "Tıp"), "lesson"))).toBe(4);
    expect(levelFromCalibrationBlock("")).toBeNull();
    const lesson = {
      format: LESSON_V3_FORMAT,
      title: "Örnek",
      screens: [{ heading: "Süreç", concept: "Süreç", blocks: [{ type: "visual_scene", scene: { ...parsed(CONCEPT_A), pedagogicalLevel: 4 } }] }],
    } as unknown as LessonV3;
    const stamped = stampSceneLevel(lesson, levelFromCalibrationBlock(block));
    const scene = (stamped.screens[0]!.blocks[0] as { scene: { pedagogicalLevel?: number } }).scene;
    expect(scene.pedagogicalLevel).toBe(1);
    expect(stampSceneLevel(lesson, null)).toBe(lesson);
  });
});
