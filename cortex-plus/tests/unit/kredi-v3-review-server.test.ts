import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "./helpers/fake-supabase";

vi.mock("server-only", () => ({}));

const { nodeFreeMeter } = await import("@/lib/billing/node-free-meter");
const { reserveCredits } = await import("@/lib/credits/service");
const { errorResponse } = await import("@/lib/api/guards");
const { loadReferralSummary, perEach, referralPitch, referralStatus, referralSteps } = await import(
  "@/lib/credits/referral"
);

/**
 * Kredi v3 incelemesi (24 Ekim 2026), sunucu tarafı: ders sayılan kayıt, hazırlık geneli adımın sayacı,
 * sayaç fonksiyonu yokken eski yola düşüş, davet hediyesinin durumu ve ücretsiz sınır cümleleri.
 */
const read = (path: string) => readSource(path).replace(/\r\n/g, "\n");

const USER = "user-1";
const PREP = "prep-1";

function prepDb(attempts: Record<string, unknown>[]) {
  return makeFakeDb({
    exam_prep_nodes: [
      { id: "lesson-a", exam_prep_id: PREP, kind: "lesson" },
      { id: "lesson-b", exam_prep_id: PREP, kind: "lesson" },
      { id: "quiz-a", exam_prep_id: PREP, kind: "quiz" },
    ],
    exam_prep_node_attempts: attempts.map((row) => ({ exam_prep_id: PREP, user_id: USER, ...row })),
  });
}

describe("ders açılmış sayılan kayıt (bulgu 6)", () => {
  /* Ders hakkı bitmiş öğrenci dersi açar, kapı çıkar; rota önce `creating` satırı yazıp üretim düşünce
     `failed` yapıyordu. Bu satır "ders açıldı" sayılınca "Başka birini seç" ile o konunun testi derse dahil
     (bedava) açılıyordu — her konuda tekrar edilebilirdi. */
  it("düşen ya da yazımı süren ders denemesi o konunun testini derse dahil yapmaz", async () => {
    for (const status of ["failed", "creating"]) {
      const { client } = prepDb([{ node_id: "lesson-a", topic_id: "topic-a", status, payload: null }]);
      const meter = await nodeFreeMeter(client, { userId: USER, prepId: PREP, kind: "quiz", topicId: "topic-a" });
      expect(meter, status).toBe("lesson");
    }
  });

  it("içeriği boş kayıt da sayılmaz", async () => {
    const { client } = prepDb([{ node_id: "lesson-a", topic_id: "topic-a", status: "active", payload: null }]);
    expect(await nodeFreeMeter(client, { userId: USER, prepId: PREP, kind: "quiz", topicId: "topic-a" })).toBe("lesson");
  });

  it("öğrenciye verilmiş ders (active ya da completed, içerik dolu) testi derse dahil yapar", async () => {
    for (const status of ["active", "completed"]) {
      const { client } = prepDb([
        { node_id: "lesson-a", topic_id: "topic-a", status: "failed", payload: null },
        { node_id: "lesson-a", topic_id: "topic-a", status, payload: { format: 3 } },
      ]);
      const meter = await nodeFreeMeter(client, { userId: USER, prepId: PREP, kind: "quiz", topicId: "topic-a" });
      expect(meter, status).toBe("included");
    }
  });

  it("başka konunun verilmiş dersi bu konunun testini dahil yapmaz", async () => {
    const { client } = prepDb([{ node_id: "lesson-b", topic_id: "topic-b", status: "completed", payload: { format: 3 } }]);
    expect(await nodeFreeMeter(client, { userId: USER, prepId: PREP, kind: "quiz", topicId: "topic-a" })).toBe("lesson");
  });
});

