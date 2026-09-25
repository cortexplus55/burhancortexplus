import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/learning/exam-prep/node/route";
import { reviewQuestionFor } from "@/lib/learning/teacher-brain";
import {
  describeLessonShapeGaps,
  lessonHasTeachingCore,
  lessonPublishIssues,
  publishLessonDraft,
} from "@/lib/learning/teaching-standards";
import {
  classifyVerifierIssue,
  settleRejectedLesson,
} from "@/lib/learning/validation-pipeline";

/**
 * Canlı 502'ler, e499471 sonrası. İki isteğin red listeleri Vercel
 * kaydından aynen alındı. Birim şikâyeti gösterge/vakum hesabı;
 * özgül enerji örneği kaynakta yok.
 */
const case1Domain = ["Birim dönüşümü tutarsız: 49.05 kPa = 144.1 kPa"];

const case1AfterRepair = [
  "Kaynakta olmayan bilgiler eklenmiş: Özgül enerji kavramı ve formülü ('Bir sistemin 10 kg kütlesi varsa, özgül enerjisi 300 kJ/kg ise, toplam enerji nedir?' örneğindeki enerji hesapları) kaynak sayfalarda yer almıyor.",
  "Kaynakla doğrudan uyumlu olmayan formül ve kurallar kullanılmış: 'Gaz denklemlerinde mutlak sıcaklık kullanılmalıdır.' ve 'Mutlak sıcaklık ölçekleri Kelvin ve Rankine’dir.' ifadeleri gibi bilgiler eksik ifade edilmiş.",
  "Öğretim planında istenen şekilde üç adet kavram bölümü yok, verilen kavram sayısı yetersiz görülmüş.",
  "Kaynağa dayalı çözümlü örneklerde kaynaktan doğrudan daha fazla yararlanılmalı, sadece genel ifadeler yerine sayfada verilen spesifik bilgiler kullanılmalı.",
];

const case2Domain = [
  "Birim dönüşümü tutarsız: 20 kPa = 81 kPa",
  "Öğrenme hedefi açık olarak tanımlanmamış; 'Basınç ve sıcaklık etkilerini analiz edebilir' ifadesi net değil ve öğrenciye yönlendirme sağlayacak ölçütler sunmuyor.",
  "Overview bölümü çok genel ve öğrenciye konunun özünü 400 karakteri aşmadan açıklamıyor.",
  "Bazı bölümlerde tanım ve açıklama net değil: Örneğin, 'Basınç, sistemin içindeki akışkanların davranışını belirler' cümlesi basit bir tanım olarak veriliyor ancak nasıl ve neden belirlediği belirtilmemiş.",
  "Yanlış seçenek açıklamaları genellikle sadece doğru cevabın tekrarlamasından ibaret; yanlışların neden yanlış olduğuna dair yeterince açıklama yok.",
  "Örnek çözüm kısmında verilen adımların kontrolü eksik; adım adım geçişlerde kullanılan kurallar detaylı açıklanmalı.",
  "Kaynağa dayalı örnek yeterince değil; öğrencinin anlamasını sağlamaya yönelik daha detaylı ve adımlandırılmış çözüm sunulmamış.",
  "Ödev veya sınav konusuna uygunluğu kontrol için yeterli bilgi bulunmuyor; materyalin tamamı verilmediği için önemli içerik kararları eksik ya da doğrulanamıyor.",
];

const case2Pedagogy = [
  "Ders en az 3 bölüm istiyor; konunun kavramlarını ayır.",
  "Taslakta yalnızca iki kavram bölümü var, bu nedenle en az üç kavram bölümü gerekliliği karşılanmamış.",
  "Basınç ve sıcaklık konuları için doğru bilgileri içeren üç kapsamlı bölüm bulunmuyor, bu nedenle taslak eksik bilgi sunuyor.",
  "Örnek çözümlerde kullanılan adımlar doğru temellendirilmemiş, hesaplanan sonuçların ara adımlarla uyumluluğu doğrulanmamış.",
  "'Basınç, yüzeye uygulanan kuvvetin alana oranıdır.' ifadesi aşırı genelde bırakılmış, sistemler ve farklı basınç türleri açısından daha detaylı açıklanmalıdır.",
];

const vagueNotes = [
  "tanım net değil",
  "overview çok genel",
  "daha detaylı açıklanmalı",
  "yanlış seçenek açıklamaları yetersiz",
  "kaynağa dayalı örnek yeterince değil",
  "materyalin tamamı verilmediği için doğrulanamıyor",
  "adımlar temellendirilmemiş",
  "en az 3 bölüm istiyor; yalnızca iki kavram bölümü var",
];

const pressureCheck = {
  type: "mcq" as const,
  prompt: "Basınç hangi oranla tanımlanır?",
  options: ["Kuvvet bölü alan", "Kütle bölü hacim", "Enerji bölü zaman"],
  answerIndex: 0,
  explanation: "Kütle bölü hacim yoğunluktur; basınç kuvvetin alana bölümüdür.",
};

const temperatureCheck = {
  type: "trueFalse" as const,
  prompt: "Santigrat değer mutlak sıcaklığın kendisidir.",
  options: ["Doğru", "Yanlış"],
  answerIndex: 1,
  explanation: "Mutlak sıcaklık santigrata 273 eklenerek bulunur, kendisi değildir.",
};

function pressureLesson(sectionsExtra: Record<string, unknown>[] = []) {
  return {
    title: "Basınç ve Sıcaklık Kavramları",
    objective: "Gösterge basıncından mutlak basıncı ve vakumu hesaplayabileceksin.",
    overview: "Mutlak basınç gösterge basıncı ile atmosfer basıncının toplamıdır.",
    sections: [
      {
        heading: "Basınç Tanımı",
        body:
          "**Basınç**, yüzeye uygulanan kuvvetin alana oranıdır. **Mutlak basınç** için " +
          "P_abs = P_gage + P_atm = 49.05 kPa + 95 kPa = 144.1 kPa. Vakumda " +
          "P_vakum = P_atm − P_abs = 101 kPa − 20 kPa = 81 kPa.",
        check: pressureCheck,
      },
      {
        heading: "Sıcaklık Ölçeği",
        body:
          "**Sıcaklık** termometre ile ölçülür. **Kelvin** ölçeğinde 25 °C = 298 K yazılır. " +
          "Hidrostatik basınç P = 1000 × 9.81 × 2 = 19620 Pa bağıntısıyla okunur.",
        check: temperatureCheck,
      },
      ...sectionsExtra,
    ],
    example: {
      prompt: "Bir sistemin 10 kg kütlesi varsa, özgül enerjisi 300 kJ/kg ise, toplam enerji nedir?",
      solution:
        "Özgül enerji 300 kJ/kg ise toplam enerji 10 × 300 = 3000 kJ olur çünkü kütle ile özgül enerji çarpılır.",
    },
    commonMistake: {
      claim: "Gösterge basıncı mutlak basınca eşittir.",
      correction: "Mutlak basınç, gösterge basıncına atmosfer basıncı eklenerek bulunur.",
    },
    infoCheck: {
      prompt: "Mutlak basınç nasıl bulunur?",
      answer: "Gösterge basıncına atmosfer basıncı eklenir.",
    },
    summary: ["Basınç kuvvet bölü alandır.", "Kelvin santigrata 273 ekler."],
    nextFocus: ["Hal değişimi"],
  };
}

