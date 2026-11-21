/**
 * Faz 11 sunucu (teacher.v2, 21 Kasım 2026): özel ders ritmi (Adım Adım Öğret / Hızlı Özet), öğrenci bağlamı ve
 * karşılama kartları, öğretmen notları, mini yoklama, tepki çipleri, deftere ekle ucu, düşünme durumu ve göç (PGlite).
 * Örnekler sentetik (topic-alpha, subtopic-1 …): kurallar ders bağımsız. Canlı model çağrısı yok (sahte istemci).
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  readTutorSession,
  teacherV2SessionLines,
  tutorQuestions,
  v2AnswerFirstLine,
  v2StyleLine,
  type TutorSession,
} from "@/lib/ai/teacher-v2-session";
import { teacherStyleLine } from "@/lib/ai/teacher-tutor";
import { settleOneMove } from "@/lib/ai/teacher-v2";
import { settleVoice } from "@/lib/ai/teacher-voice";
import { STUCK_POINT_RULE } from "@/lib/learning/tutor-answer";
import {
  DEFAULT_TEACH_MODE_V2,
  isTeachModeV2,
  profileStyleForTeachMode,
  TEACH_MODE_SUMMARY,
  TEACH_MODE_TUTOR,
  TEACH_MODE_V2_OPTIONS,
  teachModeFromStyle,
} from "@/lib/learning/tutor-style";
import { followUpKind, planTurn } from "@/lib/learning/tutor-turn";
import {
  PRIVATE_TUTOR_PACING,
  QUICK_SUMMARY_RULE,
  QUICK_SUMMARY_TURN_LINE,
  ROBOTIC_PHRASE_BAN,
  TUTOR_FIRST_PROBLEM_LINE,
  TUTOR_REVEAL_LINE,
  resolveTeachModeV2,
  wantsReveal,
} from "@/lib/teacher/tutor-pacing";
import { parseQuickCheck, QUICK_CHECK_RULE, quickCheckAnswerPrompt } from "@/lib/teacher/quick-check";
import { endsWithQuestion, miniQuizHref, replyChips } from "@/lib/teacher/reply-chips";
import { THINKING_STATUS, thinkingStatus } from "@/lib/teacher/thinking-status";
import { buildDossier, type DossierInput } from "@/lib/teacher/dossier";
import {
  buildTutorStudentContext,
  clearTutorContextCache,
  composeTutorContext,
  readTutorContextExtras,
  TUTOR_CONTEXT_LIMIT,
  type TutorContextExtras,
} from "@/lib/tutor/student-context";
import {
  isSensitiveNote,
  loadTutorNotes,
  maybeWriteTutorNotes,
  NOTE_SESSION_GAP_MS,
  notesTrigger,
  parseTutorNotes,
  type NoteMessage,
} from "@/lib/tutor/memory-notes";
import { chatMistakeRef, saveChatMistake } from "@/lib/teacher/chat-mistake";
import { CHAT_SELF_CHECK_OPTIONS, loadOpenMistakes, reviewMistake } from "@/lib/learning/mistake-notebook";
import type { StudentMemory } from "@/lib/learning/student-memory/summary";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PREP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PREP_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MSG = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const user = (content: string) => ({ role: "user", content });
const tutor = (content: string) => ({ role: "assistant", content });
const emptySession: TutorSession = { asked: [], lastQuestion: null, answering: false, attempt: 0 };

/** Zincirlenen sorguları kaydeden sahte istemci; cevabı çağıran verir (tablo + işlemler + eklenen satır). */
type Call = { table: string; ops: string[]; insert?: unknown };
function fakeService(respond: (call: Call) => unknown = () => ({ data: [], error: null, count: 0 })) {
  const calls: Call[] = [];
  const service = {
    calls,
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const proxy: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, prop: string) {
            if (prop === "then") {
              return (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
                Promise.resolve(respond(call)).then(resolve, reject);
            }
            return (...args: unknown[]) => {
              if (prop === "insert") call.insert = args[0];
              call.ops.push(`${prop}:${JSON.stringify(args[0] ?? null)}${args[1] !== undefined ? JSON.stringify(args[1]) : ""}`);
              return proxy;
            };
          },
        },
      );
      return proxy;
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
  return service;
}

describe("iki mod ve eşleme (ürün sahibinin kararı)", () => {
  it("eski seçimler eşlenir; profile en yakın eski değer yazılır; göç yok", () => {
    for (const legacy of ["step_by_step", "hints_first", "guided", undefined, null, "bilinmeyen"]) {
      expect(teachModeFromStyle(legacy)).toBe(TEACH_MODE_TUTOR);
    }
    expect(teachModeFromStyle("direct_solve")).toBe(TEACH_MODE_SUMMARY);
    expect(teachModeFromStyle(TEACH_MODE_SUMMARY)).toBe(TEACH_MODE_SUMMARY);
    expect(DEFAULT_TEACH_MODE_V2).toBe(TEACH_MODE_TUTOR);
    expect(profileStyleForTeachMode(TEACH_MODE_TUTOR)).toBe("step_by_step");
    expect(profileStyleForTeachMode(TEACH_MODE_SUMMARY)).toBe("direct_solve");
    expect(TEACH_MODE_V2_OPTIONS.map((option) => option.label)).toEqual(["Adım Adım Öğret", "Hızlı Özet"]);
    expect(isTeachModeV2("guided")).toBe(false);
  });

  it("istekteki seçim yoksa profil okunur; Adım Adım Öğret cevabı saklayan makineyle, Hızlı Özet doğrudan çözümle", () => {
    expect(resolveTeachModeV2({ requested: undefined, profile: "direct_solve" })).toEqual({ mode: TEACH_MODE_SUMMARY, base: "direct_solve" });
    expect(resolveTeachModeV2({ requested: "guided", profile: "direct_solve" })).toEqual({ mode: TEACH_MODE_TUTOR, base: "hints_first" });
    expect(resolveTeachModeV2({ requested: TEACH_MODE_TUTOR, profile: null })).toEqual({ mode: TEACH_MODE_TUTOR, base: "hints_first" });
  });
});

