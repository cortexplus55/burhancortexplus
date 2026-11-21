import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
// Öğrenci bağlamı ve seviye kalibrasyonu bu dosyanın konusu değil: okumaları kendi testlerinde.
vi.mock("@/lib/tutor/student-context", () => ({ buildTutorStudentContext: async () => null }));
vi.mock("@/lib/learning/student-pedagogy", () => ({ studentCalibration: async () => null }));

import { realtimeSessionConfig } from "@/lib/tutor/realtime/openai-call";
import {
  REALTIME_TRANSCRIBE_LANGUAGE,
  REALTIME_TRANSCRIBE_MODEL,
  REALTIME_VAD_PREFIX_MS,
  REALTIME_VAD_SILENCE_MS,
} from "@/lib/tutor/realtime/config";
import {
  buildTranscriptionPrompt,
  cleanSttTerm,
  sttTermsFromPrep,
  STT_PREP_TERM_MAX,
  STT_PROMPT_MAX_CHARS,
  STT_UNIVERSAL_TERMS,
} from "@/lib/tutor/realtime/stt-prompt";
import { buildRealtimeInstructions, VOICE_HEARING_RULE, VOICE_TALK_RULES, VOICE_TERMS_MAX } from "@/lib/tutor/realtime-instructions";
import { loadVoiceContext } from "@/lib/tutor/realtime/persist";
import { createBodySchema } from "@/lib/tutor/realtime/session";
import { REALTIME_PRICES_PER_1K, realtimeUsageRows } from "@/lib/tutor/realtime/usage";
import { emptyUsage } from "@/lib/tutor/realtime/config";

/*
  Canlı sesli öğretmende Türkçe algılama (21 Kasım 2026, Burhan). Canlıda bir kısaltmanın son sesi düşerek yazıldı ve
  öğretmen bağlamdan belli olduğu hâlde "… derken … mi?" diye dersi böldü. Bu dosya üç şeyi tutar:
    1. oturum ayarı: büyük yazıya döküm modeli, dil "tr", terim ipucu, yakın alan süzgeci, 700 ms sessizlik;
    2. ipucu metni: evrensel terimler + öğrencinin hazırlığının kendi konu başlıkları (her oturumda veritabanından);
    3. talimat: bağlamdan belli olan eksik duyuşta doğrulatma yok, gerçek belirsizlikte kısa soru.
  Örnekler bilerek farklı derslerden.
*/

const USER = "11111111-1111-4111-8111-111111111111";
const PREP = "22222222-2222-4222-8222-222222222222";
const OTHER_PREP = "33333333-3333-4333-8333-333333333333";

type Filters = Record<string, unknown>;
type Handler = (filters: Filters, columns: string) => unknown[] | { error: true };