describe("hazırlık geneli adımın sayacı (bulgu 7)", () => {
  /* Boşluklar, odaklı pratik, son kontrol ve son kartlar konusuz: devraldığı 1. konu ya da yöneldiği zayıf
     konu sayacı belirlemez; hazırlıkta herhangi bir ders verilmişse derse dahil. */
  it("konusuz adım hazırlıktaki herhangi bir verilmiş derse bakar", async () => {
    const delivered = prepDb([{ node_id: "lesson-b", topic_id: "topic-b", status: "completed", payload: { format: 3 } }]);
    expect(await nodeFreeMeter(delivered.client, { userId: USER, prepId: PREP, kind: "flashcards", topicId: null }))
      .toBe("included");
    const failedOnly = prepDb([{ node_id: "lesson-b", topic_id: "topic-b", status: "failed", payload: null }]);
    expect(await nodeFreeMeter(failedOnly.client, { userId: USER, prepId: PREP, kind: "flashcards", topicId: null }))
      .toBe("lesson");
  });

  it("rota hazırlık geneli adımı konusuz sorar; seçilen konu ve uyarlamalı odaklı pratik konusuyla", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain(
      "PREP_WIDE_TARGET_KINDS.has(kind) && !requestedTopic && !adaptiveFocusTopic(kind, node.session_meta, topicLabel);",
    );
    expect(route).toContain("topicId: prepWideStep ? null : (topic?.id ?? null)");
  });
});