describe("özel ders ritmi (Adım Adım Öğret) ve Hızlı Özet istemi", () => {
  it("Adım Adım Öğret: kısa adım, tek sıcak soru, duvar metin yasağı, robotik kalıp yasağı, mini yoklama kuralı", () => {
    const line = v2StyleLine(TEACH_MODE_TUTOR)!;
    expect(line).toContain(PRIVATE_TUTOR_PACING);
    expect(line).toContain(QUICK_CHECK_RULE);
    // Öğretmen v3 (21 Kasım 2026): "en çok 2-3 kısa cümle" kuralı "2-3 kısa paragraf" düzeniyle değişti.
    expect(PRIVATE_TUTOR_PACING).toContain("2-3 kısa paragraf, her paragraf 2-3 kısa cümle");
    expect(PRIVATE_TUTOR_PACING).toContain("tek odak");
    expect(PRIVATE_TUTOR_PACING).toContain("TEK, doğal ve sıcak bir soruyla bitir");
    expect(PRIVATE_TUTOR_PACING).toContain("Duvar gibi uzun metin");
    expect(PRIVATE_TUTOR_PACING).toContain("tam çözümü tek seferde dökme");
    expect(PRIVATE_TUTOR_PACING).toContain("'cevabı göster', 'tamam göster', 'çözümü göster'");
    expect(PRIVATE_TUTOR_PACING).toContain(ROBOTIC_PHRASE_BAN);
    expect(ROBOTIC_PHRASE_BAN).toContain("Elbette! İşte");
    expect(ROBOTIC_PHRASE_BAN).toContain("Aşağıdaki maddelerde özetlenmiştir");
  });

  it("Hızlı Özet: doğrudan, kısa, eksiksiz; adım adım bekletmez", () => {
    expect(v2StyleLine(TEACH_MODE_SUMMARY)).toBe(QUICK_SUMMARY_RULE);
    expect(QUICK_SUMMARY_RULE).toContain("Doğrudan, kısa ve eksiksiz");
    expect(QUICK_SUMMARY_RULE).toContain("bekletme");
    expect(QUICK_SUMMARY_RULE).toContain(ROBOTIC_PHRASE_BAN);
  });

  const plan = (message: string, history: { role: string; content: string }[] = []) =>
    planTurn({ message, style: "hints_first", history });

  it("yeni problemde yalnız ilk küçük adım; 'ilk cümle tam cevap' demez", () => {
    const message = "topic-alpha: 3x + 5 = 20 ise x kaçtır?";
    const lines = teacherV2SessionLines({ session: emptySession, style: TEACH_MODE_TUTOR, plan: plan(message), message });
    expect(lines).toContain(TUTOR_FIRST_PROBLEM_LINE);
    expect(v2AnswerFirstLine({ message, style: TEACH_MODE_TUTOR, base: "hints_first", session: emptySession, plan: plan(message) })).toBe(STUCK_POINT_RULE);
  });

  it("kavram sorusunda tanım saklanmaz (ilk cümle cevap); problem satırı eklenmez", () => {
    const message = "subtopic-1 nedir?";
    const lines = teacherV2SessionLines({ session: emptySession, style: TEACH_MODE_TUTOR, plan: plan(message), message });
    expect(lines).not.toContain(TUTOR_FIRST_PROBLEM_LINE);
    expect(v2AnswerFirstLine({ message, style: TEACH_MODE_TUTOR, base: "hints_first", session: emptySession, plan: plan(message) })).toContain(
      "İLK CÜMLE TAM CEVAP",
    );
  });

  it("cevap denemesi: 1. denemede yargısız ipucu (cevap söylenmez), 2. denemede adım açıklanır", () => {
    const first = teacherV2SessionLines({
      session: { asked: ["Sıradaki adım ne?"], lastQuestion: "Sıradaki adım ne?", answering: true, attempt: 1 },
      style: TEACH_MODE_TUTOR,
      plan: plan("bence 7"),
      message: "bence 7",
    }).join("\n");
    expect(first).toContain("1. deneme");
    expect(first).toContain("yargılamadan");
    expect(first).toContain("SÖYLEME");
    expect(first).toContain("zorluğa orantılı");
    const second = teacherV2SessionLines({
      session: { asked: [], lastQuestion: "Nasıl buldun?", answering: true, attempt: 2 },
      style: TEACH_MODE_TUTOR,
      plan: plan("8"),
      message: "8",
    }).join("\n");
    expect(second).toContain("2. deneme");
    expect(second).toContain("bu adımı kısa ve açık biçimde açıkla");
  });

  it("açık istek ('tamam göster', 'cevabı göster', 'çözümü göster') o adımı gösterir", () => {
    for (const message of ["tamam göster", "Cevabı göster.", "çözümü göster", "bulamadım, göster", "doğrusunu söyle"]) {
      expect(wantsReveal(message), message).toBe(true);
      const lines = teacherV2SessionLines({ session: emptySession, style: TEACH_MODE_TUTOR, plan: plan(message, [user("x?"), tutor("Sence?")]), message });
      expect(lines, message).toContain(TUTOR_REVEAL_LINE);
      expect(lines).not.toContain(TUTOR_FIRST_PROBLEM_LINE);
    }
  });

  it("istek olmayanlar reveal sayılmaz (olumsuz emir, birinci kişi, ipucu)", () => {
    for (const message of ["Küçük bir ipucu ver; cevabı söyleme.", "cevabımı göstereyim mi?", "çözümümü yazdım", "göstermeden dene", "devam et"]) {
      expect(wantsReveal(message), message).toBe(false);
    }
  });

  it("Hızlı Özet: soru turunda kelime sınırı esner; ilk cümle tam cevap", () => {
    const message = "topic-alpha: 12 × 4 kaçtır?";
    const lines = teacherV2SessionLines({ session: emptySession, style: TEACH_MODE_SUMMARY, plan: plan(message), message });
    expect(lines).toContain(QUICK_SUMMARY_TURN_LINE);
    expect(v2AnswerFirstLine({ message, style: TEACH_MODE_SUMMARY, base: "direct_solve", session: emptySession, plan: plan(message) })).toContain(
      "İLK CÜMLE TAM CEVAP",
    );
    expect(teacherV2SessionLines({ session: emptySession, style: TEACH_MODE_SUMMARY, plan: plan("merhaba"), message: "merhaba" })).toEqual([]);
  });

  it("eski stillerin satırları değişmedi (bayrak kapalı yol aynı satırları okur)", () => {
    expect(v2StyleLine("step_by_step")).toBeNull();
    expect(v2StyleLine("direct_solve")).toBeNull();
    expect(teacherStyleLine("step_by_step")).toContain("ADIM ADIM MOD (kesin)");
    expect(teacherStyleLine("hints_first")).toContain("SOKRATİK MOD (kesin)");
  });
});

describe("sohbet ucu: hepsi bayrak arkasında, kapalıyken istem aynı", () => {
  const route = read("src/app/api/ai/chat/route.ts");

  it("mod yalnız v2 ana sohbette çözülür; sistem istemi ifadesi değişmedi", () => {
    expect(route).toContain("const teach = v2Chat ? resolveTeachModeV2({ requested: rest.tutorStyle, profile: profile?.tutor_style }) : null;");
    expect(route).toContain("const teachStyle = teach?.mode ?? tutorStyle;");
    expect(route).toContain("${(v2Session && v2StyleLine(teachStyle)) || teacherStyleLine(tutorStyle)}");
    expect(route).toContain(": answerFirstLine(message, tutorStyle)}");
    expect(route).not.toContain("resolveTeachStyle(");
  });

  it("bağlam bloğu yalnız dosya okunurken (bayrak açık, ana sohbet) ve dosya bloğunun yerine", () => {
    expect(route).toContain("const tutorContextEarly = dossierEarly");
    expect(route).toContain("buildTutorStudentContext(service, userId, { dossier: dossierEarly })");
    expect(route).toContain("((await tutorContextEarly)?.promptBlock || ((await dossierEarly)?.promptBlock ?? \"\"))");
    expect(route.match(/dossierBlock \? `\\n\\n\$\{dossierBlock\}` : ""/g)?.length).toBe(1);
  });

  it("öğretmen notları yanıttan sonra, yalnız bayrak açıkken ana sohbette ve var olan konuşmada", () => {
    const at = route.indexOf("maybeWriteTutorNotes(service, { userId, conversationId: notedConversationId })");
    expect(at).toBeGreaterThan(route.indexOf('service.rpc("complete_chat_operation"'));
    // Öğretmen v3: karşılama cevabı turunda not yazımı ayrı (zorlanmış) yoldan; iki iş aynı konuşmada koşmaz.
    expect(route).toContain("if (teacherV2 && !rest.prepId && rest.conversationId && charge && !welcomeTurn) {");
    expect(route.slice(at - 200, at)).toContain("after(() =>");
  });
});

