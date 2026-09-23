import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/*
  Seslendirme 18 Eylül 2026'ya kadar bedavaydı ve bu bilerek öyleydi:
  "ses düğümün bedeline dahil". Ölçüm kararı bozdu — podcast senaryosu
  1 kredi (`AI_CHAT_STANDARD`) düşerken, o senaryonun sesi fiyat tablosuna
  göre bunun kat kat üzerine mal oluyordu.

  Bu dosya yeni kuralın üç kırılgan yerini tutuyor:

  1. Önbellekten gelen ses BEDAVA kalmalı. Önbellek içerik adresli ve
     paylaşımlı; bize maliyeti olmayan bir isabeti faturalandırmak, öğrenciden
     karşılığı olmayan para almak olurdu.
  2. Üretilemeyen ses ÜCRETSİZ kalmalı — ayrılan kredi iade edilmeli.
  3. Kredisi biten bir PLUS ABONESİNE "Plus'a bak" denmemeli. Oynatıcı 402'yi
     tek başına premium reddi sayıyordu; seslendirme krediye bağlanınca aynı
     kod yolu abonenin yüzüne yanlış cümleyi çıkarırdı.
*/

const mocks = vi.hoisted(() => ({
  reserveCredits: vi.fn(),
  commitCredits: vi.fn(),
  refundCredits: vi.fn(),
  recordUsage: vi.fn(),
  synthesizeLine: vi.fn(),
}));

vi.mock("@/lib/credits/service", () => ({
  reserveCredits: mocks.reserveCredits,
  commitCredits: mocks.commitCredits,
  refundCredits: mocks.refundCredits,
  recordUsage: mocks.recordUsage,
}));

vi.mock("@/lib/ai/speech", async () => {
  const { createHash } = await import("node:crypto");
  return {
    // Gerçek karma ile aynı sözleşme: metin + konuşmacı içerik anahtarı.
    audioHash: (text: string, speaker: string) =>
      createHash("sha256").update(`${speaker}|${text.trim()}`).digest("hex"),
    synthesizeLine: mocks.synthesizeLine,
    voiceFor: (speaker: string) => speaker,
  };
});

const {
  AUDIO_CHARS_PER_CREDIT,
  audioCreditUnits,
  audioIdempotencyKey,
  countNewAudioChars,
  synthesizeCharged,
} = await import("@/lib/learning/audio-cache");

type Row = { storage_path: string; duration_ms: number };