describe("live rejection replay", () => {
  it("keeps vague pedagogy and false pressure equalities off the blocking list", () => {
    for (const note of [...vagueNotes, ...case2Domain, ...case2Pedagogy, ...case1Domain]) {
      expect(classifyVerifierIssue(note)).toBe("non_blocking");
    }
    expect(classifyVerifierIssue(case1AfterRepair[0])).toBe("blocking");
    expect(classifyVerifierIssue(case1AfterRepair[1])).toBe("non_blocking");
    expect(classifyVerifierIssue(case1AfterRepair[2])).toBe("non_blocking");
    expect(classifyVerifierIssue(case1AfterRepair[3])).toBe("non_blocking");
  });

  it("accepts the post-86 pressure lesson and drops only the specific-energy example", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const draft = JSON.stringify(pressureLesson());
    const domain = settleRejectedLesson(draft, case1Domain);
    expect(domain.accepted).toBe(true);
    expect(domain.removed).toEqual([]);

    const settled = settleRejectedLesson(draft, case1AfterRepair);
    expect(settled.accepted).toBe(true);
    expect(settled.removed).toEqual(["example"]);
    const lesson = JSON.parse(settled.content) as {
      example: { prompt: string; solution: string };
      sections: { heading: string; check?: { prompt: string } }[];
    };
    expect(lesson.example.prompt).not.toMatch(/özgül enerji|300 kJ/i);
    expect(lesson.example.solution).not.toMatch(/özgül enerji|300 kJ/i);
    expect(lesson.sections.map((section) => section.heading)).toEqual([
      "Basınç Tanımı",
      "Sıcaklık Ölçeği",
    ]);
    expect(lesson.sections.filter((section) => section.check).length).toBeGreaterThanOrEqual(1);
    expect(lessonPublishIssues(lesson, { minSections: 2 })).toEqual([]);
    expect(spy).toHaveBeenCalledWith("removed_for_source", { removed: ["example"] });
    spy.mockRestore();
  });

  it("accepts the second live list without removing a sound section", () => {
    const draft = JSON.stringify(pressureLesson());
    const settled = settleRejectedLesson(draft, [...case2Domain, ...case2Pedagogy]);
    expect(settled.accepted).toBe(true);
    expect(settled.removed).toEqual([]);
    expect(settled.content).toBe(draft);
  });

  it("removes an injected ideal-gas section and rejects when nothing sound remains", () => {
    const withGas = pressureLesson([
      {
        heading: "İdeal Gaz",
        body: "İdeal gaz yasası PV = nRT ile basıncı sıcaklığa bağlar.",
        check: pressureCheck,
      },
    ]);
    const issue = [
      "Kaynakta olmayan bilgi ve formüller kullanılmış. İdeal gaz yasası (PV = nRT) örneği, dokümanda yer almıyor.",
    ];
    const settled = settleRejectedLesson(JSON.stringify(withGas), issue);
    expect(settled.accepted).toBe(true);
    expect(settled.removed).toEqual(["section:İdeal Gaz"]);
    expect(settled.content).not.toMatch(/PV = nRT|İdeal gaz/i);
    expect(lessonPublishIssues(JSON.parse(settled.content), { minSections: 2 })).toEqual([]);

    const onlyGas = pressureLesson();
    onlyGas.sections = [
      {
        heading: "İdeal Gaz",
        body: "İdeal gaz yasası PV = nRT ile basıncı sıcaklığa bağlar.",
        check: pressureCheck,
      },
    ];
    const rejected = settleRejectedLesson(JSON.stringify(onlyGas), issue);
    expect(rejected.accepted).toBe(false);
    expect(rejected.removed).toEqual([]);
  });

  it("accepts after a section is removed when one section and an info check remain", () => {
    const lesson = pressureLesson();
    lesson.overview = "Basınç, birim alana dik gelen kuvvettir.";
    lesson.sections = [
      {
        heading: "Sıcaklık Kavramı ve Dönüşüm",
        body: "Sıcaklık farkında 1 K = 1 °C yazılır ve mutlak ölçek ayrı okunur.",
        check: pressureCheck,
      },
      {
        heading: "Basınç Tanımı",
        body: "Basınç, birim alana dik olarak etki eden kuvvetin alana oranıdır.",
      },
    ];
    const settled = settleRejectedLesson(JSON.stringify(lesson), [
      "Kaynakta olmayan bilgi: 'Sıcaklık farkında 1 K = 1 °C yazılır' cümlesi sayfada yok.",
    ]);
    expect(settled.accepted).toBe(true);
    expect(settled.removed).toContain("section:Sıcaklık Kavramı ve Dönüşüm");
    const published = JSON.parse(settled.content) as {
      sections: { heading: string }[];
      infoCheck?: { prompt: string; answer: string };
    };
    expect(published.sections.map((section) => section.heading)).toEqual(["Basınç Tanımı"]);
    expect(published.infoCheck?.answer.length).toBeGreaterThanOrEqual(2);
    expect(lessonHasTeachingCore(published)).toBe(true);
    expect(lessonPublishIssues(published)).toEqual([]);
    expect(settled.content).not.toMatch(/1 K = 1 °C/);
  });
});

const pipelineMocks = vi.hoisted(() => ({
  create: vi.fn(),
  reserve: vi.fn(async () => ({ ok: true as const, reservationId: "res-1", cost: 1 })),
  commit: vi.fn(async () => {}),
  refund: vi.fn(async () => {}),
  usage: vi.fn(async () => {}),
  guard: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_STANDARD_MODEL: "std",
    OPENAI_LESSON_MODEL: "gpt-4.1-mini",
    OPENAI_ADVANCED_MODEL: "adv",
  },
}));

vi.mock("@/lib/credits/service", () => ({
  reserveCredits: pipelineMocks.reserve,
  commitCredits: pipelineMocks.commit,
  refundCredits: pipelineMocks.refund,
  recordUsage: pipelineMocks.usage,
  newIdempotencyKey: () => "idem-replay",
}));

vi.mock("@/lib/learning/validation-metrics", () => ({
  recordValidationEvent: vi.fn(async () => {}),
  metricsFromFailure: (metrics: unknown) => metrics,
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: pipelineMocks.create } };
  },
  APIError: class APIError extends Error {},
}));

vi.mock("@/lib/api/guards", () => ({
  withUser: pipelineMocks.guard,
  errorResponse: (status: number, error: string) => Response.json({ error }, { status }),
}));

describe("lesson generation pipeline", () => {
  beforeEach(() => {
    pipelineMocks.create.mockReset();
    pipelineMocks.reserve.mockClear();
    pipelineMocks.commit.mockClear();
    pipelineMocks.refund.mockClear();
    pipelineMocks.usage.mockClear();
  });

  it("returns a lesson after validation and charges once", async () => {
    const { generateJson } = await import("@/lib/ai/generate");
    const lesson = pressureLesson();
    const raw = JSON.stringify(lesson);
    const review = {
      approved: false,
      issues: case1AfterRepair,
    };
    pipelineMocks.create
      .mockResolvedValueOnce(completion(raw))
      .mockResolvedValueOnce(completion(JSON.stringify(review)))
      .mockResolvedValueOnce(completion(JSON.stringify({ content: raw })))
      .mockResolvedValueOnce(completion(JSON.stringify(review)));

    const result = await generateJson({
      service: {} as never,
      userId: "student-1",
      actionCode: "STUDY_PLAN_GENERATE",
      isPremium: true,
      validationProfile: "v2",
      activityKind: "lesson",
      maxDraftAttempts: 1,
      allowIndependentAccept: false,
      schemaHint: "lesson",
      userPrompt: "Basınç ve Sıcaklık Kavramları dersini yaz.",
      buildIndependent: (_content, parsed) => ({
        pedagogyIssues: lessonPublishIssues(parsed, { minSections: 2 }),
      }),
      parse: (parsed) => (lessonPublishIssues(parsed, { minSections: 2 }).length ? null : parsed),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { example: { prompt: string }; sections: unknown[] };
    expect(data.example.prompt).not.toMatch(/özgül enerji|300 kJ/i);
    expect(data.sections.length).toBeGreaterThanOrEqual(1);
    expect(pipelineMocks.reserve).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.commit).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.refund).not.toHaveBeenCalled();
  });

  it("retries one upstream 503 on the same reservation", async () => {
    const { generateJson } = await import("@/lib/ai/generate");
    const lesson = pressureLesson();
    const raw = JSON.stringify(lesson);
    const review = {
      approved: false,
      issues: case1AfterRepair,
    };
    pipelineMocks.create
      .mockRejectedValueOnce(Object.assign(new Error("upstream"), { status: 503 }))
      .mockResolvedValueOnce(completion(raw))
      .mockResolvedValueOnce(completion(JSON.stringify(review)))
      .mockResolvedValueOnce(completion(JSON.stringify({ content: raw })))
      .mockResolvedValueOnce(completion(JSON.stringify(review)));

    const result = await generateJson({
      service: {} as never,
      userId: "student-1",
      actionCode: "STUDY_PLAN_GENERATE",
      isPremium: true,
      validationProfile: "v2",
      activityKind: "lesson",
      maxDraftAttempts: 1,
      allowIndependentAccept: false,
      schemaHint: "lesson",
      userPrompt: "Basınç ve Sıcaklık Kavramları dersini yaz.",
      buildIndependent: (_content, parsed) => ({
        pedagogyIssues: lessonPublishIssues(parsed, { minSections: 2 }),
      }),
      parse: (parsed) => (lessonPublishIssues(parsed, { minSections: 2 }).length ? null : parsed),
    });

    expect(result.ok).toBe(true);
    expect(pipelineMocks.reserve).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.commit).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.refund).not.toHaveBeenCalled();
    expect(pipelineMocks.create).toHaveBeenCalledTimes(5);
  });

  it("refunds the single reservation when nothing sound remains", async () => {
    const { generateJson } = await import("@/lib/ai/generate");
    const onlyGas = pressureLesson();
    onlyGas.sections = [
      {
        heading: "İdeal Gaz",
        body: "İdeal gaz yasası PV = nRT ile basıncı sıcaklığa bağlar.",
        check: pressureCheck,
      },
    ];
    const raw = JSON.stringify(onlyGas);
    const review = {
      approved: false,
      issues: [
        "Kaynakta olmayan bilgi ve formüller kullanılmış. İdeal gaz yasası (PV = nRT) örneği, dokümanda yer almıyor.",
      ],
    };
    pipelineMocks.create
      .mockResolvedValueOnce(completion(raw))
      .mockResolvedValueOnce(completion(JSON.stringify(review)))
      .mockResolvedValueOnce(completion(JSON.stringify({ content: raw })))
      .mockResolvedValueOnce(completion(JSON.stringify(review)));

    const result = await generateJson({
      service: {} as never,
      userId: "student-1",
      actionCode: "STUDY_PLAN_GENERATE",
      isPremium: true,
      validationProfile: "v2",
      activityKind: "lesson",
      maxDraftAttempts: 1,
      allowIndependentAccept: false,
      schemaHint: "lesson",
      userPrompt: "Basınç dersini yaz.",
      buildIndependent: (_content, parsed) => ({
        pedagogyIssues: lessonPublishIssues(parsed, { minSections: 2 }),
      }),
      parse: (parsed) => (lessonPublishIssues(parsed, { minSections: 2 }).length ? null : parsed),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(502);
    expect(pipelineMocks.reserve).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.commit).not.toHaveBeenCalled();
    expect(pipelineMocks.refund).toHaveBeenCalledTimes(1);
  });
});

function completion(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 12, completion_tokens: 8 },
  };
}

const PREP = "00000000-0000-4000-8000-000000000011";
const NODE = "00000000-0000-4000-8000-000000000012";
const REQ = "00000000-0000-4000-8000-000000000013";
const ATTEMPT = "00000000-0000-4000-8000-000000000014";
const GEN = "00000000-0000-4000-8000-000000000015";
const DOC = "00000000-0000-4000-8000-000000000016";
const TOPIC = "00000000-0000-4000-8000-000000000017";