describe("mini yoklama", () => {
  const reply = "Kısa anlatım.\n\n> ❓ Yoklama: subtopic-1 hangi durumda geçerlidir?\n> A) birinci durum\n> B) ikinci durum\n> C) üçüncü durum";

  it("ayrıştırıcı soruyu ve şıkları okur; öncesi ve sonrası ayrılır", () => {
    const check = parseQuickCheck(reply)!;
    expect(check.before).toBe("Kısa anlatım.");
    expect(check.question).toBe("subtopic-1 hangi durumda geçerlidir?");
    expect(check.options).toEqual([
      { letter: "A", text: "birinci durum" },
      { letter: "B", text: "ikinci durum" },
      { letter: "C", text: "üçüncü durum" },
    ]);
    expect(check.after).toBe("");
    expect(quickCheckAnswerPrompt(check.options[1]!)).toBe("Cevabım: B) ikinci durum");
    expect(parseQuickCheck("> **❓ Yoklama:** soru-1?\n> A) x\n> B) y")?.question).toBe("soru-1?");
  });

  it("ses kılavuzu ve tek hamle katmanından sağ çıkar (ayrı paragrafta da, bitişik yazılmışta da)", () => {
    expect(parseQuickCheck(settleOneMove(settleVoice(reply).text).text)?.options).toHaveLength(3);
    const glued = reply.replace("\n\n>", "\n>");
    expect(parseQuickCheck(settleOneMove(settleVoice(glued).text).text)?.question).toBe("subtopic-1 hangi durumda geçerlidir?");
  });

  it("kurala uymayan blok düz metin kalır (tek şık, beş şık, sıra bozuk, başlıksız)", () => {
    expect(parseQuickCheck("> ❓ Yoklama: soru?\n> A) tek")).toBeNull();
    expect(parseQuickCheck("> ❓ Yoklama: soru?\n> A) a\n> B) b\n> C) c\n> D) d\n> E) e")).toBeNull();
    expect(parseQuickCheck("> ❓ Yoklama: soru?\n> A) a\n> C) c")).toBeNull();
    expect(parseQuickCheck("> 💡 Benzetme: bir şey\n> A) a\n> B) b")).toBeNull();
    expect(parseQuickCheck("düz metin")).toBeNull();
  });

  it("yoklamanın sorusu öğretmenin sorusudur; şık cevabı merdivende deneme sayılır", () => {
    expect(tutorQuestions(reply)).toEqual(["subtopic-1 hangi durumda geçerlidir?"]);
    expect(tutorQuestions("Bir ipucu.\n\n> 💡 Benzetme: neden böyle?\n\nSence sonuç nedir?")).toEqual(["Sence sonuç nedir?"]);
    const session = readTutorSession([user("subtopic-1 nedir?"), tutor(reply)], "Cevabım: B) ikinci durum");
    expect(session.answering).toBe(true);
    expect(session.lastQuestion).toBe("subtopic-1 hangi durumda geçerlidir?");
  });
});

describe("tepki çipleri, mini test bağlantısı, düşünme durumu", () => {
  it("soru ya da yoklamayla biten yanıtta soru adımı çipleri; anlatımda anlatım çipleri", () => {
    expect(replyChips("Kısa bir adım. Sence sıradaki ne?", TEACH_MODE_TUTOR).map((chip) => chip.label)).toEqual([
      "🤔 Küçük bir ipucu ver",
      "📝 Bunu Yanlışlar Defterime ekle",
      "🎯 Bu konudan mini test aç",
    ]);
    expect(replyChips("A.\n\n> ❓ Yoklama: soru?\n> A) x\n> B) y", TEACH_MODE_TUTOR).map((chip) => chip.kind)).toEqual(["prompt", "mistake", "quiz"]);
    expect(replyChips("Kural şu şekilde işler.", TEACH_MODE_TUTOR).map((chip) => chip.label)).toEqual([
      "✅ Anladım, devam et",
      "💡 Günlük hayattan örnek ver",
      "❓ Burayı biraz daha aç",
    ]);
    // Sunucu işaretleri ve kaynak listesi sonu değiştirmez.
    expect(endsWithQuestion("Soru mu?\n\n[[chip:a|b]]")).toBe(true);
    expect(endsWithQuestion("Soru mu?\n\nKaynaklar:\n- [1] belge")).toBe(true);
    expect(endsWithQuestion("> 💡 Benzetme: neden?")).toBe(false);
  });

  it("Hızlı Özet'te anlatım çiplerinden ikisi", () => {
    const chips = replyChips("Özet. Sorun var mı?", TEACH_MODE_SUMMARY);
    expect(chips).toHaveLength(2);
    expect(chips.every((chip) => chip.kind === "prompt")).toBe(true);
  });

  it("çip istemleri tur tanıyıcılarıyla uyumlu (devam takip, ipucu cevabı açtırmaz)", () => {
    const chips = Object.fromEntries(
      [...replyChips("Soru?", TEACH_MODE_TUTOR), ...replyChips("Anlatım.", TEACH_MODE_TUTOR)].map((chip) => [chip.id, chip]),
    );
    expect(followUpKind(chips.continue!.prompt!)).toBe("continue");
    expect(wantsReveal(chips.hint!.prompt!)).toBe(false);
    expect(chips.mistake!.prompt).toBeUndefined();
  });

  it("mini test konu metniyle öntanımlı açılır", () => {
    expect(miniQuizHref({ topic: "topic-alpha 📐" })).toBe("/studio/quiz?topic=topic-alpha");
    expect(miniQuizHref({ topic: null, question: "[Ders] subtopic-1 nasıl çalışır?" })).toBe(`/studio/quiz?topic=${encodeURIComponent("subtopic-1 nasıl çalışır?")}`);
    expect(miniQuizHref({})).toBe("/studio/quiz");
  });

  it("düşünme durumu bağlamsal ve deterministik", () => {
    expect(thinkingStatus({ hasImage: true, message: "x" })).toBe(THINKING_STATUS.image);
    expect(thinkingStatus({ hasDocument: true, message: "x" })).toBe(THINKING_STATUS.document);
    expect(thinkingStatus({ message: "Bunu günlük hayattan bir örnekle anlat." })).toBe(THINKING_STATUS.example);
    expect(thinkingStatus({ message: "topic-alpha: 3x + 5 = 20 ise x kaçtır?", mode: TEACH_MODE_TUTOR })).toBe(THINKING_STATUS.stepTutor);
    expect(thinkingStatus({ message: "topic-alpha: 3x + 5 = 20 ise x kaçtır?", mode: TEACH_MODE_SUMMARY })).toBe(THINKING_STATUS.stepSummary);
    expect(thinkingStatus({ message: "bence 5" })).toBe(THINKING_STATUS.answer);
    expect(thinkingStatus({ message: "subtopic-1 nedir?" })).toBe(THINKING_STATUS.concept);
    expect(thinkingStatus({ message: "" })).toBe(THINKING_STATUS.idle);
    expect(thinkingStatus({ message: "subtopic-1 nedir?" })).toBe(thinkingStatus({ message: "subtopic-1 nedir?" }));
  });
});