/** Zincirlenebilir sahte sorgu: tablo başına satır üretici; çağrılar kaydedilir. */
function fakeService(tables: Record<string, Handler>) {
  const calls: { table: string; filters: Filters; columns: string }[] = [];
  const service = {
    from(table: string) {
      const state = { filters: {} as Filters, columns: "" };
      const run = () => {
        calls.push({ table, filters: { ...state.filters }, columns: state.columns });
        const result = tables[table]?.(state.filters, state.columns) ?? [];
        return Array.isArray(result) ? { data: result, error: null } : { data: null, error: { message: "column does not exist" } };
      };
      const query: Record<string, unknown> = {
        select(columns: string) {
          state.columns = columns;
          return query;
        },
        eq(key: string, value: unknown) {
          state.filters[key] = value;
          return query;
        },
        is: () => query,
        not: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => {
          const result = run();
          return { data: result.data ? ((result.data as unknown[])[0] ?? null) : null, error: result.error };
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
      };
      return query;
    },
  };
  return { service: service as unknown as SupabaseClient, calls };
}

describe("oturum ayarı: Türkçe yazıya döküm", () => {
  it("büyük model, dil açıkça tr, yakın alan süzgeci ve 700 ms sessizlikle dönüş algılama", () => {
    const { input } = realtimeSessionConfig({ instructions: "x" }).audio;
    expect(REALTIME_TRANSCRIBE_MODEL).toBe("gpt-4o-transcribe");
    expect(REALTIME_TRANSCRIBE_LANGUAGE).toBe("tr");
    expect(input.transcription.model).toBe("gpt-4o-transcribe");
    expect(input.transcription.language).toBe("tr");
    expect(input.noise_reduction).toEqual({ type: "near_field" });
    expect(input.turn_detection).toEqual({
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 350,
      silence_duration_ms: 700,
      create_response: true,
      interrupt_response: true,
    });
    expect(REALTIME_VAD_SILENCE_MS).toBe(700);
    expect(REALTIME_VAD_PREFIX_MS).toBe(350);
  });

  it("ipucu metni evrensel terimleri ve öğrencinin kendi konularını birlikte taşır", () => {
    const { prompt } = realtimeSessionConfig({
      instructions: "x",
      sttTerms: ["Solunum Sistemi Hastalıkları", "Borçlar Hukuku Genel Hükümler", "Akışkanlar Mekaniği"],
    }).audio.input.transcription;
    for (const term of ["KOAH", "EKG", "TBMM", "AYM", "KPSS", "pH", "ATP", "DNA", "kosinüs", "integral", "türev", "Bernoulli", "Pascal"]) {
      expect(prompt).toContain(term);
    }
    expect(prompt).toContain("Solunum Sistemi Hastalıkları");
    expect(prompt).toContain("Borçlar Hukuku Genel Hükümler");
    expect(prompt).toContain("Akışkanlar Mekaniği");
    expect(prompt).toMatch(/^Türkçe/);
  });

  it("konu yoksa ipucu yine dolu (evrensel terimler); ayar dakika mikrofonuna göre değişmez", () => {
    const prompt = buildTranscriptionPrompt([]);
    expect(prompt).toContain("KOAH");
    expect(prompt).not.toContain("Öğrencinin çalıştığı konular");
    // Eski sekme "micProfile" gönderse de gövde kabul edilir ve alan düşer (ayar herkes için yakın alan).
    const parsed = createBodySchema.parse({ sdp: "v=0\r\nteklif-metni", micProfile: "far" });
    expect(parsed).not.toHaveProperty("micProfile");
  });
});

describe("ipucu metni (saf)", () => {
  it("terim temizliği: kazanım kodu, işaretleme ve satır sonu gider; harfsiz ya da çok uzun metin düşer", () => {
    expect(cleanSttTerm("T.O.5.5 Metinde geçen deyimleri açıklar")).toBe("Metinde geçen deyimleri açıklar");
    expect(cleanSttTerm("**Osmanlı'da** Islahat\nHareketleri")).toBe("Osmanlı'da Islahat Hareketleri");
    expect(cleanSttTerm("  — Limit ve Süreklilik:  ")).toBe("Limit ve Süreklilik");
    expect(cleanSttTerm("12.3")).toBeNull();
    expect(cleanSttTerm("a".repeat(120))).toBeNull();
    expect(cleanSttTerm(null)).toBeNull();
  });

  it("hazırlık terimleri: önce ad, sonra konu başlıkları, en son alt başlıklar; tekrar bir kez", () => {
    const terms = sttTermsFromPrep("Anayasa Hukuku Vize", [
      { title: "Yasama", subtopics: ["Kanun yapım süreci", "Meclis soruşturması"] },
      { title: "Yürütme", subtopics: ["Cumhurbaşkanlığı kararnamesi"] },
      { title: "YASAMA", subtopics: null },
    ]);
    expect(terms).toEqual([
      "Anayasa Hukuku Vize",
      "Yasama",
      "Yürütme",
      "Kanun yapım süreci",
      "Meclis soruşturması",
      "Cumhurbaşkanlığı kararnamesi",
    ]);
  });

  it("çok konulu hazırlıkta sınır: en çok terim sayısı ve metin boyu; kesilen evrensel liste olur, konular kalır", () => {
    const rows = Array.from({ length: 70 }, (_, index) => ({ title: `Organik Kimya Tepkime Mekanizmaları Bölüm ${index + 1}` }));
    const terms = sttTermsFromPrep("Organik Kimya Final", rows);
    expect(terms).toHaveLength(STT_PREP_TERM_MAX);
    const prompt = buildTranscriptionPrompt(terms);
    expect(prompt.length).toBeLessThanOrEqual(STT_PROMPT_MAX_CHARS);
    expect(prompt).toContain("Organik Kimya Final");
    expect(prompt).toContain("Bölüm 1;");
    expect(prompt).toContain("Sık geçen terimler: ");
  });

  it("evrensel listede hazırlıkta zaten geçen terim ikinci kez yazılmaz", () => {
    const prompt = buildTranscriptionPrompt(["integral", "Belirli İntegral"]);
    expect(prompt.match(/integral/g)).toHaveLength(1);
    expect(STT_UNIVERSAL_TERMS).toContain("integral");
  });
});

describe("öğrencinin hazırlığından terimler (veritabanı)", () => {
  const prepRow = { id: PREP, title: "Dahiliye Komite Sınavı", exam_date: null };
  const topics = [
    { title: "Solunum Sistemi", subtopics: ["Obstrüktif akciğer hastalıkları", "Astım"] },
    { title: "Kardiyoloji", subtopics: ["Ritim bozuklukları"] },
  ];

  it("sohbetin hazırlığı öğrencininse terimler o hazırlığın konularından; talimata ve ipucuna girer", async () => {
    const { service, calls } = fakeService({
      exam_preps: (filters) => (filters.id === PREP && filters.user_id === USER ? [prepRow] : []),
      exam_prep_topics: (filters) => (filters.exam_prep_id === PREP ? topics : []),
    });
    const context = await loadVoiceContext(service, USER, { conversationId: null, prepId: PREP, trial: false });
    expect(context.prepId).toBe(PREP);
    expect(context.sttTerms).toEqual([
      "Dahiliye Komite Sınavı",
      "Solunum Sistemi",
      "Kardiyoloji",
      "Obstrüktif akciğer hastalıkları",
      "Astım",
      "Ritim bozuklukları",
    ]);
    expect(context.instructions).toContain("ÖĞRENCİNİN KONULARI");
    expect(context.instructions).toContain("Obstrüktif akciğer hastalıkları");
    const prompt = realtimeSessionConfig({ instructions: context.instructions, sttTerms: context.sttTerms }).audio.input.transcription.prompt;
    expect(prompt).toContain("Obstrüktif akciğer hastalıkları");
    // Konular hazırlığın kimliğiyle okunur; en yeni hazırlık ayrıca aranmaz.
    expect(calls.filter((call) => call.table === "exam_prep_topics").every((call) => call.filters.exam_prep_id === PREP)).toBe(true);
    expect(calls.filter((call) => call.table === "exam_preps")).toHaveLength(1);
  });

  it("sohbet hazırlığa bağlı değilse öğrencinin kendi en yeni hazırlığı (yalnız terim için; talimatta aktif hazırlık yazmaz)", async () => {
    const { service, calls } = fakeService({
      exam_preps: (filters) => (filters.user_id === USER ? [prepRow] : []),
      exam_prep_topics: (filters) => (filters.exam_prep_id === PREP ? topics : []),
    });
    const context = await loadVoiceContext(service, USER, { conversationId: null, prepId: null, trial: false });
    expect(context.prepId).toBeNull();
    expect(context.sttTerms).toContain("Solunum Sistemi");
    expect(context.instructions).not.toContain("AKTİF HAZIRLIK");
    expect(calls.find((call) => call.table === "exam_preps")?.filters.user_id).toBe(USER);
  });

  it("başkasının hazırlığı verilirse terim okunmaz (konu tablosuna hiç sorulmaz)", async () => {
    const { service, calls } = fakeService({
      exam_preps: () => [],
      exam_prep_topics: () => [{ title: "Başkasının Konusu" }],
    });
    const context = await loadVoiceContext(service, USER, { conversationId: null, prepId: OTHER_PREP, trial: false });
    expect(context.prepId).toBeNull();
    expect(context.sttTerms).toEqual([]);
    expect(calls.some((call) => call.table === "exam_prep_topics")).toBe(false);
    expect(context.instructions).not.toContain("Başkasının Konusu");
  });

  it("alt başlık sütunu yoksa yalnız başlıklarla; okuma tümden düşerse ders yine başlar", async () => {
    const withoutColumn = fakeService({
      exam_preps: () => [prepRow],
      exam_prep_topics: (_filters, columns) => (columns.includes("subtopics") ? { error: true } : [{ title: "Limit" }, { title: "Türev" }]),
    });
    const first = await loadVoiceContext(withoutColumn.service, USER, { conversationId: null, prepId: PREP, trial: false });
    expect(first.sttTerms).toEqual(["Dahiliye Komite Sınavı", "Limit", "Türev"]);

    const broken = fakeService({ exam_preps: () => [prepRow], exam_prep_topics: () => ({ error: true }) });
    const second = await loadVoiceContext(broken.service, USER, { conversationId: null, prepId: PREP, trial: false });
    expect(second.sttTerms).toEqual(["Dahiliye Komite Sınavı"]);
    expect(second.instructions).toContain("KONUŞMA BİÇİMİ");
  });
});

describe("talimat: gereksiz doğrulatma yok", () => {
  const base = { name: null, calibration: "", context: "", prep: null, history: [], trial: false };

  it("eski 'duyduğunu doğrulat' kuralı yok; yerinde bağlamdan tamamlama kuralı var", () => {
    const text = buildRealtimeInstructions(base);
    expect(text).toContain(VOICE_HEARING_RULE);
    expect(VOICE_TALK_RULES).toContain(VOICE_HEARING_RULE);
    expect(text).not.toMatch(/tekrar edip doğrulat/);
    expect(VOICE_HEARING_RULE).toMatch(/Bağlamdan ne demek istediği açıkça belliyse/);
    expect(VOICE_HEARING_RULE).toMatch(/konuşmayı bölme/);
    // Gerçek belirsizlikte sormak ve konu uydurmamak kuralda duruyor.
    expect(VOICE_HEARING_RULE).toMatch(/gerçekten anlaşılmıyorsa ya da iki tamamen farklı konu arasında/);
    expect(VOICE_HEARING_RULE).toMatch(/tahmin edip başka bir konuya geçme/);
  });

  it("öğrencinin konuları talimata kısa listeyle girer; konu yoksa satır hiç yazılmaz", () => {
    const many = Array.from({ length: 40 }, (_, index) => `Konu ${index + 1}`);
    const text = buildRealtimeInstructions({ ...base, terms: many });
    expect(text).toContain("ÖĞRENCİNİN KONULARI");
    expect(text).toContain(`Konu ${VOICE_TERMS_MAX}.`);
    expect(text).not.toContain(`Konu ${VOICE_TERMS_MAX + 1}`);
    expect(buildRealtimeInstructions(base)).not.toContain("ÖĞRENCİNİN KONULARI");
  });
});

describe("gider kaydı ve göç", () => {
  it("yazıya döküm yeni modelin satırına yazılır; fiyatı küçük modelin iki katı", () => {
    const rows = realtimeUsageRows({ ...emptyUsage(), transcribeAudio: 600 });
    expect(rows).toEqual([{ model: "gpt-4o-transcribe", tokensIn: 180, tokensOut: 0 }]);
    expect(REALTIME_PRICES_PER_1K["gpt-4o-transcribe"]).toEqual({ input: 0.033333, output: 0 });
  });

  it("fiyat göçü yalnız ekler ve uygulanmadı diye işaretli (Burhan'ın onayını bekler)", () => {
    const sql = readFileSync("supabase/migrations/20261121230000_gpt4o_transcribe_price.sql", "utf8");
    expect(sql).toMatch(/YAZILDI, UYGULANMADI/);
    const code = sql.replace(/^--.*$/gm, "");
    expect(code).toMatch(/INSERT INTO public\.ai_model_prices/);
    expect(code).toMatch(/'gpt-4o-transcribe', 0\.033333, 0\.000000/);
    expect(code).toMatch(/ON CONFLICT \(model\) DO NOTHING/);
    expect(code).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|ALTER)\b/i);
  });
});