const PAGE_TEXT =
  "Basınç, yüzeye uygulanan kuvvetin alana oranıdır. " +
  "P_abs = P_gage + P_atm = 49.05 kPa + 95 kPa = 144.1 kPa. " +
  "P_vakum = 101 kPa - 20 kPa = 81 kPa. " +
  "25 °C = 298 K. P = 1000 × 9.81 × 2 = 19620 Pa. Toplam 3000 kJ.";

const PV_TOPIC = "P-v ve T-v Diyagramları";

const PV_PAGE_TEXT =
  "P-v ve T-v diyagramında doymuş sıvı eğrisi ile doymuş buhar eğrisi kritik noktada birleşir. " +
  "Doymuş sıvı eğrisi x = 0 olan sınırdır. " +
  "Doymuş buhar eğrisi x = 1 sınırıdır. " +
  "Kritik noktada Tc = 374.14 °C ve Pc = 22.09 MPa değerleri okunur. " +
  "Karışımın hacmi v = v_f + x * v_fg şeklinde hesaplanabilir. " +
  "İç enerji u = u_f + x * u_fg bağıntısıyla yazılır. " +
  "Entalpi h = h_f + x * h_fg aynı kuruluk derecesiyle okunur. " +
  "Bir karışımda v_f = 0.001 m3/kg, v_fg = 1.67 m3/kg ve x = 0.80 ise özgül hacim bu bağıntıyla bulunur.";

const PV_FORMULAS = [
  "v = v_f + x*v_fg = 0.001 + 0.80×1.67",
  "u = u_f + x*u_fg",
  "h = h_f + x*h_fg",
];

/** Canlı konu başlığı ve sayfa metni. Null iken basınç dersi durur. */
let routeTopic: string | null = null;
let routePageText: string | null = null;

function tableResult(table: string, op: string) {
  if (table === "feature_flags") return { data: { enabled: true }, error: null };
  if (table === "subscriptions") return { data: null, error: null };
  if (table === "exam_preps") {
    return {
      data: {
        id: PREP,
        title: "Termodinamik",
        exam_type: "vize",
        active_topic_id: TOPIC,
        target_score: null,
        learning_preferences: null,
        hard_topics_self: [],
        document_id: DOC,
        source_document_ids: null,
      },
      error: null,
    };
  }
  if (table === "exam_prep_nodes") {
    return {
      data: {
        id: NODE,
        kind: "lesson",
        title: "Ders",
        status: "ready",
        sort_order: 1,
        session_meta: {
          topicTitle: routeTopic ?? "Basınç ve Sıcaklık Kavramları",
          sourcePages: [3],
        },
      },
      error: null,
    };
  }
  if (table === "exam_prep_topics") {
    if (op === "list") return { data: [], error: null };
    return {
      data: { id: TOPIC, label: routeTopic ?? "Basınç ve Sıcaklık Kavramları", measured_level: null },
      error: null,
    };
  }
  if (table === "documents") {
    return {
      data: { id: DOC, file_name: "termo.pdf", source_boundary_mode: "documents_only" },
      error: null,
    };
  }
  if (table === "document_pages") {
    return {
      data: [
        {
          page_number: 3,
          text_content: routePageText ?? (routeTopic === PV_TOPIC ? PV_PAGE_TEXT : PAGE_TEXT),
          formulas: routeTopic === PV_TOPIC ? PV_FORMULAS : [],
          extraction_ok: true,
          page_kind: "content",
          headings: [],
        },
      ],
      error: null,
    };
  }
  if (table === "document_teacher_analyses") return { data: null, error: null };
  if (table === "exam_prep_node_attempts") {
    if (op === "insert") return { data: { id: ATTEMPT, generation_id: GEN }, error: null };
    if (op === "update") {
      return {
        data: {
          id: ATTEMPT,
          status: "active",
          payload: null,
          answers: {},
          answer_meta: {},
          score: null,
          total: 1,
          generation_id: GEN,
          client_request_id: REQ,
          complete_request_id: null,
          content_version: 1,
          updated_at: new Date().toISOString(),
          difficulty: "orta",
          voice_mode: false,
          started_at: new Date().toISOString(),
          expires_at: null,
        },
        error: null,
      };
    }
    return { data: null, error: null };
  }
  return { data: null, error: null };
}

function supabase() {
  const from = vi.fn((table: string) => {
    let op = "select";
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.or = chain;
    builder.is = chain;
    builder.in = chain;
    builder.gt = chain;
    builder.not = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.insert = () => {
      op = "insert";
      return builder;
    };
    builder.update = () => {
      op = "update";
      return builder;
    };
    builder.upsert = () => {
      op = "upsert";
      return builder;
    };
    builder.maybeSingle = () => Promise.resolve(tableResult(table, op === "update" ? "update" : "maybe"));
    builder.single = () => Promise.resolve(tableResult(table, op));
    builder.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(tableResult(table, op === "select" ? "list" : op)).then(onFulfilled, onRejected);
    return builder;
  });
  return { from, rpc: vi.fn(async () => ({ data: null, error: null })) };
}

function pvDiagramLesson() {
  return {
    title: PV_TOPIC,
    objective: "Doymuş sıvı ve doymuş buhar eğrilerini diyagramda ayırt edebileceksin.",
    overview:
      "P-v ve T-v diyagramında doymuş sıvı eğrisi ile doymuş buhar eğrisi kritik noktada birleşir.",
    sections: [
      {
        heading: "Doymuş sıvı eğrisi",
        body:
          "**Doymuş sıvı eğrisi**, x = 0 olan sınırdır. Karışımın hacmi v = v_f + x·v_fg bağıntısıyla yazılır.",
        check: {
          type: "trueFalse" as const,
          prompt: "Doymuş sıvı eğrisinde kuruluk derecesi sıfırdır.",
          options: ["Doğru", "Yanlış"],
          answerIndex: 0,
          explanation: "Yanlış seçenek buhar eğrisini anlatır; sıvı eğrisinde kuruluk sıfırdır.",
        },
      },
      {
        heading: "Doymuş buhar eğrisi",
        body:
          "**Doymuş buhar eğrisi** x = 1 sınırıdır. İç enerji u = u_f + x·u_fg ve entalpi h = h_f + x·h_fg aynı kurulukla okunur.",
        check: {
          type: "mcq" as const,
          prompt: "Doymuş buhar eğrisinde kuruluk derecesi kaçtır?",
          options: ["Sıfır", "Bir", "Yarım"],
          answerIndex: 1,
          explanation: "Sıfır doymuş sıvıdır; buhar eğrisinde kuruluk birdir.",
        },
      },
      {
        heading: "Kritik nokta",
        body:
          "**Kritik nokta** iki eğrinin birleştiği yerdir. Su için Tc = 374.14 °C ve Pc = 22.09 MPa değerleri bu noktayı belirler. " +
          "Tamamlanan hesap v = 1.337 m3/kg sonucunu verir.",
      },
    ],
    example: {
      prompt:
        "Bir karışımda v_f = 0.001 m3/kg, v_fg = 1.67 m3/kg ve x = 0.80 ise özgül hacim hangi bağıntıyla bulunur?",
      solution:
        "Özgül hacim v = v_f + x·v_fg bağıntısıyla bulunur çünkü kuruluk doymuş sıvı ile buhar hacmini tartar.",
    },
    commonMistake: {
      claim: "Kritik noktanın üzerinde sıvı ve buhar eğrileri ayrı durur.",
      correction: "Kritik noktada doymuş sıvı eğrisi ile doymuş buhar eğrisi birleşir.",
    },
    infoCheck: {
      prompt: "Kritik sıcaklık kaç derecedir?",
      answer: "374.14 °C",
    },
    summary: [
      "Bu sayfadaki formüller: Doymuş sıvı eğrisi | v = v_f + x*v_fg | u = u_f + x*u_fg | h = h_f + x*h_fg | v = 0.001 + 0.80×1.67 =",
      "P-v ve T-v Diyagramları konusunu anlayarak uygulayabilmek.",
    ],
    nextFocus: ["Uydurma konu"],
  };
}