/** Politika satırı (Faz 4 biçimi): ölçülmüş konu. */
function policy(pct: number, extra: Record<string, unknown> = {}) {
  return {
    version: 1,
    pct,
    rawPct: pct,
    measured: true,
    evidenceCount: 6,
    objectiveCount: 0,
    independentCorrect: 1,
    distinctAttempts: 1,
    recentMisses: 1,
    hintAssisted: 0,
    cards: { knew: 0, hard: 0, miss: 0 },
    guidance: null,
    ...extra,
  };
}
const masteryRow = (prep: string, topic: string, pol: Record<string, unknown> | null) => ({
  exam_prep_id: prep,
  topic_key: topic,
  measured_level: "weak",
  confidence: 0,
  evidence_count: pol ? 6 : 0,
  first_attempt_correct: 0,
  first_attempt_total: 0,
  independent_correct: 0,
  independent_total: 0,
  last_practiced_at: null,
  policy: pol,
});

const memory: StudentMemory = {
  version: 1,
  updatedAt: "2026-11-20T10:00:00Z",
  sampleSize: 40,
  errorKinds: [{ kind: "sign", count: 4, lastAt: "2026-11-19T10:00:00Z" }],
  weakOutcomes: [],
  openMisconceptions: [],
  repeatedMistakeTopics: [],
  style: {},
  pace: { avgTimeMs: null, hurriedShare: null },
};

function dossierInput(overrides: Partial<DossierInput> = {}): DossierInput {
  return {
    today: "2026-11-21",
    mistakes: [{ topicLabel: "topic-alpha", wrongCount: 3 }],
    openMisconceptions: [],
    preps: [
      { id: PREP_A, title: "prep-one", examDate: "2026-12-03", createdAt: "2026-11-01T00:00:00Z", targetScore: 70, nodes: [] },
      { id: PREP_B, title: "prep-two", examDate: "2027-03-01", createdAt: "2026-11-02T00:00:00Z", targetScore: null, nodes: [] },
    ],
    dueReviews: { prep: 0, general: 0, prepId: null },
    documents: [],
    streak: null,
    memory,
    ...overrides,
  };
}