/** `lesson_audio` + storage'ın testte yeten kadarı. */
function fakeService(options: { cachedTexts?: string[]; uploadFails?: boolean } = {}) {
  const rows = new Map<string, Row>();
  const hash = (text: string, speaker: string) =>
    createHash("sha256").update(`${speaker}|${text.trim()}`).digest("hex");

  for (const text of options.cachedTexts ?? []) {
    const h = hash(text, "ada");
    rows.set(h, { storage_path: `ab/${h}.mp3`, duration_ms: 1000 });
  }

  return {
    rows,
    from() {
      return {
        select: () => ({
          in: (_column: string, hashes: string[]) =>
            Promise.resolve({
              data: hashes
                .filter((h) => rows.has(h))
                .map((h) => ({ hash: h, ...rows.get(h)! })),
              error: null,
            }),
        }),
        upsert: (incoming: { hash: string; storage_path: string; duration_ms: number }[]) => {
          for (const row of incoming) {
            rows.set(row.hash, {
              storage_path: row.storage_path,
              duration_ms: row.duration_ms,
            });
          }
          return Promise.resolve({ error: null });
        },
        update: () => ({ in: () => Promise.resolve({ error: null }) }),
      };
    },
    storage: {
      from: () => ({
        upload: () =>
          Promise.resolve({ error: options.uploadFails ? { message: "nope" } : null }),
        createSignedUrls: (paths: string[]) =>
          Promise.resolve({
            data: paths.map((p) => ({ signedUrl: `https://cdn.test/${p}` })),
            error: null,
          }),
      }),
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asService = (s: ReturnType<typeof fakeService>) => s as any;

const line = (text: string) => ({ text, speaker: "ada" as const });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reserveCredits.mockResolvedValue({ ok: true, reservationId: "res-1", cost: 1 });
  mocks.synthesizeLine.mockImplementation(async (text: string) => ({
    audio: Buffer.from("mp3"),
    durationMs: 1234,
    chars: text.length,
  }));
});

describe("karakterden krediye çevrim", () => {
  it("bir kredi 900 karakter", () => {
    expect(AUDIO_CHARS_PER_CREDIT).toBe(900);
  });

  it("üretilecek hiçbir şey yoksa kredi de yok", () => {
    expect(audioCreditUnits(0)).toBe(0);
  });

  /* Yukarı yuvarlıyor: 901 karakter iki kredi. Aşağı yuvarlamak, her istekte
     900 karaktere kadar bedava ses dağıtmak olurdu. */
  it("yukarı yuvarlıyor", () => {
    expect(audioCreditUnits(1)).toBe(1);
    expect(audioCreditUnits(900)).toBe(1);
    expect(audioCreditUnits(901)).toBe(2);
    expect(audioCreditUnits(4500)).toBe(5);
  });
});

describe("yalnızca gerçekten üretilecek karakter sayılıyor", () => {
  it("önbellekteki cümle sayılmıyor", async () => {
    const service = fakeService({ cachedTexts: ["Merhaba dünya"] });
    const chars = await countNewAudioChars(asService(service), [
      line("Merhaba dünya"),
      line("Yeni cümle"),
    ]);
    expect(chars).toBe("Yeni cümle".length);
  });

  it("aynı cümle listede iki kez geçerse bir kez sayılıyor", async () => {
    const service = fakeService();
    const chars = await countNewAudioChars(asService(service), [
      line("Tekrar"),
      line("Tekrar"),
    ]);
    // `ensureAudio` de bir kez üretiyor; iki kez saymak üretilmeyen sese
    // para almak olurdu.
    expect(chars).toBe("Tekrar".length);
  });

  it("hepsi önbellekteyse sıfır", async () => {
    const service = fakeService({ cachedTexts: ["A", "B"] });
    expect(
      await countNewAudioChars(asService(service), [line("A"), line("B")]),
    ).toBe(0);
  });
});

describe("ücretli seslendirme yolu", () => {
  it("112 satırı tek rezervasyonla, sınırlı eşzamanlılıkla eksiksiz üretir", async () => {
    let active = 0;
    let peak = 0;
    mocks.synthesizeLine.mockImplementation(async (text: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { audio: Buffer.from("mp3"), durationMs: 1234, chars: text.length };
    });
    const lines = Array.from({ length: 112 }, (_, i) => line(`Cümle ${i}.`));
    const result = await synthesizeCharged(asService(fakeService()), "user-1", lines);
    expect(result.ok && result.tracks.length).toBe(112);
    expect(peak).toBeLessThanOrEqual(8);
    expect(mocks.reserveCredits).toHaveBeenCalledTimes(1);
    expect(mocks.reserveCredits.mock.calls[0][4]).toBe(audioCreditUnits(lines.reduce((s, l) => s + l.text.length, 0)));
    expect(mocks.commitCredits).toHaveBeenCalledTimes(1);
  });

  it("geç bir parçadaki ağ hatası tüm ses rezervasyonunu iade eder", async () => {
    mocks.synthesizeLine.mockImplementation(async (text: string) => {
      if (text === "Cümle 70.") throw new Error("network");
      return { audio: Buffer.from("mp3"), durationMs: 1234, chars: text.length };
    });
    const result = await synthesizeCharged(asService(fakeService()), "user-1",
      Array.from({ length: 112 }, (_, i) => line(`Cümle ${i}.`)));
    expect(result).toEqual({ ok: false, reason: "audio_unavailable" });
    expect(mocks.refundCredits).toHaveBeenCalledTimes(1);
    expect(mocks.commitCredits).not.toHaveBeenCalled();
  });
  it("her şey önbellekten geliyorsa cüzdana hiç dokunmuyor", async () => {
    const service = fakeService({ cachedTexts: ["A", "B"] });
    const result = await synthesizeCharged(asService(service), "user-1", [
      line("A"),
      line("B"),
    ]);

    expect(result.ok).toBe(true);
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
    if (result.ok) expect(result.creditsSpent).toBe(0);
  });

  it("üretim öncesi kredi ayırıyor ve miktarı karakterden buluyor", async () => {
    const service = fakeService();
    const text = "x".repeat(1800); // iki kredilik
    await synthesizeCharged(asService(service), "user-1", [line(text)]);

    expect(mocks.reserveCredits).toHaveBeenCalledTimes(1);
    const [, userId, actionCode, , quantity] = mocks.reserveCredits.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(actionCode).toBe("AUDIO_SYNTHESIZE");
    expect(quantity).toBe(2);
  });

  /* Kredi ayrılmadan üretime girilirse ödeme yapılmayan ses üretilmiş olur. */
  it("kredi yetmiyorsa hiç üretmiyor", async () => {
    mocks.reserveCredits.mockResolvedValue({
      ok: false,
      reason: "insufficient_credits",
    });
    const service = fakeService();
    const result = await synthesizeCharged(asService(service), "user-1", [
      line("Yeni"),
    ]);

    expect(result).toEqual({ ok: false, reason: "insufficient_credits" });
    expect(mocks.synthesizeLine).not.toHaveBeenCalled();
  });

  it("üretim başarısızsa krediyi iade ediyor", async () => {
    const service = fakeService({ uploadFails: true });
    const result = await synthesizeCharged(asService(service), "user-1", [
      line("Yeni"),
    ]);

    expect(result).toEqual({ ok: false, reason: "audio_unavailable" });
    expect(mocks.refundCredits).toHaveBeenCalledWith(expect.anything(), "res-1");
    expect(mocks.commitCredits).not.toHaveBeenCalled();
  });

  it("üretim başarılıysa krediyi işliyor", async () => {
    const service = fakeService();
    const result = await synthesizeCharged(asService(service), "user-1", [
      line("Yeni"),
    ]);

    expect(result.ok).toBe(true);
    expect(mocks.commitCredits).toHaveBeenCalledWith(expect.anything(), "res-1");
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  /* Öğrenci "dinle"ye iki kez basarsa iki istek yan yana çalışır. Anahtar
     istenen listeden türediği için ikisi de aynı; `credit_reserve` ikinciye
     birincinin ayırmasını döndürür ve öğrenci bir kez öder. */
  it("aynı istek aynı ayırma anahtarını üretiyor", () => {
    const lines = [line("Bir"), line("İki")];
    expect(audioIdempotencyKey("user-1", lines)).toBe(
      audioIdempotencyKey("user-1", lines),
    );
  });

  it("başka kullanıcı ve başka içerik başka anahtar", () => {
    const lines = [line("Bir")];
    expect(audioIdempotencyKey("user-1", lines)).not.toBe(
      audioIdempotencyKey("user-2", lines),
    );
    expect(audioIdempotencyKey("user-1", lines)).not.toBe(
      audioIdempotencyKey("user-1", [line("Başka")]),
    );
  });
});

describe("migration", () => {
  const sql = readFileSync(
    "supabase/migrations/20260918090000_audio_credits.sql",
    "utf8",
  );

  it("seslendirme kuralı 900 karakter başına 1 kredi", () => {
    expect(sql).toMatch(/'AUDIO_SYNTHESIZE',\s*1,\s*'standard'/);
  });

  it("credit_reserve miktar alıyor ve varsayılanı 1", () => {
    expect(sql).toMatch(/p_quantity integer DEFAULT 1/);
  });

  it("bedeli miktarla çarpıyor", () => {
    expect(sql).toMatch(/v_cost := v_cost \* LEAST\(GREATEST\(COALESCE\(p_quantity, 1\), 1\), 1000\)/);
  });

  /* Eski imza bırakılırsa `credit_reserve(a,b,c)` iki işleve birden uyar ve
     PostgREST çağrıyı belirsiz bulur. */
  it("eski üç argümanlı imzayı düşürüyor", () => {
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.credit_reserve(uuid, text, text);",
    );
  });

  /* Haftalık plan migration'ının yazılı dersi: CREATE OR REPLACE `search_path`
     ayarını korumuyor, yetkiler de yeni imzaya taşınmıyor. Yeni imza için
     üçünün de tekrarlanması gerekiyor — yoksa SECURITY DEFINER bir fonksiyon
     sabitlenmemiş arama yoluyla ve herkese açık EXECUTE ile kalır. */
  it("yeni imzanın search_path ve yetkileri yeniden yazılıyor", () => {
    expect(sql).toMatch(
      /ALTER FUNCTION public\.credit_reserve\(uuid, text, text, integer\) SET search_path/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.credit_reserve\(uuid, text, text, integer\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.credit_reserve\(uuid, text, text, integer\) TO service_role/,
    );
  });
});

describe("ses uçları ücretli yoldan geçiyor", () => {
  const routes = [
    "src/app/api/learning/podcast/audio/route.ts",
    "src/app/api/learning/speech/route.ts",
  ];

  /* `ensureAudio` modül dışına kapalı; bu test onun yerine "uç ücretli yoldan
     geçiyor mu" sorusunu tutuyor. İkisi birlikte, seslendirmenin sessizce
     bedavaya dönmesinin iki ayrı yolunu kapatıyor. */
  it.each(routes)("%s ensureAudio'yu doğrudan çağırmıyor", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/\bensureAudio\s*\(/);
    expect(source).toMatch(/\bsynthesizeCharged\s*\(/);
  });

  it.each(routes)("%s kredi yetmediğinde ayrı kod dönüyor", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain('errorResponse(402, "insufficient_credits")');
  });
});

describe("oynatıcı iki ayrı 402'yi ayırıyor", () => {
  const source = readFileSync(
    "src/components/parity/exam-podcast-player.tsx",
    "utf8",
  );

  /* Ayrım yanıttaki `code` alanından geliyor; Türkçe metni karşılaştırmak
     metni değiştiren ilk kişide sessizce kırılırdı. */
  it("kodu okuyor, metni değil", () => {
    expect(source).toContain('body?.code === "insufficient_credits"');
  });

  it("kredisi bitene Plus üyeliği satmıyor", () => {
    // Yalnızca ekrana çıkan dal; `status === "credits"` dosyada bir de
    // oynat düğmesinin mantığında geçiyor.
    const creditsBranch = source.slice(
      source.indexOf(') : status === "credits" ? ('),
      source.indexOf(') : status === "fallback" ? ('),
    );
    expect(creditsBranch).toContain("Kredi ekle");
    expect(creditsBranch).not.toMatch(/Plus/);
  });
});

describe("guards", () => {
  const source = readFileSync("src/lib/api/guards.ts", "utf8");

  it("hata yanıtı makine tarafından okunabilir kod taşıyor", () => {
    expect(source).toMatch(/\{ error: messages\[code\] \?\? "[^"]+", code \}/);
  });
});