describe("sayaç fonksiyonu yokken eski yola düşüş (bulgu 24)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("tek satır yapılandırılmış uyarı yazar; öğrenci metni yok", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const calls: string[] = [];
    const service = {
      rpc: vi.fn(async (name: string) => {
        calls.push(name);
        if (name === "credit_reserve_metered") {
          return { data: null, error: { code: "PGRST202", message: "Could not find the function public.credit_reserve_metered" } };
        }
        if (name === "credit_reserve") return { data: "res-1", error: null };
        if (name === "credit_claim_operation") return { data: { state: "claimed", amount: 30 }, error: null };
        return { data: null, error: null };
      }),
    };
    const result = await reserveCredits(service as never, USER, "STUDY_PLAN_GENERATE", "key-1");
    expect(result).toEqual({ ok: true, reservationId: "res-1", cost: 30 });
    expect(calls).toEqual(["credit_reserve_metered", "credit_reserve", "credit_claim_operation"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("credit_reserve_metered_missing", { actionCode: "STUDY_PLAN_GENERATE", meter: "lesson" });
  });

  it("fonksiyon varken uyarı yok", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = {
      rpc: vi.fn(async (name: string) =>
        name === "credit_claim_operation" ? { data: { state: "claimed", amount: 3 }, error: null } : { data: "res-2", error: null },
      ),
    };
    await reserveCredits(service as never, USER, "AI_CHAT_STANDARD", "key-2");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("sesli ders reddi (bulgu 10/12)", () => {
  /* Ücretsiz hesapta VOICE_TURN Plus'ta: SQL `plus_required` döner. Rota düz `insufficient_credits`
     yazınca ekran "hakkın doldu" ve Pazartesi geri sayımı gösteriyordu. */
  it("ret kodu refusalCode'dan", () => {
    const voice = read("src/app/api/learning/exam-prep/voice/route.ts");
    expect(voice).toContain(
      'return errorResponse(reservation.reason === "insufficient_credits" ? 402 : 409, refusalCode(reservation));',
    );
    expect(voice).not.toContain("409, reservation.reason)");
  });
});

type LedgerRow = { user_id: string; idempotency_key: string };

function referralClient(options: { summary?: Record<string, unknown> | null; ledger?: LedgerRow[]; ledgerError?: boolean }) {
  const filters: { user_id?: string; like?: string } = {};
  const ledgerQuery = {
    select: () => ledgerQuery,
    eq: (column: string, value: string) => {
      if (column === "user_id") filters.user_id = value;
      return ledgerQuery;
    },
    like: (_column: string, pattern: string) => {
      filters.like = pattern;
      return ledgerQuery;
    },
    limit: async () => {
      if (options.ledgerError) return { data: null, error: { message: "permission denied" } };
      const prefix = (filters.like ?? "").replace(/%$/, "");
      return {
        data: (options.ledger ?? []).filter((row) => row.user_id === filters.user_id && row.idempotency_key.startsWith(prefix)),
        error: null,
      };
    },
  };
  return {
    rpc: vi.fn(async () =>
      options.summary === null ? { data: null, error: { message: "missing" } } : { data: [options.summary], error: null },
    ),
    from: vi.fn(() => ledgerQuery),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
  };
}

const summaryRow = (row: Partial<Record<string, unknown>> = {}) => ({
  used_count: 0,
  max_count: 3,
  subscribed_count: 0,
  multiplier: 1,
  is_invitee: false,
  signup_multiplier: 3,
  subscribed_multiplier: 10,
  ...row,
});

describe("davet hediyesinin durumu yazılmış hediyeden (bulgu 27)", () => {
  /* Sayılan davet (hesabını doğrulamış davetli) hediye demek değil: hediye davetli ilk çalışmasını
     yapınca yazılıyor. Eski satır doğrulayıp hiç çalışmamış arkadaş için de "her biri için 3 ders hediye"
     diyordu, davet edenin bakiyesi 0'ken. */
  it("davetli sayılmış ama hediye yazılmamışsa hediye eklendi demez, bekliyor der", async () => {
    const client = referralClient({ summary: summaryRow({ used_count: 2 }), ledger: [] });
    const summary = await loadReferralSummary(client as never, USER);
    expect(summary).toMatchObject({ available: true, usedCount: 2, giftsGranted: 0, giftReceived: false, giftsKnown: true });
    const status = referralStatus(summary)!;
    expect(status).not.toContain("eklendi");
    expect(status).toContain("2 arkadaşın için hediye bekliyor");
    expect(status).toContain("hesabını doğrulayıp ilk çalışmasını yapınca");
  });

  it("yalnız yazılmış hediyeyi sayar; başka kullanıcının satırını ve başka anahtarı saymaz", async () => {
    const client = referralClient({
      summary: summaryRow({ used_count: 3 }),
      ledger: [
        { user_id: USER, idempotency_key: "referral-gift-inviter:friend-1" },
        { user_id: USER, idempotency_key: "referral-gift-inviter:friend-2" },
        { user_id: "someone-else", idempotency_key: "referral-gift-inviter:friend-9" },
        { user_id: USER, idempotency_key: "promo:BETA" },
      ],
    });
    const summary = await loadReferralSummary(client as never, USER);
    expect(summary.giftsGranted).toBe(2);
    expect(referralStatus(summary)).toBe(
      "2 arkadaşın için 3'er ders hediye eklendi. Davetinle katılan 1 arkadaşın için hediye bekliyor: arkadaşın " +
        "hesabını doğrulayıp ilk çalışmasını yapınca ikinize de 3 ders eklenir.",
    );
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it("tavana ulaşan davet eden için bekleyen yok; tek hediye tekil yazılır", async () => {
    const full = await loadReferralSummary(
      referralClient({
        summary: summaryRow({ used_count: 3 }),
        ledger: ["a", "b", "c"].map((id) => ({ user_id: USER, idempotency_key: `referral-gift-inviter:${id}` })),
      }) as never,
      USER,
    );
    expect(referralStatus(full)).toBe("3 arkadaşın için 3'er ders hediye eklendi.");
    const one = await loadReferralSummary(
      referralClient({ summary: summaryRow({ used_count: 1 }), ledger: [{ user_id: USER, idempotency_key: "referral-gift-inviter:a" }] }) as never,
      USER,
    );
    expect(referralStatus(one)).toBe("1 arkadaşın için 3 ders hediye eklendi.");
  });

  it("davetle gelen: hediye yazıldıysa eklendi, yazılmadıysa doğrula ve ilk çalışmanı yap", async () => {
    const waiting = await loadReferralSummary(referralClient({ summary: summaryRow({ is_invitee: true }) }) as never, USER);
    expect(referralStatus(waiting)).toBe("Bir davetle katıldın: hesabını doğrulayıp ilk çalışmanı yapınca 3 ders hediye eklenir.");
    const granted = await loadReferralSummary(
      referralClient({
        summary: summaryRow({ is_invitee: true }),
        ledger: [{ user_id: USER, idempotency_key: `referral-gift:${USER}` }],
      }) as never,
      USER,
    );
    expect(granted.giftReceived).toBe(true);
    expect(referralStatus(granted)).toBe("Davetle katıldığın için 3 ders hediyen eklendi.");
  });

  it("kimlik verilmezse oturumdan alır", async () => {
    const client = referralClient({
      summary: summaryRow({ is_invitee: true }),
      ledger: [{ user_id: USER, idempotency_key: `referral-gift:${USER}` }],
    });
    const summary = await loadReferralSummary(client as never);
    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(summary.giftReceived).toBe(true);
  });

  it("hediye satırları okunamazsa durum satırı hiçbir şey iddia etmez", async () => {
    const summary = await loadReferralSummary(
      referralClient({ summary: summaryRow({ used_count: 2, is_invitee: true }), ledgerError: true }) as never,
      USER,
    );
    expect(summary).toMatchObject({ available: true, giftsKnown: false });
    expect(referralStatus(summary)).toBeNull();
  });

  it("RPC yoksa kart çizilmez", async () => {
    const summary = await loadReferralSummary(referralClient({ summary: null }) as never, USER);
    expect(summary.available).toBe(false);
  });

  it("tanıtım ve adımlar çarpan vaat etmez, doğrulamayı söyler", async () => {
    const summary = await loadReferralSummary(referralClient({ summary: summaryRow() }) as never, USER);
    const copy = [referralPitch(summary), ...referralSteps(summary)].join(" ");
    expect(copy).toContain("hesabını doğrulayıp ilk çalışmasını yapınca");
    expect(copy).toContain("En çok 3 davet");
    expect(copy).not.toMatch(/katına|katlan|çarpan|kredi/i);
  });

  it("üleştirme eki rakama uyar", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 50, 90, 100].map(perEach)).toEqual([
      "1'er", "2'şer", "3'er", "4'er", "5'er", "6'şar", "7'şer", "8'er", "9'ar",
      "10'ar", "20'şer", "30'ar", "50'şer", "90'ar", "100'er",
    ]);
  });
});

describe("ücretsiz sınır cümleleri Plus'ı sınırsız göstermez (bulgu 29)", () => {
  /* Plus'ın da aylık hakkı var (7.200 kredi: ~240 ders, 2.400 mesaj). generation-failure.ts zaten
     "Plus'a geçip beklemeden devam edebilirsin" diyordu; iki yüzey ayrışıyordu. */
  it("402 kodlarının metni", async () => {
    for (const code of ["free_lesson_limit", "free_chat_limit", "free_photo_limit"]) {
      const body = (await (errorResponse(402, code) as Response).json()) as { error: string; code: string };
      expect(body.code).toBe(code);
      expect(body.error, code).toContain("Plus'a geçip beklemeden devam edebilirsin.");
      expect(body.error.toLocaleLowerCase("tr"), code).not.toMatch(/sınır yok|sınırsız|kredi/);
    }
  });

  it("soru çözücünün ret metinleri de aynı", () => {
    const run = read("src/lib/solve/solve-run.ts");
    expect(run).not.toContain("sınır yok");
    expect(run.match(/Plus'a geçip beklemeden devam edebilirsin\./g)?.length).toBe(2);
    expect(read("src/lib/api/guards.ts")).not.toContain("sınır yok");
  });
});