const extras = (overrides: Partial<TutorContextExtras> = {}): TutorContextExtras => ({
  openMistakes: [{ topicLabel: "topic-alpha", question: "subtopic-1 sorusunda hangi adım gelir?", wrongCount: 2 }],
  masteryRows: [
    masteryRow(PREP_A, "topic-alpha", policy(30)),
    masteryRow(PREP_A, "topic-beta", policy(65)),
    masteryRow(PREP_A, "topic-gamma", policy(60, { guidance: "illusion_of_competence" })),
    masteryRow(PREP_A, "topic-delta", policy(95, { objectiveCount: 2, independentCorrect: 6, distinctAttempts: 3 })),
    masteryRow(PREP_A, "topic-epsilon", null),
    masteryRow("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "topic-foreign", policy(10)),
  ],
  notes: [{ note: "subtopic-1 adımında işaret kuralını karıştırıyor", kind: "stuck" }],
  ...overrides,
});

describe("öğrenci bağlamı (saf kurucu)", () => {
  const context = composeTutorContext({ dossier: buildDossier(dossierInput()), extras: extras() });

  it("zayıf, gelişen ve 'biliyorum sanma' konularını ve açık yanlışları doğru toplar", () => {
    expect(context.signals.weak.map((state) => state.topic)).toEqual(["topic-alpha"]);
    expect(context.signals.developing.map((state) => state.topic)).toEqual(["topic-beta"]);
    expect(context.signals.illusion.map((state) => state.topic)).toEqual(["topic-gamma"]);
    expect(context.signals.openMistakes).toHaveLength(1);
    expect(context.signals.exams.map((exam) => [exam.title, exam.daysLeft])).toEqual([["prep-one", 12], ["prep-two", 100]]);
    // Bilinmeyen hazırlığın ve ölçülmemiş konunun satırı yok; öğrenilmiş konu zayıf sayılmaz.
    const all = [...context.signals.weak, ...context.signals.developing, ...context.signals.illusion].map((state) => state.topic);
    expect(all).not.toContain("topic-foreign");
    expect(all).not.toContain("topic-epsilon");
    expect(all).not.toContain("topic-delta");
  });

  it("istem bloğu kayıttaki her şeyi taşır; iç ad, rakip adı ve uydurma anı yok; sınır içinde", () => {
    const block = context.promptBlock;
    expect(block).toContain("zayıf: topic-alpha");
    expect(block).toContain("bildiğini düşünüp çeldiricide yanıldığı: topic-gamma");
    expect(block).toContain("gelişiyor: topic-beta");
    expect(block).toContain("«subtopic-1 sorusunda hangi adım gelir?» (topic-alpha)");
    expect(block).toContain("Yaklaşan sınavlar: prep-one (12 gün sonra); prep-two (100 gün sonra)");
    expect(block).toContain("En çok takıldığın: topic-alpha (3 kez)");
    expect(block).toContain("Öğretmen notları");
    expect(block).toContain("subtopic-1 adımında işaret kuralını karıştırıyor");
    expect(block).toContain("en sık yaptığı hata"); // öğrenme hafızası satırı (dosyayla birlikte okundu)
    expect(block.length).toBeLessThanOrEqual(TUTOR_CONTEXT_LIMIT);
    for (const banned of [
      "mistake_entries", "exam_prep_topic_mastery", "tutor_memory_notes", "student_learning_memory", "illusion_of_competence",
      "policy", "dossier", "Dosya", "Astra", "geçen gün", "geçen hafta", "TUTOR_",
    ]) {
      expect(block, banned).not.toContain(banned);
    }
    // Sınav satırı iki kez yazılmaz (dosyanın "sınava N gün" satırı yaklaşan sınavlar satırına katıldı).
    expect(block.match(/prep-one/g)?.length).toBe(1);
  });

  it("karşılama kartları: zayıf/açık hatalı konu, yaklaşan sınav, fotoğraf, benzetme (en çok 4, modelsiz)", () => {
    expect(context.cards.map((card) => card.kind)).toEqual(["weak", "exam", "photo", "analogy"]);
    const [weak, exam, photo, analogy] = context.cards;
    // Açık yanlışı da olan zayıf konu önce; yanılsamalı konu açık yanlışsızdı.
    expect(weak!.label).toBe("prep-one — topic-alpha ünitesindeki açık hatalarını birlikte kapatalım");
    expect(weak!.emoji).toBe("⚠️");
    expect(weak!.prepId).toBe(PREP_A);
    expect(weak!.prompt).toContain("topic-alpha");
    expect(exam!.label).toBe("prep-one sınavına 12 gün kaldı: hızlı tekrar turu yapalım");
    expect(exam!.emoji).toBe("🎯");
    expect(exam!.prepId).toBe(PREP_A);
    expect(photo!.label).toBe("Soru veya defter fotoğrafı yükle, adım adım çözelim");
    expect(photo!.emoji).toBe("📷");
    expect(analogy!.label).toBe("Bir konuyu bana sıfırdan analojiyle anlat");
    expect(analogy!.emoji).toBe("💡");
    expect(context.empty).toBe(false);
  });

  it("kayıt yoksa: boş blok, yalnız iki genel kart; 30 günden uzak sınav kart açmaz", () => {
    const blank = composeTutorContext({
      dossier: buildDossier(dossierInput({ mistakes: [], memory: null, preps: [{ id: PREP_B, title: "prep-two", examDate: null, createdAt: null, nodes: [] }] })),
      extras: { openMistakes: [], masteryRows: [], notes: [] },
    });
    expect(blank.promptBlock).toBe("");
    expect(blank.empty).toBe(true);
    expect(blank.cards.map((card) => card.kind)).toEqual(["photo", "analogy"]);
    const far = composeTutorContext({
      dossier: buildDossier(dossierInput({ mistakes: [], preps: [{ id: PREP_B, title: "prep-two", examDate: "2027-03-01", createdAt: null, nodes: [] }] })),
      extras: { openMistakes: [], masteryRows: [], notes: [] },
    });
    expect(far.cards.map((card) => card.kind)).toEqual(["photo", "analogy"]);
    const today = composeTutorContext({
      dossier: buildDossier(dossierInput({ mistakes: [], preps: [{ id: PREP_A, title: "prep-one", examDate: "2026-11-21", createdAt: null, nodes: [] }] })),
      extras: { openMistakes: [], masteryRows: [], notes: [] },
    });
    expect(today.cards[0]!.label).toBe("prep-one sınavın bugün: hızlı tekrar turu yapalım");
  });

  it("hazırlığı bilinmeyen açık yanlışta kart hazırlık adı olmadan kurulur", () => {
    const noPrep = composeTutorContext({
      dossier: buildDossier(dossierInput({ mistakes: [], preps: [] })),
      extras: { openMistakes: [{ topicLabel: "topic-zeta", question: "soru-1?", wrongCount: 1 }], masteryRows: [], notes: [] },
    });
    expect(noPrep.cards[0]).toMatchObject({ kind: "weak", label: "topic-zeta konusundaki açık hatalarını birlikte kapatalım", prepId: null });
  });
});

describe("öğrenci bağlamı yükleyicisi: yalnız kendi satırları, sınırlı, dosyanın okumasını paylaşır, önbellek", () => {
  afterEach(() => clearTutorContextCache());

  it("üç ek sorgu: her biri user_id ile ve LIMIT'li; dosya verilince dosya tabloları sorgulanmaz", async () => {
    const service = fakeService((call) =>
      call.table === "exam_prep_topic_mastery" ? { data: extras().masteryRows, error: null } : { data: [], error: null },
    );
    const context = await buildTutorStudentContext(service as never, USER, { dossier: buildDossier(dossierInput()) });
    expect(service.calls.map((call) => call.table).sort()).toEqual(["exam_prep_topic_mastery", "mistake_entries", "tutor_memory_notes"]);
    for (const call of service.calls) {
      const ops = call.ops.join(" ");
      expect(ops, call.table).toContain(`eq:"user_id"`);
      expect(ops, call.table).toMatch(/limit:/);
    }
    expect(service.calls.find((call) => call.table === "mistake_entries")!.ops.join(" ")).toContain('is:"mastered_at"');
    expect(context.signals.weak.map((state) => state.topic)).toEqual(["topic-alpha"]);
    // İkinci okuma önbellekten; `fresh` yeniden okur.
    await buildTutorStudentContext(service as never, USER, { dossier: buildDossier(dossierInput()) });
    expect(service.calls).toHaveLength(3);
    await buildTutorStudentContext(service as never, USER, { dossier: buildDossier(dossierInput()), fresh: true });
    expect(service.calls).toHaveLength(6);
  });

  it("bir kaynak düşerse bağlam yine kurulur; not tablosu yoksa notsuz", async () => {
    const service = fakeService((call) =>
      call.table === "tutor_memory_notes"
        ? { data: null, error: { code: "42P01", message: 'relation "tutor_memory_notes" does not exist' } }
        : call.table === "mistake_entries"
          ? { data: null, error: { message: "boom" } }
          : { data: [], error: null },
    );
    const value = await readTutorContextExtras(service as never, USER);
    expect(value).toEqual({ openMistakes: [], masteryRows: [], notes: [] });
  });

  it("karşılama kartları ucu: bayrak kapalıyken 404, yalnız okur, model/kredi yok", () => {
    const route = read("src/app/api/teacher/start-cards/route.ts");
    expect(route).toContain("isFeatureEnabled(service, TEACHER_V2_FLAG, userId)");
    expect(route).toContain('{ error: "not_found" }, { status: 404 }');
    expect(route).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|reserveCredits|openai|chat\.completions/);
    expect(read("src/lib/tutor/student-context.ts")).not.toMatch(/openai|chat\.completions|\.insert\(|\.update\(|match_document_chunks/);
  });

  it("/ogretmen sayfası bağlamı ya da kartları sunucuda okumaz (sorgu bütçesi aynı)", () => {
    const page = read("src/app/ogretmen/page.tsx");
    expect(page).not.toContain("buildTutorStudentContext");
    expect(page).not.toContain("start-cards");
  });
});

describe("öğretmen notları", () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 10, 21, 10, 0) + minutes * 60_000).toISOString();
  const msg = (role: string, content: string, minutes: number): NoteMessage => ({ role, content, createdAt: at(minutes) });

  it("tetik: önceki öğretmen mesajı 30 dk'dan eskiyse önceki bölüm; her 8. öğretmen mesajında son 12 mesaj", () => {
    const previousSegment = [
      msg("user", "subtopic-1 nasıl?", 0),
      msg("assistant", "İlk adım şu. Sence?", 0),
      msg("user", "bence işaret değişir", 2),
      msg("assistant", "Doğru. Sıradaki?", 2),
    ];
    const current = [msg("user", "yeni soru", 40), msg("assistant", "Tamam.", 40)];
    const newestFirst = [...previousSegment, ...current].reverse();
    const gap = notesTrigger({ newestFirst, assistantCount: 3 })!;
    expect(gap.reason).toBe("session_gap");
    expect(gap.window.map((row) => row.content)).toEqual(previousSegment.map((row) => row.content));
    expect(gap.anchor).toBe(at(2));
    // Aynı turun iki mesajı aynı zaman damgasını taşır; sıra öğrenci → öğretmen.
    const sameStamp = [msg("assistant", "Tamam.", 40), msg("user", "yeni soru", 40), ...previousSegment.slice().reverse()];
    expect(notesTrigger({ newestFirst: sameStamp, assistantCount: 3 })!.window.at(-1)!.content).toBe("Doğru. Sıradaki?");

    const steady = Array.from({ length: 16 }, (_, index) => msg(index % 2 ? "assistant" : "user", `m${index}`, Math.floor(index / 2)));
    expect(notesTrigger({ newestFirst: steady.slice().reverse(), assistantCount: 7 })).toBeNull();
    const eighth = notesTrigger({ newestFirst: steady.slice().reverse(), assistantCount: 8 })!;
    expect(eighth.reason).toBe("every_eighth");
    expect(eighth.window).toHaveLength(12);
    expect(eighth.window.at(-1)!.content).toBe("m15");
    expect(NOTE_SESSION_GAP_MS).toBe(30 * 60_000);
    expect(notesTrigger({ newestFirst: current.slice().reverse(), assistantCount: 8 })).toBeNull(); // çok kısa
  });

  it("ayrıştırma: en çok 3, kısa, tür doğru, hassas değil, sohbette kanıtı var, tekrarsız", () => {
    const window = "Öğrenci: subtopic-1 adımında işaret kuralı nasıl? Öğretmen: benzetmeyle anlatayım. Öğrenci: kısa adımlarla olsun";
    const raw = JSON.stringify({
      notes: [
        { note: "subtopic-1 adımında işaret kuralını karıştırıyor", kind: "stuck" },
        { note: "subtopic-1 adımında işaret kuralını karıştırıyor", kind: "stuck" },
        { note: "Benzetmeyle anlatımı tercih ediyor", kind: "preference" },
        { note: "Annesi sınav için baskı yapıyor ve kaygısı yüksek", kind: "stuck" },
        { note: "Kuantum mekaniğini çok iyi biliyor", kind: "strength" },
        { note: "Bu çok uzun bir gözlem cümlesi olup on iki kelime sınırını açıkça aşan bir metindir burada", kind: "stuck" },
        { note: "işaret kuralı", kind: "bilinmeyen" },
        { note: "Kısa adımlarla ilerlemeyi seviyor", kind: "preference" },
        { note: "fazladan dördüncü geçerli işaret gözlemi", kind: "stuck" },
      ],
    });
    const notes = parseTutorNotes(raw, window);
    expect(notes.map((note) => note.note)).toEqual([
      "subtopic-1 adımında işaret kuralını karıştırıyor",
      "Benzetmeyle anlatımı tercih ediyor",
      "Kısa adımlarla ilerlemeyi seviyor",
    ]);
    expect(parseTutorNotes("bozuk", window)).toEqual([]);
    expect(isSensitiveNote("Babası her gün soruyor")).toBe(true);
    expect(isSensitiveNote("topic-alpha ilaç etkileşimlerini karıştırıyor")).toBe(false);
    expect(isSensitiveNote("Telefonu 05551234567")).toBe(true);
  });

  const conversation = (gapMinutes: number) =>
    [
      msg("user", "subtopic-1 nasıl çalışır?", 0),
      msg("assistant", "İlk adımda işaret kuralına bak. Sence?", 0),
      msg("user", "işaret değişmez mi?", 1),
      msg("assistant", "Değişir. Benzetmeyle anlatayım mı?", 1),
      msg("user", "yeni konu", gapMinutes),
      msg("assistant", "Olur.", gapMinutes),
    ]
      .reverse()
      .map((row) => ({ role: row.role, content: row.content, created_at: row.createdAt }));

  function notesService(options: { gap: number; notesTable?: "missing" | "noted" | "empty" }) {
    return fakeService((call) => {
      if (call.table === "messages") {
        if (call.ops.some((op) => op.includes('"head":true'))) return { data: null, error: null, count: 3 };
        return { data: conversation(options.gap), error: null };
      }
      if (call.table === "tutor_memory_notes") {
        if (call.insert) return { data: null, error: null };
        if (options.notesTable === "missing") return { data: null, error: { code: "42P01", message: "relation does not exist" } };
        if (options.notesTable === "noted") return { data: [{ id: "n1" }], error: null };
        return { data: [], error: null };
      }
      return { data: [], error: null };
    });
  }

  function fakeModel(content: string) {
    const create = vi.fn(async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 120, completion_tokens: 30 } }));
    return { client: { chat: { completions: { create } } } as never, create };
  }

  const modelReply = JSON.stringify({
    notes: [
      { note: "subtopic-1 adımında işaret kuralını karıştırıyor", kind: "stuck" },
      { note: "Benzetmeyle anlatımı tercih ediyor", kind: "preference" },
      { note: "İşaret kuralında hızlanıyor", kind: "strength" },
      { note: "dördüncü işaret gözlemi yazılmaz", kind: "stuck" },
    ],
  });

  it("oturum bittiyse tek küçük çağrı, en çok 3 not yazılır, kullanım kaydı kredisiz koddan", async () => {
    const service = notesService({ gap: 45 });
    const { client, create } = fakeModel(modelReply);
    const result = await maybeWriteTutorNotes(service as never, { userId: USER, conversationId: CONV, client, model: "test-model" });
    expect(result).toEqual({ written: 3, reason: "session_gap" });
    expect(create).toHaveBeenCalledTimes(1);
    const request = (create.mock.calls[0] as unknown as [{ response_format: unknown; messages: { content: string }[] }])[0];
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request.messages[1]!.content).toContain("Öğrenci: subtopic-1 nasıl çalışır?");
    expect(request.messages[1]!.content).not.toContain("yeni konu");
    const insert = service.calls.find((call) => call.table === "tutor_memory_notes" && call.insert)!;
    expect(insert.insert).toHaveLength(3);
    expect((insert.insert as { user_id: string; conversation_id: string }[]).every((row) => row.user_id === USER && row.conversation_id === CONV)).toBe(true);
    const usage = service.calls.find((call) => call.table === "ai_usage_events")!;
    expect(JSON.stringify(usage.insert)).toContain('"action_code":"TUTOR_MEMORY_NOTE"');
    expect(service.calls.some((call) => call.table.startsWith("credit"))).toBe(false);
  });

  it("tetik yoksa, tablo yoksa ya da bölüm zaten notlandıysa model çağrılmaz", async () => {
    for (const [options, reason] of [
      [{ gap: 5 }, "no_trigger"],
      [{ gap: 45, notesTable: "missing" as const }, "table_missing"],
      [{ gap: 45, notesTable: "noted" as const }, "already_noted"],
    ] as const) {
      const { client, create } = fakeModel(modelReply);
      const result = await maybeWriteTutorNotes(notesService(options) as never, { userId: USER, conversationId: CONV, client, model: "test-model" });
      expect(result.reason).toBe(reason);
      expect(create).not.toHaveBeenCalled();
    }
  });

  it("model düşerse sessizce atlanır (fırlatmaz)", async () => {
    const create = vi.fn(async () => {
      throw new Error("down");
    });
    const result = await maybeWriteTutorNotes(notesService({ gap: 45 }) as never, {
      userId: USER,
      conversationId: CONV,
      client: { chat: { completions: { create } } } as never,
      model: "test-model",
    });
    expect(result).toEqual({ written: 0, reason: "failed" });
  });

  it("okuma: son 5 not, tekrarsız, yalnız kendi satırları; tablo yoksa boş", async () => {
    const rows = ["not-a bir", "not-a bir", "not-b iki", "not-c üç", "not-d dört", "not-e beş", "not-f altı"].map((note) => ({ note, kind: "stuck" }));
    const service = fakeService(() => ({ data: rows, error: null }));
    const notes = await loadTutorNotes(service as never, USER);
    expect(notes.map((note) => note.note)).toEqual(["not-a bir", "not-b iki", "not-c üç", "not-d dört", "not-e beş"]);
    expect(service.calls[0]!.ops.join(" ")).toContain(`eq:"user_id"`);
    const missing = fakeService(() => ({ data: null, error: { code: "42P01", message: "relation does not exist" } }));
    expect(await loadTutorNotes(missing as never, USER)).toEqual([]);
  });
});

