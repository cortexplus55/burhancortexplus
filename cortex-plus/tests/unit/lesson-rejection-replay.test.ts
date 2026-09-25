import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/learning/exam-prep/node/route";
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
          topicTitle: "Basınç ve Sıcaklık Kavramları",
          sourcePages: [3],
        },
      },
      error: null,
    };
  }
  if (table === "exam_prep_topics") {
    if (op === "list") return { data: [], error: null };
    return {
      data: { id: TOPIC, label: "Basınç ve Sıcaklık Kavramları", measured_level: null },
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
          text_content: PAGE_TEXT,
          formulas: [],
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

describe("exam-prep lesson route", () => {
  beforeEach(() => {
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