describe("exam-prep lesson route", () => {
  beforeEach(() => {
    routeTopic = null;
    routePageText = null;
    pipelineMocks.create.mockReset();
    pipelineMocks.reserve.mockClear();
    pipelineMocks.commit.mockClear();
    pipelineMocks.refund.mockClear();
    pipelineMocks.usage.mockClear();
    pipelineMocks.guard.mockReset();
  });

  it("returns 200 after validation and charges once", async () => {
    const lesson = pressureLesson();
    const raw = JSON.stringify(lesson);
    const review = { approved: false, issues: case1AfterRepair };
    pipelineMocks.create
      .mockResolvedValueOnce(completion(raw))
      .mockResolvedValueOnce(completion(JSON.stringify(review)))
      .mockResolvedValueOnce(completion(JSON.stringify({ content: raw })))
      .mockResolvedValueOnce(completion(JSON.stringify(review)));
    const service = supabase();
    pipelineMocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "student-1", service } });

    const response = await POST(
      new Request("https://cortexplus.app/api/learning/exam-prep/node", {
        method: "POST",
        body: JSON.stringify({
          prepId: PREP,
          nodeId: NODE,
          clientRequestId: REQ,
          action: "start",
        }),
      }),
    );

    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.payload.lesson.example.prompt).not.toMatch(/özgül enerji|300 kJ/i);
    expect(body.payload.lesson.sections.length).toBeGreaterThanOrEqual(1);
    expect(pipelineMocks.reserve).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.commit).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.refund).not.toHaveBeenCalled();
  });

  it("returns 200 for a Turkish shape variant that states 1 K = 1 °C", async () => {
    const variant = {
      ders: {
        başlık: "Basınç ve Sıcaklık Kavramları",
        hedef: "Gösterge basıncından mutlak basıncı hesaplayabileceksin.",
        bölümler: {
          başlık: "Sıcaklık Kavramı ve Dönüşüm",
          metin:
            "Sıcaklık farkında **1 K = 1 °C** yazılır. Oda sıcaklığı **25 °C = 298.15 K** " +
            "olarak da okunur. Gösterge basıncına atmosfer eklenince mutlak basınç bulunur.",
          kontrol: {
            soru: "Bir kelvinlik değişim kaç santigrat derecedir?",
            seçenekler: ["1 °C", "273 °C", "1.8 °C"],
            cevap: "1 °C",
            açıklama: "273 eklemek mutlak dönüşümdür; aralıkta 1 K ile 1 °C aynıdır.",
          },
        },
      },
    };
    expect(lessonHasTeachingCore(variant)).toBe(true);
    expect(lessonPublishIssues(variant)).toEqual([]);
    const published = publishLessonDraft(variant);
    expect(published?.sections[0]?.body).toMatch(/1 K = 1 °C/);
    expect(JSON.stringify(published)).not.toMatch(/PV\s*=\s*nRT/);

    const raw = JSON.stringify(variant);
    const review = {
      approved: false,
      issues: [
        "Ders v2 şemasını karşılamıyor (hedef, bölümler, örnek, yaygın hata, bilgi kontrolü).",
        "Birim dönüşümü tutarsız: 1 K = 1 °C",
      ],
    };
    pipelineMocks.create
      .mockResolvedValueOnce(completion(raw))
      .mockResolvedValueOnce(completion(JSON.stringify(review)))
      .mockResolvedValueOnce(completion(JSON.stringify({ content: raw })))
      .mockResolvedValueOnce(completion(JSON.stringify(review)));
    const service = supabase();
    pipelineMocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "student-1", service } });

    const response = await POST(
      new Request("https://cortexplus.app/api/learning/exam-prep/node", {
        method: "POST",
        body: JSON.stringify({
          prepId: PREP,
          nodeId: NODE,
          clientRequestId: REQ,
          action: "start",
        }),
      }),
    );
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.payload.lesson.sections.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body.payload.lesson)).toMatch(/1 K = 1 °C/);
    expect(JSON.stringify(body.payload.lesson)).not.toMatch(/PV\s*=\s*nRT/);
    expect(pipelineMocks.commit).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.refund).not.toHaveBeenCalled();
  });

  it("publishes a P-v / T-v lesson when the diagram, summary and formula index are imperfect", async () => {
    routeTopic = PV_TOPIC;
    const lesson = pvDiagramLesson();
    const raw = JSON.stringify(lesson);
    const logs: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
    pipelineMocks.create.mockImplementation(async (args: { messages?: { content?: unknown }[] }) => {
      const system = String(args?.messages?.[0]?.content ?? "");
      if (system.includes("denetçisisin")) {
        return completion(JSON.stringify({ approved: true, issues: [] }));
      }
      if (system.includes("sorunları düzelt")) {
        return completion(JSON.stringify({ content: raw }));
      }
      return completion(raw);
    });
    const service = supabase();
    pipelineMocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "student-1", service } });

    const response = await POST(
      new Request("https://cortexplus.app/api/learning/exam-prep/node", {
        method: "POST",
        body: JSON.stringify({
          prepId: PREP,
          nodeId: NODE,
          clientRequestId: REQ,
          action: "start",
        }),
      }),
    );
    const body = await response.json();
    spy.mockRestore();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.ok).toBe(true);
    const published = body.payload.lesson as {
      sections: { heading: string; body: string; diagram?: unknown }[];
      summary?: string[];
    };
    expect(published.sections.length).toBeGreaterThanOrEqual(1);
    expect(published.sections.some((section) => /doymuş sıvı eğrisi/i.test(section.body))).toBe(true);
    expect(JSON.stringify(published)).toMatch(/v(?:_f|\s*f)/);
    expect(JSON.stringify(published)).not.toMatch(/Bu sayfadaki formüller/);
    expect(JSON.stringify(published)).not.toMatch(/anlayarak uygulayabilmek/);
    expect(JSON.stringify(published)).not.toMatch(/1\.337/);
    expect(published.summary?.some((line) => /[=+×]\s*$/.test(line))).toBeFalsy();
    expect(published.summary?.some((line) => line.includes("|"))).toBeFalsy();
    expect(pipelineMocks.reserve).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.commit).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.refund).not.toHaveBeenCalled();
    expect(logs.some((args) => args[0] === "lesson_generation_degraded")).toBe(true);
    const degraded = logs.find((args) => args[0] === "lesson_generation_degraded");
    expect(JSON.stringify(degraded?.[1])).toMatch(/diagram_missing/);
  });

  it("repairs a contradictory P-v lesson instead of publishing the broken parts", async () => {
    routeTopic = PV_TOPIC;
    routePageText = [
      "P-v ve T-v diyagramında doymuş sıvı eğrisi ile doymuş buhar eğrisi kritik noktada birleşir.",
      "İki faz bölgesinde doymuş sıvı ve doymuş buhar birlikte dengede bulunur; bu bölgeye ıslak buhar denir.",
      "Üçlü noktada katı, sıvı ve buhar fazları dengededir.",
      "Kalite x = m_buhar / m_toplam bağıntısıyla yazılır ve 0 ≤ x ≤ 1 aralığındadır.",
      "Bir kapta m_buhar = 2 kg ve m_toplam = 4 kg ise x = 2/4 = 0,5 olur.",
      "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlıdır.",
      "Sabit basınçta sıvı ısıtıldığında özgül hacim önce az değişir, kaynama sırasında ise büyük artış gösterir.",
      "Diyagramlar, tablo seçimini ve proses yönünü görselleştirir.",
    ].join(" ");
    const bad = {
      title: PV_TOPIC,
      objective: "İki faz bölgesinde kaliteyi diyagramdan okuyabileceksin.",
      overview: "P-v ve T-v diyagramında doymuş sıvı eğrisi ile doymuş buhar eğrisi kritik noktada birleşir.",
      sections: [
        {
          heading: "İki faz bölgesi",
          body:
            "Sıvı ve buhar birlikte dengede olamaz. Üçlü noktada katı, sıvı ve buhar fazları dengededir.",
          check: {
            type: "mcq",
            prompt: "T-v diyagramında bağımsız iki özellik değildir. Aşağıdakilerden hangisi doğrudur?",
            options: [
              "Basınç ve sıcaklık birbirine bağımlıdır.",
              "Basınç ve sıcaklık bağımsızdır.",
              "Sadece sıcaklık belirleyicidir.",
              "Özgül hacim her durumda sabittir.",
            ],
            answerIndex: 0,
            explanation: "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlıdır.",
          },
        },
        {
          heading: "Hesaplama ve Örnek",
          body:
            "Kalite, doymuş buharın toplam kütleye oranıdır. Veri: m_buhar = 2 kg Adım 1: Kalite hesaplama Adım 2: Sonucu hesapla Bu durumda kalite, doymuş buharın toplam kütleye oranıdır. Sonuç, iki faz arasında belirgin bir yön gösterir. Aralık 0 < x < 1.",
        },
      ],
      summary: [
        "Sabit basınçta sıvı ısıtıldığında özgül hacim önce az değişir, kaynama sırasında ise büyük artış gösterir.",
        "P-v ve T-v Diyagramlarını kullanarak faz durumu ve özellikle iki faz bölgesinde kalite hesaplamalarını gerçekleştirme.",
        "P-v, T-v Diyagramları - Kritik ve Üçlü Nokta",
        "Diyagramlar, tablo seçimini ve proses yönünü görselleştirir.",
        "iki faz bölgesi",
      ],
    };
    const patch = {
      sections: [
        {
          index: 0,
          body: "İki faz bölgesinde doymuş sıvı ve doymuş buhar birlikte dengede bulunur. Bu bölgeye ıslak buhar denir. Üçlü noktada katı, sıvı ve buhar fazları dengededir.",
          check: {
            type: "mcq",
            prompt: "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlı mıdır?",
            options: [
              "Basınç ve sıcaklık birbirine bağımlıdır.",
              "Basınç ve sıcaklık bağımsızdır.",
              "Yalnızca sıcaklık belirleyicidir.",
            ],
            answerIndex: 0,
            explanation: "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlıdır.",
          },
        },
        {
          index: 1,
          body: "Kalite, doymuş buharın toplam kütleye oranıdır ve x = m_buhar / m_toplam bağıntısıyla yazılır. Aralık 0 ≤ x ≤ 1 olarak okunur.",
          check: {
            type: "trueFalse",
            prompt: "Doymuş sıvı ile doymuş buhar iki faz bölgesinde birlikte dengede bulunur.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 0,
            explanation: "Islak buhar bölgesinde doymuş sıvı ve doymuş buhar birlikte dengede bulunur.",
          },
        },
      ],
      addedSections: [
        {
          heading: "Üçlü nokta",
          body: "Üçlü noktada katı, sıvı ve buhar fazları dengededir. P-v ve T-v diyagramında bu nokta üç fazın bir arada durduğu yerdir.",
          check: {
            type: "mcq",
            prompt: "Üçlü noktada katı, sıvı ve buhar bir arada dengede midir?",
            options: ["Yalnızca sıvı dengededir.", "Üç faz bir arada dengededir.", "Buhar hiç bulunmaz."],
            answerIndex: 1,
            explanation: "Üçlü noktada katı, sıvı ve buhar fazları dengededir.",
          },
        },
      ],
      example: {
        prompt: "Bir kapta doymuş buhar kütlesi 2 kg ve toplam kütle 4 kg ise kalite kaçtır?",
        solution: "Veri: m_buhar = 2 kg ve m_toplam = 4 kg. Adım 1: x = m_buhar / m_toplam = 2/4 yazılır. Adım 2: x = 0,5 olur.",
      },
      summary: [
        "İki faz bölgesinde doymuş sıvı ve doymuş buhar birlikte dengede bulunur.",
        "Kalite, doymuş buhar kütlesinin toplam kütleye oranıdır ve 0 ≤ x ≤ 1 aralığındadır.",
        "Üçlü noktada katı, sıvı ve buhar fazları dengededir.",
        "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlıdır.",
      ],
      diagram: {
        caption: "P-v diyagramındaki eğriler",
        shapes: [
          { kind: "line", x1: 40, y1: 160, x2: 150, y2: 40 },
          { kind: "line", x1: 150, y1: 40, x2: 280, y2: 160 },
          { kind: "text", x: 70, y: 120, text: "Sıvı eğrisi" },
          { kind: "text", x: 190, y: 120, text: "Buhar eğrisi" },
        ],
      },
    };
    const raw = JSON.stringify(bad);
    const logs: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
    pipelineMocks.create.mockImplementation(async (args: { messages?: { content?: unknown }[] }) => {
      const messages = args?.messages ?? [];
      const blob = messages.map((message) => String(message.content ?? "")).join("\n");
      if (blob.includes("Yalnızca bozuk parçaları")) return completion(JSON.stringify(patch));
      const system = String(messages[0]?.content ?? "");
      if (system.includes("denetçisisin")) return completion(JSON.stringify({ approved: true, issues: [] }));
      if (system.includes("sorunları düzelt")) return completion(JSON.stringify({ content: raw }));
      return completion(raw);
    });
    const service = supabase();
    pipelineMocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "student-1", service } });

    const response = await POST(
      new Request("https://cortexplus.app/api/learning/exam-prep/node", {
        method: "POST",
        body: JSON.stringify({
          prepId: PREP,
          nodeId: NODE,
          clientRequestId: REQ,
          action: "start",
        }),
      }),
    );
    const body = await response.json();
    spy.mockRestore();

    expect(response.status, JSON.stringify(body)).toBe(200);
    const published = JSON.stringify(body.payload.lesson);
    expect(published).not.toMatch(/olamaz/i);
    expect(published).not.toMatch(/Sonucu hesapla/);
    expect(published).not.toMatch(/belirgin bir yön/);
    expect(published).not.toMatch(/gerçekleştirme/);
    expect(published).not.toMatch(/0\s*<\s*x\s*<\s*1/);
    const lesson = body.payload.lesson as {
      sections: { check?: { prompt: string; options: string[] }; diagram?: { caption: string } }[];
      summary?: string[];
      example?: { prompt: string; solution: string };
    };
    const checks = lesson.sections.map((section) => section.check).filter(Boolean);
    expect(checks.length).toBeGreaterThanOrEqual(3);
    for (const check of checks) {
      expect(check?.prompt.length).toBeGreaterThanOrEqual(12);
      expect(check?.prompt).toMatch(/\?|dır|dir|değildir|bulunur|midir/i);
    }
    expect(lesson.example?.solution).toMatch(/2\s*\/\s*4/);
    expect(lesson.example?.solution).toMatch(/0,5|0\.5/);
    expect(lesson.summary?.length).toBeGreaterThanOrEqual(3);
    expect(lesson.summary?.length).toBeLessThanOrEqual(5);
    expect(lesson.summary?.some((line) => line.trim().toLocaleLowerCase("tr") === "iki faz bölgesi")).toBe(false);
    expect(lesson.summary?.some((line) => /\s[-–—]\s/.test(line) && !/[.?!]/.test(line))).toBe(false);
    expect(lesson.sections.some((section) => section.diagram?.caption)).toBe(true);
    expect(pipelineMocks.reserve).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.commit).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.refund).not.toHaveBeenCalled();
    const repaired = logs.find((args) => args[0] === "lesson_generation_repaired");
    const report = repaired?.[1] as { checks?: string[]; succeeded?: string[] };
    expect(report?.checks).toEqual(
      expect.arrayContaining(["source_contradiction", "stem_grammar", "check_count", "example_incomplete", "vacuous", "diagram_missing"]),
    );
    expect(report?.succeeded).toEqual(
      expect.arrayContaining(["source_contradiction", "stem_grammar", "check_count", "example_incomplete", "vacuous", "diagram_missing"]),
    );
  });

  it("publishes the ideal-gas lesson with three checks, a clean summary and no unfinished example", async () => {
    const topic = "İdeal Gazlarda Enerji Değişimi";
    routeTopic = topic;
    const teacherOnly = "Akış işi entalpiyi açık sistemde doğal biçimde ortaya çıkarır.";
    const incomplete =
      "Örnek: 1 kg hava, 300 K’den 400 K’ye ısıtıldığında, W hesaplanarak ve Q = ΔU + W denklemi ile toplam ısı miktarı bulunur.";
    const body = [
      "İdeal gazda sabit hacimde iç enerji değişimi ΔU = m c_v ΔT bağıntısıyla hesaplanır.",
      "Sabit basınçta entalpi değişimi ΔH = m c_p ΔT bağıntısıyla hesaplanır.",
      "Özgül entalpi h = u + Pv bağıntısıyla yazılır.",
      "Sınır işi W = P(V₂ − V₁) bağıntısıyla bulunur.",
      "Birinci yasa Q = ΔU + W şeklinde yazılır.",
    ].join(" ");
    routePageText = [
      `${topic} konusunda ideal gazın enerjisi anlatılır.`,
      body,
      "Özgül ısılar arasındaki fark c_p − c_v = R bağıntısına eşittir ve k = c_p / c_v olarak yazılır.",
      "c_v = 0.718 kJ/kg·K.",
      "2 kg hava 300 K sıcaklıktan 450 K sıcaklığa ısıtılır ve ΔU = 215.4 kJ olur.",
      "400 K için de aynı sabit kullanılır.",
      teacherOnly,
      "İdeal gazlar, sıcaklık ve basınç gibi parametrelerle belirlenen sistemlerdir.",
      "Kapalı sistem: İdeal gaz enerji: Δu=c v ΔT, Δh=c p ΔT",
      "İç Enerji, Entalpi ve Özgül Isılar",
      "u ve h değişimlerini sıcaklıkla bağlayan temel malzeme bağıntılarını öğren: H = U + PV, özgül olarak h = u + Pv",
      "Entalpi özellikle akışlı sistemlerde doğal biçimde ortaya çıkar çünkü",
    ].join("\n");
    const bad = {
      title: topic,
      overview: "İdeal gazda sabit hacimde iç enerji değişimi ΔU = m c_v ΔT bağıntısıyla hesaplanır.",
      sections: [
        {
          heading: "İç enerji",
          body: `${body} ${incomplete}`,
          check: {
            type: "mcq",
            prompt: "İdeal gazda iç enerji değişimi ΔU nasıl hesaplanır?",
            options: ["ΔU = m c_v ΔT", "ΔU = m c_p ΔT", "ΔU = mRT", "ΔU = PV"],
            answerIndex: 0,
            explanation: "Sabit hacimde iç enerji değişimi ΔU = m c_v ΔT bağıntısıyla hesaplanır.",
          },
        },
      ],
      example: {
        prompt: "2 kg hava 300 K sıcaklıktan 450 K sıcaklığa sabit hacimde ısıtılıyor. İç enerji değişimi nedir?",
        solution: "ΔU = 2 × 0.718 × (450 − 300) = 215.4 kJ",
      },
      commonMistake: {
        claim: "İç enerji hem sıcaklığa hem hacme her zaman bağlıdır.",
        correction: "İdeal gazda iç enerji değişimi sıcaklığa bağlıdır ve ΔU = m c_v ΔT bağıntısıyla yazılır.",
      },
      summary: [
        "İdeal gazlar, sıcaklık ve basınç gibi parametrelerle belirlenen sistemlerdir.",
        "Kapalı sistem: İdeal gaz enerji: Δu=c v ΔT, Δh=c p ΔT",
        "İç Enerji, Entalpi ve Özgül Isılar",
        "u ve h değişimlerini sıcaklıkla bağlayan temel malzeme bağıntılarını öğren: H = U + PV, özgül olarak h = u + Pv",
        "Entalpi özellikle akışlı sistemlerde doğal biçimde ortaya çıkar çünkü",
      ],
    };
    const raw = JSON.stringify(bad);
    pipelineMocks.create.mockImplementation(async (args: { model?: string; messages?: { content?: unknown }[] }) => {
      const messages = args?.messages ?? [];
      const blob = messages.map((message) => String(message.content ?? "")).join("\n");
      if (blob.includes("İddiaları kaynağa karşı denetle")) return completion(JSON.stringify({ bad: [] }));
      if (blob.includes("Yalnızca bozuk parçaları")) return completion(JSON.stringify({}));
      const system = String(messages[0]?.content ?? "");
      if (system.includes("denetçisisin")) return completion(JSON.stringify({ approved: true, issues: [] }));
      if (system.includes("sorunları düzelt")) return completion(JSON.stringify({ content: raw }));
      return completion(raw);
    });
    const service = supabase();
    pipelineMocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "student-1", service } });

    const response = await POST(
      new Request("https://cortexplus.app/api/learning/exam-prep/node", {
        method: "POST",
        body: JSON.stringify({
          prepId: PREP,
          nodeId: NODE,
          clientRequestId: REQ,
          action: "start",
        }),
      }),
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    const lesson = payload.payload.lesson as {
      sections: { check?: { prompt: string } }[];
      summary?: string[];
      example?: { solution: string };
      commonMistake?: { correction: string };
    };
    expect(lesson.sections.filter((section) => section.check).length).toBeGreaterThanOrEqual(3);
    const published = JSON.stringify(lesson);
    expect(published).not.toContain("belirlenen sistemlerdir");
    expect(published).not.toContain("Kapalı sistem: İdeal gaz enerji:");
    expect(published).not.toContain("İç Enerji, Entalpi ve Özgül Isılar");
    expect(published).not.toMatch(/\böğren\b/i);
    expect(published).not.toContain("ortaya çıkar çünkü");
    expect(published).not.toContain(teacherOnly);
    expect(published).not.toContain("1 kg hava");
    expect(published).not.toContain("hesaplanarak");
    expect(published).toMatch(/2\s*[×x]\s*0[.,]718/);
    expect(published).toContain("215.4");
    expect(published).toMatch(/c_v = 0[.,]718 kJ\/kg·K/);
    expect(published).toMatch(/c_p\s*[−-]\s*c_v\s*=\s*R/);
    expect(lesson.summary?.length).toBeGreaterThanOrEqual(3);
    expect(lesson.commonMistake?.correction).toMatch(/c_v/);
    expect(pipelineMocks.reserve).toHaveBeenCalledTimes(1);
    const reserveArgs = pipelineMocks.reserve.mock.calls[0] as unknown[] | undefined;
    expect(reserveArgs?.[2]).toBe("STUDY_PLAN_GENERATE");
    expect(pipelineMocks.commit).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.refund).not.toHaveBeenCalled();
    const draftCall = pipelineMocks.create.mock.calls.find((call) => {
      const blob = JSON.stringify(call[0]?.messages ?? []);
      return blob.includes("Bu konunun dersini yaz");
    });
    expect(draftCall?.[0]?.model).toBe("gpt-4.1-mini");
    const repairCalls = pipelineMocks.create.mock.calls.filter((call) => {
      const blob = JSON.stringify(call[0]?.messages ?? []);
      return blob.includes("İddiaları kaynağa karşı denetle") || blob.includes("Yalnızca bozuk parçaları");
    });
    expect(repairCalls.length).toBeGreaterThanOrEqual(1);
    expect(repairCalls.every((call) => call[0]?.model === "std")).toBe(true);
  });

  it("publishes the first-law lesson without the sign chain, empty formula, or copied retry", async () => {
    const topic = "Birinci Yasa: Kapalı Sistem Enerji Dengesi";
    routeTopic = topic;
    const sign =
      "ΔE = Q - W formülüne göre, Q pozitif ve W negatif ise ΔE = Q - (-W) = Q + W şeklinde artar.";
    const yesNo = "Isı ve iş sınırdan geçen enerji türleri midir?";
    const leaked = "Kinetik ve potansiyel enerji ihmal edilirse ΔE = ΔU olduğundan ifade doğrudur.";
    const bareResult = "Sonuç = ΔE = 20 - 5 = 15 kJ.";
    const proseExample = "Sistem 80 kJ ısı alıyor ve 30 kJ iş yapıyor, bu yüzden iç enerji 50 kJ artmıştır.";
    const law = "Kapalı sistemde enerji değişimi ΔE = Q - W ve iç enerji ΔU = Q − W ile yazılır.";
    routePageText = [
      `${topic} kapalı sistemde ısı ve iş ile kurulur.`,
      law,
      "Kinetik ve potansiyel enerji ihmal edilirse ΔE = ΔU olur.",
      "Isı ve iş sınırdan geçen enerji türleridir.",
      "W sistem üzerinde yapılıyorsa negatiftir ve enerji artar.",
      "Bir sistem 80 kJ ısı alır ve 30 kJ iş yaparsa iç enerji 50 kJ artar.",
      "Başka bir durumda 20 kJ ısı ve 5 kJ iş için değişim 15 kJ olur.",
      "kJ birimi enerjiyi ölçer.",
    ].join(" ");
    const yesCheck = (prompt: string) => ({
      type: "trueFalse" as const,
      prompt,
      options: ["Doğru", "Yanlış"],
      answerIndex: 0,
      explanation: "Isı ve iş sınırdan geçen enerji türleridir.",
    });
    const bad = {
      title: topic,
      overview: `${topic} kapalı sistemde ısı ve iş dengesini anlatır. ${law}`,
      sections: [
        {
          heading: "Enerji dengesi",
          body: `${law} ${sign} Kapalı sistem enerji dengesi şöyle yazılır: ΔE =`,
          check: yesCheck(yesNo),
        },
        {
          heading: "Sınırdan geçen enerji",
          body: "Isı ve iş sınırdan geçen enerji türleridir. Kapalı sistemde kütle geçmez, enerji geçer.",
          check: yesCheck("Kapalı sistemde kütle geçer mi?"),
        },
        {
          heading: "Sayısal denge",
          body: `${proseExample} ${bareResult}`,
          check: yesCheck("Enerji dengesi ısı ve iş ile yazılır mı?"),
        },
      ],
      example: {
        prompt: proseExample,
        solution: bareResult,
      },
      commonMistake: {
        claim: "Isı alınınca iç enerji hiç değişmez.",
        correction: "Kapalı sistemde ısı alınca iç enerji ΔU = Q − W bağıntısına göre değişir.",
      },
      summary: [
        leaked,
        "Kapalı sistemde kütle geçmez.",
        "Isı ve iş sınırdan geçen enerji türleridir.",
      ],
    };
    const raw = JSON.stringify(bad);
    pipelineMocks.create.mockImplementation(async (args: { messages?: { content?: unknown }[] }) => {
      const messages = args?.messages ?? [];
      const blob = messages.map((message) => String(message.content ?? "")).join("\n");
      if (blob.includes("İddiaları kaynağa karşı denetle")) return completion(JSON.stringify({ bad: [] }));
      if (blob.includes("Yalnızca bozuk parçaları")) return completion(JSON.stringify({}));
      const system = String(messages[0]?.content ?? "");
      if (system.includes("denetçisisin")) return completion(JSON.stringify({ approved: true, issues: [] }));
      if (system.includes("sorunları düzelt")) return completion(JSON.stringify({ content: raw }));
      return completion(raw);
    });
    const service = supabase();
    pipelineMocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "student-1", service } });

    const response = await POST(
      new Request("https://cortexplus.app/api/learning/exam-prep/node", {
        method: "POST",
        body: JSON.stringify({
          prepId: PREP,
          nodeId: NODE,
          clientRequestId: REQ,
          action: "start",
        }),
      }),
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    const lesson = payload.payload.lesson as {
      sections: { check?: { type?: string; prompt: string; options: string[]; answerIndex: number; explanation: string } }[];
      summary?: string[];
      example?: { solution: string };
    };
    const published = JSON.stringify(lesson);
    expect(published).not.toContain("(-W)");
    expect(published).not.toContain("Q + W şeklinde");
    expect(published).toContain("|W|");
    expect(published).not.toMatch(/ΔE\s*=(?!\s*\S)/);
    expect(lesson.summary?.join(" ") ?? "").not.toMatch(/ifade doğrudur|doğru cevap|seçenek/i);
    expect(published).not.toContain(bareResult);
    expect(published).not.toContain("80 kJ ısı alıyor ve 30 kJ iş yapıyor");
    expect(published).toMatch(/ΔU = Q − W = 80 kJ − 30 kJ = 50 kJ/);
    expect(published).toMatch(/ΔE = Q − W = 20 kJ − 5 kJ = 15 kJ/);
    const checks = lesson.sections.map((section) => section.check).filter((check) => check);
    expect(checks.length).toBeGreaterThanOrEqual(3);
    const binary = checks.filter(
      (check) =>
        check?.type === "trueFalse" ||
        (check?.options.length === 2 &&
          check.options.some((option) => option.toLocaleLowerCase("tr") === "doğru")),
    );
    expect(binary.length).toBeLessThanOrEqual(1);
    const retry = reviewQuestionFor(
      {
        type: "trueFalse",
        prompt: yesNo,
        options: ["Doğru", "Yanlış"],
        answerIndex: 0,
        explanation: "Isı ve iş sınırdan geçen enerji türleridir.",
      },
      "tr",
      routePageText,
    );
    expect(retry.prompt).not.toBe(yesNo);
    expect(retry.prompt).not.toContain("başka sözcüklerle");
    expect(retry.options[retry.answerIndex]).toBe("Doğru");
    for (const check of checks) {
      if (!check) continue;
      const again = reviewQuestionFor(
        {
          type: check.type === "trueFalse" ? "trueFalse" : "mcq",
          prompt: check.prompt,
          options: check.options,
          answerIndex: check.answerIndex,
          explanation: check.explanation,
        },
        "tr",
        routePageText,
      );
      expect(again.prompt).not.toBe(check.prompt);
    }
    expect(pipelineMocks.reserve).toHaveBeenCalledTimes(1);
    const reserveArgs = pipelineMocks.reserve.mock.calls[0] as unknown[] | undefined;
    expect(reserveArgs?.[2]).toBe("STUDY_PLAN_GENERATE");
    expect(pipelineMocks.commit).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.refund).not.toHaveBeenCalled();
  });

  it("publishes boundary work for the clicked topic and does not spend a second draft", async () => {
    const topic = "Sınır İşi ve Prosesler";
    routeTopic = topic;
    const gap = "Toplam iş ise ile bulunur:";
    const integral = "W = ∫ 1 2 P dV";
    const pressureFormula = "W = P(V₂ − V₁)";
    const leak =
      "∫ P dV genel sınır işi tanımı, diğerleri yanlış veya özel durumları belirtir.";
    const vague = "Düşük sapma (Z=1.03) ideal gaz varsayımını bozmaz.";
    const volumeMix = "Pv = ZRT bağıntısında hacim V kullanılır.";
    routePageText = [
      "Sınır işi, hareketli sınırı olan sistemlerde basınç-hacim eğrisinin altında kalan alan olarak tanımlanır.",
      "Sınır işi bir prosesin yoluna bağlıdır ve aynı hali sağlayan farklı yollarda farklı iş yapılır.",
      "Sabit basınçta sınır işi W = P(V₂ − V₁) eşitliğiyle yazılır.",
      "Rijit tankta hacim sabittir, dV = 0 olduğundan sınır işi sıfırdır.",
      "P = 100 kPa. V₁ = 0.2 m³. V₂ = 0.5 m³. Bu sabit basınç örneğinde sınır işi 30 kJ olur.",
      "kJ birimi işi ölçer.",
    ].join(" ");
    const pathCheck = {
      type: "mcq" as const,
      prompt: "Aynı hali sağlayan farklı yollarda sınır işi aynı mıdır?",
      options: [
        "Hayır, iş yola bağlıdır ve yollar farklı iş üretir.",
        "Evet, iş yalnızca ilk ve son hale bağlıdır.",
        "Evet, rijit tank dışında iş her yolda sıfırdır.",
        "Hayır, iş yalnız sıcaklık farkıyla belirlenir.",
      ],
      answerIndex: 0,
      explanation: "Sınır işi yola bağlıdır ve farklı yollarda farklı iş yapılır.",
    };
    const rigidCheck = {
      type: "mcq" as const,
      prompt: "Rijit bir tankta sınır işi neden sıfırdır?",
      options: [
        "Hacim sabit olduğu için dV sıfırdır.",
        "Basınç sıfır olduğu için iş sıfırdır.",
        "Sıcaklık sabit olduğu için iş sıfırdır.",
        "Kütle değiştiği için iş sıfırdır.",
      ],
      answerIndex: 0,
      explanation: "Rijit tankta hacim sabittir ve dV = 0 olduğundan sınır işi sıfırdır.",
    };
    const bad = {
      title: "Gerçek Gazlar ve Sıkıştırılabilirlik Faktörü",
      objective: "Sınır işini proses yoluna göre hesaplayabileceksin.",
      overview:
        "Sınır işi, hareketli sınırı olan sistemlerde basınç-hacim eğrisinin altında kalan alan olarak tanımlanır.",
      sections: [
        {
          heading: "Sınır işi",
          body: `Sınır işi, hareketli sınırda tanımlanır. ${gap} ${integral} Sabit basınçta ${pressureFormula} eşitliği geçerlidir. Sınır işi bir prosesin yoluna bağlıdır.`,
          check: pathCheck,
        },
        {
          heading: "Rijit tank",
          body: "Rijit tankta hacim sabittir ve dV = 0 olduğundan sınır işi sıfırdır. Sınır işi bu proses için yapılmaz.",
          check: rigidCheck,
        },
        {
          heading: "Gerçek gazlar",
          body: `Pv = ZRT bağıntısı gerçek gazlar için yazılır. P r = P/P cr ve T r = T/T cr. ${volumeMix} ${vague}`,
          check: {
            type: "mcq" as const,
            prompt: "Pv hangi bağıntıyla hesaplanır?",
            options: ["Pv = ZRT bağıntısı", "r = P/P cr", "r = T/T cr", "W = P(V₂ − V₁)"],
            answerIndex: 0,
            explanation: volumeMix,
          },
        },
        {
          heading: "İndirgenmiş basınç",
          body: "r hangi bağıntıyla hesaplanır sorusu P r ve T r simgelerinden artakalan bir köktür.",
          check: {
            type: "mcq" as const,
            prompt: "r hangi bağıntıyla hesaplanır?",
            options: ["r = P/P cr", "r = T/T cr", "r = V/V cr", "r = ZRT"],
            answerIndex: 0,
            explanation: "P r = P/P cr ve T r = T/T cr aynı harfe indirgenmiş gibi durur.",
          },
        },
      ],
      commonMistake: {
        claim: "Rijit tankta sınır işi hacim değişimine eşittir.",
        correction: "Rijit tankta hacim sabittir ve dV = 0 olduğundan sınır işi sıfırdır.",
      },
      summary: [
        leak,
        "Sınır işi, hareketli sınırda basınç-hacim eğrisinin altında kalan alandır.",
        "Rijit tankta hacim sabit olduğu için sınır işi sıfırdır.",
        "Sabit basınçta sınır işi W = P(V₂ − V₁) eşitliğiyle yazılır.",
      ],
    };
    const raw = JSON.stringify(bad);
    const logs: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
    pipelineMocks.create.mockImplementation(async (args: { model?: string; messages?: { content?: unknown }[] }) => {
      const messages = args?.messages ?? [];
      const blob = messages.map((message) => String(message.content ?? "")).join("\n");
      if (blob.includes("İddiaları kaynağa karşı denetle")) return completion(JSON.stringify({ bad: [] }));
      if (blob.includes("Yalnızca bozuk parçaları")) return completion(JSON.stringify({}));
      const system = String(messages[0]?.content ?? "");
      if (system.includes("denetçisisin")) return completion(JSON.stringify({ approved: true, issues: [] }));
      if (system.includes("sorunları düzelt")) return completion(JSON.stringify({ content: raw }));
      return completion(raw);
    });
    const service = supabase();
    pipelineMocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "student-1", service } });

    const response = await POST(
      new Request("https://cortexplus.app/api/learning/exam-prep/node", {
        method: "POST",
        body: JSON.stringify({
          prepId: PREP,
          nodeId: NODE,
          clientRequestId: REQ,
          action: "start",
        }),
      }),
    );
    spy.mockRestore();
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    const lesson = payload.payload.lesson as {
      title: string;
      sections: { check?: { type?: string; prompt: string; options: string[] } }[];
      summary?: string[];
      example?: { prompt: string; solution: string };
      commonMistake?: { correction: string };
    };
    const published = JSON.stringify(lesson);
    expect(lesson.title).toBe(topic);
    expect(published).not.toMatch(/Gerçek Gazlar|Sıkıştırılabilirlik|ZRT|Z\s*=\s*1[.,]03/i);
    expect(published).not.toMatch(/hangi bağıntıyla hesaplanır/i);
    expect(published).not.toContain(gap);
    expect(published).not.toMatch(/ise ile bulunur/);
    expect(published).toMatch(/∫₁²/);
    expect(published).not.toMatch(/∫\s+1\s+2/);
    expect(lesson.summary?.join(" ") ?? "").not.toMatch(/diğerleri|diğer seçenek|yanlış|doğru cevap|seçenek|ifade doğrudur/i);
    expect(lesson.commonMistake?.correction).toMatch(/dV\s*=\s*0/);
    expect(lesson.example?.solution).toMatch(/W\s*=\s*P\(V₂\s*−\s*V₁\)/);
    expect(lesson.example?.solution).toMatch(/100 kPa/);
    expect(lesson.example?.solution).toMatch(/30 kJ/);
    const checks = lesson.sections.map((section) => section.check).filter((check) => check);
    expect(checks.length).toBeGreaterThanOrEqual(3);
    for (const check of checks) {
      expect(check?.type === "trueFalse" ? "trueFalse" : "mcq").toBe("mcq");
      expect(check?.options.length).toBe(4);
    }
    expect(pipelineMocks.reserve).toHaveBeenCalledTimes(1);
    const reserveArgs = pipelineMocks.reserve.mock.calls[0] as unknown[] | undefined;
    expect(reserveArgs?.[2]).toBe("STUDY_PLAN_GENERATE");
    expect(pipelineMocks.commit).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.refund).not.toHaveBeenCalled();
    const draftCalls = pipelineMocks.create.mock.calls.filter((call) => {
      const blob = JSON.stringify(call[0]?.messages ?? []);
      return call[0]?.model === "gpt-4.1-mini" && blob.includes("Bu konunun dersini yaz");
    });
    expect(draftCalls.length).toBe(1);
    expect(draftCalls[0]?.[0]?.model).toBe("gpt-4.1-mini");
    const callLog = logs.find((args) => args[0] === "lesson_model_calls");
    const calls = (callLog?.[1] as { calls?: number } | undefined)?.calls ?? 99;
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(calls).toBeLessThanOrEqual(4);
  });

  it("publishes the heat-and-work lesson with a clean retry, a real formula question, and one draft", async () => {
    const topic = "Isı ve İş Etkileşimleri";
    routeTopic = topic;
    const modelTitle = "Enerji Transferi: Isı ve İşin Tanımı ile İşaret Kuralı";
    const numericPrompt = "Bir sistem 10 kJ ısı kaybedip 4 kJ iş girdisi alırsa net enerji değişimi ____ olur.";
    const explanation =
      "Net enerji değişimi ΔE = Q - W ile hesaplanır. Q = -10 kJ (ısı kaybı), W = -4 kJ (iş girişi), ΔE = -10 - (-4) = -6 kJ olur. Diğer seçenekler işaret kuralı hatasıdır.";
    const vague = "Bu formüller, işlem türüne uygun iş hesabı yapmayı sağlar Bu ifade doğru mudur?";
    const cut = "Bu formüller, işlem türüne";
    const bare = "W=1×0.287×300×ln2 ≈ 59.7 kJ";
    const formula = "İzotermal ideal gaz işi W = mRT ln(V₂/V₁) eşitliğiyle yazılır.";
    routePageText = [
      "Isı ve iş etkileşimleri sınırdan geçen enerji türleridir.",
      "Isı ve iş etkileşimleri sistemin enerjisini değiştirir.",
      "Bir sistem 10 kJ ısı kaybedip 4 kJ iş girdisi alırsa değişim 6 kJ olur.",
      formula,
      "R = 0.287 kJ/kg·K ve sıcaklık 300 K iken iş yaklaşık 59.7 kJ olur.",
      "kJ birimi enerjiyi ölçer. kJ/kg özgül enerji birimidir.",
      "İzokorik süreçte sınır işi sıfırdır. Elektrik veya karıştırıcı işi olabilir.",
    ].join(" ");
    const bad = {
      title: modelTitle,
      objective: "Isı ve iş işaretini kullanarak enerji değişimini hesaplayabileceksin.",
      overview: "Isı ve iş, sınırdan geçen enerji türleridir ve sistemin enerjisini değiştirir.",
      sections: [
        {
          heading: modelTitle,
          body: "Isı, sıcaklık farkından dolayı sınırdan geçen enerjidir. İş, sınırdaki kuvvetin enerji aktarımıdır. Sisteme giren ısı pozitif, sistemden çıkan ısı negatiftir.",
          check: {
            type: "mcq" as const,
            prompt: numericPrompt,
            options: ["-6 kJ", "14 kJ", "-14 kJ", "6 kJ"],
            answerIndex: 0,
            explanation,
          },
        },
        {
          heading: cut,
          body: `Bu formüller, işlem türüne uygun iş hesabı yapmayı sağlar. ${formula}`,
          check: {
            type: "trueFalse" as const,
            prompt: vague,
            options: ["Doğru", "Yanlış"],
            answerIndex: 0,
            explanation: "Bu formüller, işlem türüne uygun iş hesabı yapmayı sağlar.",
          },
        },
        {
          heading: "İzokorik süreç",
          body: "İzokorik süreçte hacim sabittir ve sınır işi sıfırdır. Elektrik veya karıştırıcı işi bu süreçte de olabilir.",
          check: {
            type: "mcq" as const,
            prompt: "İzokorik bir süreçte sınır işi için hangisi doğrudur?",
            options: [
              "Hacim sabit olduğu için sınır işi sıfırdır.",
              "Sınır işi sıcaklık farkına eşittir.",
              "Sınır işi her zaman elektrik işine eşittir.",
              "Sınır işi kütleyle doğru orantılıdır.",
            ],
            answerIndex: 0,
            explanation: "İzokorik süreçte sınır işi sıfırdır; elektrik veya karıştırıcı işi olabilir.",
          },
        },
      ],
      example: {
        prompt: "1 kg ideal gaz 300 K sıcaklıkta izotermal olarak hacmi iki katına çıkıyor.",
        solution: bare,
      },
      commonMistake: {
        claim: "İzokorik süreçte hiçbir enerji geçişi olmaz.",
        correction: "İzokorik süreçte sınır işi sıfırdır; elektrik veya karıştırıcı işi olabilir.",
      },
      summary: [
        "Isı ve iş sınırdan geçen enerji türleridir.",
        "İzokorik süreçte sınır işi sıfırdır.",
        formula,
      ],
    };
    const raw = JSON.stringify(bad);
    const logs: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
    pipelineMocks.create.mockImplementation(async (args: { model?: string; messages?: { content?: unknown }[] }) => {
      const messages = args?.messages ?? [];
      const blob = messages.map((message) => String(message.content ?? "")).join("\n");
      if (blob.includes("İddiaları kaynağa karşı denetle")) return completion(JSON.stringify({ bad: [] }));
      if (blob.includes("Yalnızca bozuk parçaları")) return completion(JSON.stringify({}));
      const system = String(messages[0]?.content ?? "");
      if (system.includes("denetçisisin")) return completion(JSON.stringify({ approved: true, issues: [] }));
      if (system.includes("sorunları düzelt")) return completion(JSON.stringify({ content: raw }));
      return completion(raw);
    });
    const service = supabase();
    pipelineMocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "student-1", service } });

    const response = await POST(
      new Request("https://cortexplus.app/api/learning/exam-prep/node", {
        method: "POST",
        body: JSON.stringify({
          prepId: PREP,
          nodeId: NODE,
          clientRequestId: REQ,
          action: "start",
        }),
      }),
    );
    spy.mockRestore();
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    const lesson = payload.payload.lesson as {
      title: string;
      sections: {
        heading: string;
        check?: { type?: string; prompt: string; options: string[]; answerIndex: number; explanation: string };
      }[];
      summary?: string[];
      example?: { prompt: string; solution: string };
      commonMistake?: { correction: string };
    };
    const published = JSON.stringify(lesson);
    expect(lesson.title).toBe(topic);
    expect(lesson.sections.map((section) => section.heading)).not.toContain(cut);
    expect(published).not.toContain(modelTitle);
    expect(published).not.toContain("Bu ifade doğru mudur");
    expect(published).not.toMatch(/hangi bağıntıyla/i);
    expect(lesson.example?.solution).toMatch(/W = mRT ln\(V₂\/V₁\)/);
    expect(lesson.example?.solution).toContain("(1 kg)(0.287 kJ/kg·K)(300 K)");
    expect(lesson.example?.solution).toContain("≈ 59.7 kJ");
    expect(lesson.example?.prompt).toContain("R = 0.287 kJ/kg·K");
    expect(lesson.example?.solution).not.toContain(bare);
    expect(lesson.commonMistake?.correction).toMatch(/sınır işi sıfır/);
    expect(lesson.commonMistake?.correction).toMatch(/karıştırıcı/);
    expect(lesson.summary?.join(" ") ?? "").not.toMatch(/diğer seçenek|ifade doğrudur/i);
    const checks = lesson.sections.map((section) => section.check).filter((check) => check);
    expect(checks.length).toBeGreaterThanOrEqual(3);
    for (const check of checks) {
      expect(check?.options.length).toBe(4);
      expect(check?.type === "trueFalse" ? "trueFalse" : "mcq").toBe("mcq");
    }
    const numeric = checks.find((check) => check?.prompt === numericPrompt);
    expect(numeric?.options[numeric.answerIndex]).toBe("-6 kJ");
    const isothermal = checks.find((check) => /ideal gaz işi hangi eşitlik/i.test(check?.prompt ?? ""));
    expect(isothermal?.options[isothermal.answerIndex ?? 0]).toMatch(/mRT ln\(V₂\/V₁\)/);
    const retry = reviewQuestionFor(
      {
        type: "mcq",
        prompt: numericPrompt,
        options: ["-6 kJ", "14 kJ", "-14 kJ", "6 kJ"],
        answerIndex: 0,
        explanation,
      },
      "tr",
    );
    expect(retry.prompt).toBe(
      "Bir sistem 10 kJ ısı kaybederken üzerine 4 kJ iş yapılıyor. Sistemin enerji değişimi kaç kJ olur?",
    );
    expect(retry.prompt).not.toMatch(/=\s*hangisi|diğer seçenek|ΔE = -10 - \(-4\)/i);
    expect(retry.options[retry.answerIndex]).toBe("-6 kJ");
    expect(retry.options).not.toEqual(["-6 kJ", "14 kJ", "-14 kJ", "6 kJ"]);
    expect(pipelineMocks.reserve).toHaveBeenCalledTimes(1);
    const reserveArgs = pipelineMocks.reserve.mock.calls[0] as unknown[] | undefined;
    expect(reserveArgs?.[2]).toBe("STUDY_PLAN_GENERATE");
    expect(pipelineMocks.commit).toHaveBeenCalledTimes(1);
    expect(pipelineMocks.refund).not.toHaveBeenCalled();
    const draftCalls = pipelineMocks.create.mock.calls.filter((call) => {
      const blob = JSON.stringify(call[0]?.messages ?? []);
      return call[0]?.model === "gpt-4.1-mini" && blob.includes("Bu konunun dersini yaz");
    });
    expect(draftCalls.length).toBe(1);
    const advanced = pipelineMocks.create.mock.calls.filter((call) => call[0]?.model === "adv");
    expect(advanced.length).toBe(0);
    const verifyCalls = pipelineMocks.create.mock.calls.filter((call) =>
      JSON.stringify(call[0]?.messages ?? []).includes("İddiaları kaynağa karşı denetle"),
    );
    expect(verifyCalls.length).toBe(0);
    const callLog = logs.find((args) => args[0] === "lesson_model_calls");
    const timing = callLog?.[1] as { calls?: number; draftMs?: number; reviewMs?: number; repairMs?: number } | undefined;
    expect(timing?.calls).toBeLessThanOrEqual(2);
    expect(typeof timing?.draftMs).toBe("number");
    expect(typeof timing?.reviewMs).toBe("number");
    expect(typeof timing?.repairMs).toBe("number");
  });
});

describe("lesson shape variants", () => {
  it("names the missing core fields and does not invent an example", () => {
    const gaps = describeLessonShapeGaps({ title: "Boş" });
    expect(gaps.some((gap) => gap.core && gap.field === "sections")).toBe(true);
    expect(gaps.some((gap) => gap.field === "example" && gap.core === false)).toBe(true);
    expect(lessonPublishIssues({ title: "Boş" }).join(" ")).toMatch(/sections/);
    expect(lessonPublishIssues({ title: "Boş" }).join(" ")).not.toMatch(/PV = nRT/);
  });
});