describe("Yanlışlar Defterime ekle", () => {
  function mistakeService(options: {
    conversation?: unknown;
    message?: unknown;
    existing?: unknown[];
    insertError?: { code: string } | null;
    question?: string;
  }) {
    return fakeService((call) => {
      if (call.table === "conversations") return { data: options.conversation ?? null, error: null };
      if (call.table === "messages") {
        if (call.ops.some((op) => op.startsWith('eq:"role"'))) return { data: [{ content: options.question ?? "[Ders] subtopic-1 nasıl bulunur?" }], error: null };
        return { data: options.message ?? null, error: null };
      }
      if (call.table === "mistake_entries") {
        if (call.insert) return options.insertError ? { data: null, error: options.insertError } : { data: { id: "entry-1" }, error: null };
        return { data: options.existing ?? [], error: null };
      }
      return { data: [], error: null };
    });
  }
  const conversation = { id: CONV, title: "topic-alpha 📐" };
  const reply = { id: MSG, role: "assistant", content: "İlk adım şu. Sence sıradaki ne?\n\n[[chip:a|b]]", created_at: "2026-11-21T10:00:00Z" };

  it("sahiplik: konuşma ya da mesaj öğrencinin değilse 404; öğrenci mesajı 422", async () => {
    expect(await saveChatMistake(mistakeService({ message: reply }) as never, OTHER, { conversationId: CONV, messageId: MSG })).toEqual({
      ok: false,
      status: 404,
      error: "not_found",
    });
    expect(
      await saveChatMistake(mistakeService({ conversation, message: { ...reply, role: "user" } }) as never, USER, { conversationId: CONV, messageId: MSG }),
    ).toMatchObject({ ok: false, status: 422 });
    const service = mistakeService({ conversation, message: reply });
    await saveChatMistake(service as never, USER, { conversationId: CONV, messageId: MSG });
    // Her okuma öğrencinin kendi kimliğiyle süzülür (yazım ise satıra öğrencinin kimliğini koyar; aşağıda).
    for (const call of service.calls.filter((call) => !call.insert)) {
      expect(call.ops.join(" "), call.table).toContain(`eq:"user_id""${USER}"`);
    }
  });

  it("deftere bugünkü satır biçimiyle yazar: var olan kaynak değeri, chat: kimliği, konu başlıktan, işaretsiz açıklama", async () => {
    const service = mistakeService({ conversation, message: reply });
    const result = await saveChatMistake(service as never, USER, { conversationId: CONV, messageId: MSG });
    expect(result).toEqual({ ok: true, already: false, entryId: "entry-1", topic: "topic-alpha", quizHref: "/studio/quiz?topic=topic-alpha" });
    const insert = service.calls.find((call) => call.insert)!.insert as Record<string, unknown>;
    expect(insert).toMatchObject({
      user_id: USER,
      source: "lesson_check",
      source_question_id: null,
      source_ref: chatMistakeRef(MSG),
      topic_label: "topic-alpha",
      question_text: "subtopic-1 nasıl bulunur?",
      options: null,
      correct_answer: null,
      explanation: "İlk adım şu. Sence sıradaki ne?",
    });
  });

  it("idempotent: aynı mesaj ikinci kez eklenmez; eşzamanlı ikinci dokunuş var olanı döner; başka yazım hatası 503", async () => {
    const again = mistakeService({ conversation, message: reply, existing: [{ id: "entry-1", question_text: "q" }] });
    expect(await saveChatMistake(again as never, USER, { conversationId: CONV, messageId: MSG })).toMatchObject({ ok: true, already: true, entryId: "entry-1" });
    expect(again.calls.some((call) => call.insert)).toBe(false);
    const race = mistakeService({ conversation, message: reply, insertError: { code: "23505" } });
    expect(await saveChatMistake(race as never, USER, { conversationId: CONV, messageId: MSG })).toMatchObject({ ok: true, already: true });
    const broken = mistakeService({ conversation, message: reply, insertError: { code: "23514" } });
    expect(await saveChatMistake(broken as never, USER, { conversationId: CONV, messageId: MSG })).toEqual({
      ok: false,
      status: 503,
      error: "unavailable",
    });
  });

  it("uç: bayrak kapalıyken 404, oturum ve hız sınırı (dakikada 10), model ve kredi yok", () => {
    const route = read("src/app/api/teacher/mistake/route.ts");
    expect(route).toContain('withUser(request, { scope: "teacher-mistake", limit: 10 })');
    expect(route).toContain("isFeatureEnabled(service, TEACHER_V2_FLAG, userId)");
    expect(route).toContain('{ error: "not_found" }, { status: 404 }');
    expect(route).not.toMatch(/reserveCredits|openai|chat\.completions/);
  });

  it("defter sohbet kartını chat: önekinden tanır, kendini yoklama olarak sorar; 'Artık çözebiliyorum' doğru sayılır", async () => {
    const row = {
      id: "entry-1", source: "lesson_check", source_ref: chatMistakeRef(MSG), topic_label: "topic-alpha", question_text: "soru-1?",
      options: null, correct_answer: null, first_wrong_answer: null, explanation: "açıklama", wrong_count: 1, review_count: 0,
      correct_streak: 0, mastered_at: null,
    };
    const groups = await loadOpenMistakes(fakeService(() => ({ data: [row], error: null })) as never, USER);
    expect(groups[0]!.entries[0]!.source).toBe("chat");
    expect(groups[0]!.entries[0]!.options).toEqual([...CHAT_SELF_CHECK_OPTIONS]);
    const review = fakeService((call) => (call.ops.some((op) => op.startsWith("update")) ? { data: null, error: null } : { data: row, error: null }));
    expect((await reviewMistake(review as never, USER, "entry-1", CHAT_SELF_CHECK_OPTIONS[0]))!.correct).toBe(true);
    expect((await reviewMistake(review as never, USER, "entry-1", CHAT_SELF_CHECK_OPTIONS[1]))!.correct).toBe(false);
  });

  it("öneksiz ders sorusu satırı sohbet kartı sayılmaz; source_ref sütunu yoksa okuma sütunsuz bir kez daha denenir", async () => {
    const lessonRow = {
      id: "entry-2", source: "lesson_check", source_ref: "a1:lc:0", topic_label: "topic-alpha", question_text: "soru-2?",
      options: ["x", "y"], correct_answer: "x", first_wrong_answer: "y", explanation: null, wrong_count: 1, review_count: 0,
      correct_streak: 0, mastered_at: null,
    };
    const plain = await loadOpenMistakes(fakeService(() => ({ data: [lessonRow], error: null })) as never, USER);
    expect(plain[0]!.entries[0]!.source).toBe("lesson_check");
    expect(plain[0]!.entries[0]!.options).toEqual(["x", "y"]);
    const review = fakeService((call) => (call.ops.some((op) => op.startsWith("update")) ? { data: null, error: null } : { data: lessonRow, error: null }));
    expect((await reviewMistake(review as never, USER, "entry-2", CHAT_SELF_CHECK_OPTIONS[0]))!.correct).toBe(false);

    const { source_ref: _ref, ...oldRow } = lessonRow;
    void _ref;
    let reads = 0;
    const oldSchema = fakeService(() => {
      reads += 1;
      return reads === 1 ? { data: null, error: { code: "42703", message: "column source_ref does not exist" } } : { data: [oldRow], error: null };
    });
    const groups = await loadOpenMistakes(oldSchema as never, USER);
    expect(reads).toBe(2);
    expect(groups[0]!.entries[0]!.questionText).toBe("soru-2?");
  });

  it("hesap silinince notlar da gider", () => {
    expect(read("src/lib/privacy/account-deletion.ts").match(/"tutor_memory_notes"/g)?.length).toBe(2);
  });
});

describe("göç: öğretmen notları; defter kısıtına dokunulmaz (PGlite)", () => {
  const db = new PGlite();
  const MIGRATION = "supabase/migrations/20261121150000_tutor_memory_notes.sql";
  const CONSTRAINT_SQL = `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.mistake_entries'::regclass ORDER BY conname`;
  let constraintsBefore: unknown[] = [];

  beforeAll(async () => {
    await db.exec(`
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY);
      CREATE TABLE public.conversations (id uuid PRIMARY KEY, user_id uuid REFERENCES public.profiles(id), title text);
      CREATE TABLE public.exam_preps (id uuid PRIMARY KEY, user_id uuid REFERENCES public.profiles(id));
    `);
    await db.exec(read("supabase/migrations/20260905120000_mistake_notebook.sql"));
    await db.exec(read("supabase/migrations/20261119100100_faz2_mistake_entries_source_ref.sql"));
    await db.query(`INSERT INTO public.profiles (id) VALUES ($1)`, [USER]);
    await db.query(`INSERT INTO public.conversations (id, user_id) VALUES ($1, $2)`, [CONV, USER]);
    await db.query(
      `INSERT INTO public.mistake_entries (user_id, source, source_ref, question_text) VALUES ($1, 'quiz', 'a1:q:0', 'eski satır')`,
      [USER],
    );
    constraintsBefore = (await db.query(CONSTRAINT_SQL)).rows;
    // İki kez: ekleyici ve tekrar çalıştırılabilir.
    await db.exec(read(MIGRATION));
    await db.exec(read(MIGRATION));
  });

  afterAll(async () => {
    await db.close();
  });

  it("not tablosu: kısa not, bilinen tür; konuşma silinince notlar da gider", async () => {
    await db.query(`INSERT INTO public.tutor_memory_notes (user_id, conversation_id, note, kind) VALUES ($1, $2, 'not-1', 'stuck')`, [USER, CONV]);
    await expect(
      db.query(`INSERT INTO public.tutor_memory_notes (user_id, note, kind) VALUES ($1, $2, 'stuck')`, [USER, "x".repeat(161)]),
    ).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.tutor_memory_notes (user_id, note, kind) VALUES ($1, 'not', 'bilinmeyen')`, [USER])).rejects.toThrow();
    await db.query(`DELETE FROM public.conversations WHERE id = $1`, [CONV]);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.tutor_memory_notes`);
    expect(rows[0]!.n).toBe(0);
  });

  it("tarayıcı rolleri iki tabloya da erişemez; satır güvenliği açık", async () => {
    for (const table of ["public.tutor_memory_notes", "public.tutor_conversation_preps"]) {
      const { rows } = await db.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE oid = $1::regclass`, [table]);
      expect(rows[0]!.relrowsecurity, table).toBe(true);
      for (const role of ["anon", "authenticated"]) {
        const { rows: grants } = await db.query<{ ok: boolean }>(
          `SELECT has_table_privilege($1, $2, 'SELECT') OR has_table_privilege($1, $2, 'INSERT') AS ok`,
          [role, table],
        );
        expect(grants[0]!.ok, `${table} ${role}`).toBe(false);
      }
    }
  });

  it("konuşma-hazırlık bağı: konuşma başına tek satır; hazırlık silinince bağ gider, konuşma kalır", async () => {
    const PREP = "33333333-3333-4333-8333-333333333333";
    const CONV2 = "44444444-4444-4444-8444-444444444444";
    await db.query(`INSERT INTO public.exam_preps (id, user_id) VALUES ($1, $2)`, [PREP, USER]);
    await db.query(`INSERT INTO public.conversations (id, user_id) VALUES ($1, $2)`, [CONV2, USER]);
    await db.query(`INSERT INTO public.tutor_conversation_preps (conversation_id, user_id, prep_id) VALUES ($1, $2, $3)`, [CONV2, USER, PREP]);
    await expect(
      db.query(`INSERT INTO public.tutor_conversation_preps (conversation_id, user_id, prep_id) VALUES ($1, $2, $3)`, [CONV2, USER, PREP]),
    ).rejects.toThrow();
    await db.query(`DELETE FROM public.exam_preps WHERE id = $1`, [PREP]);
    const links = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.tutor_conversation_preps`);
    expect(links.rows[0]!.n).toBe(0);
    const conv = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.conversations WHERE id = $1`, [CONV2]);
    expect(conv.rows[0]!.n).toBe(1);
  });

  it("defterin kısıtları göçten sonra birebir aynı; sohbet satırı var olan kısıtla yazılır", async () => {
    expect((await db.query(CONSTRAINT_SQL)).rows).toEqual(constraintsBefore);
    await db.query(
      `INSERT INTO public.mistake_entries (user_id, source, source_ref, question_text) VALUES ($1, 'lesson_check', $2, 'soru-1?')`,
      [USER, chatMistakeRef(MSG)],
    );
    await expect(
      db.query(`INSERT INTO public.mistake_entries (user_id, source, source_ref, question_text) VALUES ($1, 'lesson_check', $2, 'tekrar')`, [
        USER,
        chatMistakeRef(MSG),
      ]),
    ).rejects.toThrow(); // tekil yol kimliği: aynı mesaj iki kez düşmez
    // Kısıt genişlemedi: "chat" kaynak değeri hâlâ reddedilir (kod onu yazmaz).
    await expect(
      db.query(`INSERT INTO public.mistake_entries (user_id, source, source_ref, question_text) VALUES ($1, 'chat', 'chat:x', 'q')`, [USER]),
    ).rejects.toThrow();
    await expect(
      db.query(`INSERT INTO public.mistake_entries (user_id, source, source_ref, question_text) VALUES ($1, 'bilinmeyen', 'r', 'q')`, [USER]),
    ).rejects.toThrow();
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.mistake_entries WHERE question_text = 'eski satır'`);
    expect(rows[0]!.n).toBe(1);
  });

  it("göç dosyası yalnız ekler; başlık ve kayıt satırı var", () => {
    const sql = read(MIGRATION);
    expect(sql.split("\n")[0]).toContain("UYGULANDI: 21 Kasım 2026, #722");
    expect(sql).toContain("values ('20261121150000', 'tutor_memory_notes') on conflict (version) do nothing;");
    expect(sql).not.toMatch(/^\s*(?:DELETE|UPDATE|TRUNCATE|DROP)\b/im);
    // ALTER TABLE yalnız bu dosyada kurulan tablolarda (RLS açma); var olan hiçbir tablo değişmez.
    const created = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (public\.\w+)/g)].map((match) => match[1]);
    expect(created).toEqual(["public.tutor_memory_notes", "public.tutor_conversation_preps"]);
    for (const match of sql.matchAll(/^\s*ALTER TABLE (public\.\w+)/gim)) expect(created).toContain(match[1]);
    expect(sql.replace(/^--.*$/gm, "")).not.toContain("mistake_entries");
  });
});
