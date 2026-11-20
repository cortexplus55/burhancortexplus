/**
 * Sınav Radyosu (Faz 7, 20 Kasım 2026): hazırlığın kayıtlı podcast'leri sırayla, 0 kredi ve 0 yeni seslendirme.
 * Bekçi: sıra saf işlevden; ses ucu hiçbir planda seslendirme yapmaz, kredi ayırmaz, kullanım yazmaz; önbellekte
 * olmayan tek satır bölümü 409 `not_cached` yapar; sahiplik sunucuda (başka öğrencinin hazırlığı ve bölümü 404).
 * Örnekler konu-bağımsız yer tutucular.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const synthesizeLine = vi.fn(async () => {
  throw new Error("radyo seslendirme çağırmamalı");
});
const reserveCredits = vi.fn(async () => ({ ok: false }));
const commitCredits = vi.fn(async () => undefined);
const refundCredits = vi.fn(async () => undefined);
const recordUsage = vi.fn(async () => undefined);

vi.mock("@/lib/ai/speech", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/speech")>()),
  synthesizeLine,
}));
vi.mock("@/lib/credits/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/credits/service")>()),
  reserveCredits,
  commitCredits,
  refundCredits,
  recordUsage,
}));

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PREP = "33333333-3333-4333-8333-333333333333";
const POD_A = "44444444-4444-4444-8444-444444444444";
const POD_B = "55555555-5555-4555-8555-555555555555";
const POD_C = "66666666-6666-4666-8666-666666666666";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const chaptersOf = (seed: string) => [
  {
    title: `Bölüm ${seed}`,
    lines: [
      { speaker: "ada", text: `Birinci cümle ${seed}.` },
      { speaker: "kerem", text: `İkinci cümle ${seed}?` },
    ],
  },
];

type Row = Record<string, unknown>;

/** Sorgu kurucusu taklidi: eq / in süzgeçleri, order, limit, maybeSingle; update çağrıları kaydedilir. */
function fakeService(tables: Record<string, Row[]>) {
  const updates: { table: string; values: Row }[] = [];
  const signed: string[][] = [];
  const service = {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let limit = Infinity;
      let order: { column: string; ascending: boolean } | null = null;
      let mode: "select" | "update" = "select";
      let values: Row = {};
      const result = () => {
        let rows = (tables[table] ?? []).filter((row) => filters.every((fn) => fn(row)));
        if (order) {
          const { column, ascending } = order;
          rows = [...rows].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
        }
        return rows.slice(0, limit);
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        update: (next: Row) => {
          mode = "update";
          values = next;
          updates.push({ table, values });
          return builder;
        },
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return builder;
        },
        in: (column: string, list: unknown[]) => {
          filters.push((row) => list.includes(row[column]));
          return builder;
        },
        order: (column: string, options: { ascending: boolean }) => {
          order = { column, ascending: options.ascending };
          return builder;
        },
        limit: (count: number) => {
          limit = count;
          return builder;
        },
        maybeSingle: async () => ({ data: mode === "select" ? (result()[0] ?? null) : null, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: mode === "select" ? result() : null, error: null }).then(resolve),
      };
      void values;
      return builder;
    },
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          signed.push(paths);
          return { data: paths.map((path) => ({ signedUrl: `https://cdn.example/${path}?sig=1` })), error: null };
        },
      }),
    },
  };
  return { service, updates, signed };
}

async function hashesFor(chapters: unknown, filter = false) {
  const { audioHash } = await import("@/lib/ai/speech");
  const { flattenLines, normalizeChapters } = await import("@/lib/learning/podcast-script");
  const { podcastLineSpeech } = await import("@/lib/learning/podcast-speech");
  const { studentOutputPayload } = await import("@/lib/learning/student-output-firewall");
  const source = filter ? studentOutputPayload(chapters as unknown[]) : chapters;
  return flattenLines(normalizeChapters(source)).map((line) => audioHash(podcastLineSpeech(line), line.speaker));
}

const cacheRows = (hashes: string[]) =>
  hashes.map((hash) => ({ hash, storage_path: `${hash.slice(0, 2)}/${hash}.mp3`, duration_ms: 1200 }));

beforeEach(() => {
  synthesizeLine.mockClear();
  reserveCredits.mockClear();
  commitCredits.mockClear();
  refundCredits.mockClear();
  recordUsage.mockClear();
});

describe("çalma listesi sırası (saf)", () => {
  it("önce yol / konu sırası, sonra kayıt zamanı; sırada olmayan konu sona; aynı içerik bir kez", async () => {
    const { orderRadioPlaylist } = await import("@/lib/learning/prep-radio");
    const candidates = [
      { id: "c", title: "C", topicLabel: "Üçüncü", topicKey: "ucuncu", createdAt: "2026-11-01T10:00:00Z", signature: "s-c" },
      { id: "a2", title: "A2", topicLabel: "Birinci", topicKey: "birinci", createdAt: "2026-11-03T10:00:00Z", signature: "s-a2" },
      { id: "x", title: "X", topicLabel: "Bilinmeyen", topicKey: "baska", createdAt: "2026-10-01T10:00:00Z", signature: "s-x" },
      { id: "a1", title: "A1", topicLabel: "Birinci", topicKey: "birinci", createdAt: "2026-11-02T10:00:00Z", signature: "s-a1" },
      { id: "b", title: "B", topicLabel: "İkinci", topicKey: "ikinci", createdAt: "2026-11-05T10:00:00Z", signature: "s-b" },
      { id: "dup", title: "B kopya", topicLabel: "İkinci", topicKey: "ikinci", createdAt: "2026-11-06T10:00:00Z", signature: "s-b" },
    ];
    const order = orderRadioPlaylist(candidates, ["birinci", "ikinci", "ucuncu", "birinci"]);
    expect(order.map((item) => item.id)).toEqual(["a1", "a2", "b", "c", "x"]);
    // Konu sırası yoksa yalnız kayıt zamanı (eskiden yeniye), eşitlikte kimlik.
    expect(orderRadioPlaylist(candidates.slice(0, 3), []).map((item) => item.id)).toEqual(["x", "c", "a2"]);
  });

  it("zaman çizelgesi, 15 sn atlama konumu, hız döngüsü ve saat biçimi", async () => {
    const lib = await import("@/lib/learning/prep-radio");
    const timeline = lib.radioTimeline([{ durationMs: 4000 }, { durationMs: 6000 }, { durationMs: 5000 }]);
    expect(timeline).toEqual({ starts: [0, 4000, 10000], totalMs: 15000 });
    expect(lib.locateRadioTime(timeline, 4500)).toEqual({ index: 1, offsetMs: 500 });
    expect(lib.locateRadioTime(timeline, -20_000)).toEqual({ index: 0, offsetMs: 0 });
    expect(lib.locateRadioTime(timeline, 99_000)).toEqual({ index: 2, offsetMs: 4999 });
    expect(lib.RADIO_SKIP_MS).toBe(15_000);
    expect([1, 1.25, 1.5, 2].map((speed) => lib.nextRadioSpeed(speed))).toEqual([1.25, 1.5, 2, 1]);
    expect(lib.radioSpeedLabel(1.25)).toBe("1,25×");
    expect(lib.formatRadioClock(65_400)).toBe("1:05");
    expect(lib.formatRadioClock(3_723_000)).toBe("1:02:03");
    expect(lib.PREP_RADIO_LABEL).toBe("🎧 Sınav Radyosu (Ücretsiz Dinle)");
    expect(lib.radioEntrySub(3)).toContain("0 kredi");
  });
});

describe("yalnız önbellekten ses", () => {
  it("bütün satırlar önbellekteyse imzalı adresler döner; seslendirme, kredi ve kullanım kaydı hiç çağrılmaz", async () => {
    const chapters = chaptersOf("a");
    const hashes = await hashesFor(chapters);
    const { service, signed } = fakeService({
      exam_preps: [{ id: PREP, user_id: USER }],
      exam_prep_podcasts: [{ id: POD_A, exam_prep_id: PREP, user_id: USER, topic_key: "birinci", topic_label: "Birinci", title: "Bir", chapters, created_at: "2026-11-01" }],
      lesson_audio: cacheRows(hashes),
    });
    const { radioEpisodeAudio } = await import("@/lib/learning/prep-radio-server");
    const out = await radioEpisodeAudio(service as never, { prepId: PREP, userId: USER, podcastId: POD_A });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0]).toMatchObject({ speaker: "ada", durationMs: 1200, text: "Birinci cümle a." });
    expect(out.lines[0].url).toMatch(/^https:\/\/cdn\.example\//);
    expect(signed).toHaveLength(1);
    expect(synthesizeLine).not.toHaveBeenCalled();
    expect(reserveCredits).not.toHaveBeenCalled();
    expect(commitCredits).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("tek satır bile önbellekte yoksa not_cached; yine hiçbir şey üretilmez ve ücretlenmez", async () => {
    const chapters = chaptersOf("b");
    const hashes = await hashesFor(chapters);
    const { service } = fakeService({
      exam_preps: [{ id: PREP, user_id: USER }],
      exam_prep_podcasts: [{ id: POD_B, exam_prep_id: PREP, user_id: USER, topic_key: "ikinci", topic_label: "İkinci", title: "İki", chapters, created_at: "2026-11-01" }],
      lesson_audio: cacheRows(hashes.slice(0, 1)),
    });
    const { radioEpisodeAudio } = await import("@/lib/learning/prep-radio-server");
    expect(await radioEpisodeAudio(service as never, { prepId: PREP, userId: USER, podcastId: POD_B })).toEqual({ ok: false, code: "not_cached" });
    expect(synthesizeLine).not.toHaveBeenCalled();
    expect(reserveCredits).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("sahiplik: başka öğrencinin hazırlığı ya da bölümü not_found", async () => {
    const chapters = chaptersOf("c");
    const hashes = await hashesFor(chapters);
    const { service } = fakeService({
      exam_preps: [{ id: PREP, user_id: OTHER }],
      exam_prep_podcasts: [{ id: POD_C, exam_prep_id: PREP, user_id: OTHER, topic_key: "k", topic_label: "K", title: "K", chapters, created_at: "2026-11-01" }],
      lesson_audio: cacheRows(hashes),
    });
    const { radioEpisodeAudio } = await import("@/lib/learning/prep-radio-server");
    expect(await radioEpisodeAudio(service as never, { prepId: PREP, userId: USER, podcastId: POD_C })).toEqual({ ok: false, code: "not_found" });
  });

  it("öğrenci-çıktı süzgecinden geçmiş metinle üretilmiş ses de bulunur (yol adımının oynatıcısı süzülmüş metni ister)", async () => {
    const chapters = [{ title: "Bölüm", lines: [{ speaker: "ada", text: "Ada: Birinci cümle süzgeçli." }] }];
    const filtered = await hashesFor(chapters, true);
    const raw = await hashesFor(chapters, false);
    const { service } = fakeService({
      exam_preps: [{ id: PREP, user_id: USER }],
      exam_prep_podcasts: [{ id: POD_A, exam_prep_id: PREP, user_id: USER, topic_key: "k", topic_label: "K", title: "K", chapters, created_at: "2026-11-01" }],
      lesson_audio: cacheRows(filtered),
    });
    const { radioEpisodeAudio } = await import("@/lib/learning/prep-radio-server");
    const out = await radioEpisodeAudio(service as never, { prepId: PREP, userId: USER, podcastId: POD_A });
    expect(filtered.join()).not.toBe(raw.join());
    expect(out.ok && out.lines[0].text).toBe("Birinci cümle süzgeçli.");
  });

  it("sayfa listesi yalnız tamamen önbellekteki bölümleri konu sırasıyla verir", async () => {
    const [a, b, c] = [chaptersOf("liste-a"), chaptersOf("liste-b"), chaptersOf("liste-c")];
    const [ha, hb, hc] = await Promise.all([hashesFor(a), hashesFor(b), hashesFor(c)]);
    const { podcastTopicKey } = await import("@/lib/learning/podcast-episode");
    const { service } = fakeService({
      exam_prep_podcasts: [
        { id: POD_A, exam_prep_id: PREP, user_id: USER, topic_key: podcastTopicKey("İkinci konu"), topic_label: "İkinci konu", title: "İki", chapters: a, created_at: "2026-11-01T00:00:00Z" },
        { id: POD_B, exam_prep_id: PREP, user_id: USER, topic_key: `${podcastTopicKey("Birinci konu")}#plain`, topic_label: "Birinci konu", title: "Bir", chapters: b, created_at: "2026-11-02T00:00:00Z" },
        { id: POD_C, exam_prep_id: PREP, user_id: USER, topic_key: podcastTopicKey("Birinci konu"), topic_label: "Birinci konu", title: "Eksik", chapters: c, created_at: "2026-11-03T00:00:00Z" },
        { id: "77777777-7777-4777-8777-777777777777", exam_prep_id: PREP, user_id: OTHER, topic_key: "x", topic_label: "X", title: "Başkası", chapters: a, created_at: "2026-11-01T00:00:00Z" },
      ],
      lesson_audio: cacheRows([...ha, ...hb, ...hc.slice(1)]),
    });
    const { loadPrepRadio } = await import("@/lib/learning/prep-radio-server");
    const items = await loadPrepRadio(service as never, { prepId: PREP, userId: USER, topicLabels: ["Birinci konu", "İkinci konu"] });
    expect(items.map((item) => item.id)).toEqual([POD_B, POD_A]);
    expect(synthesizeLine).not.toHaveBeenCalled();
  });

  it("kaynak bekçisi: radyo dosyalarında seslendirme ya da kredi yolu yok; ses ucu ile radyo aynı okunuşu kullanır", () => {
    for (const file of ["src/lib/learning/prep-radio-server.ts", "src/app/api/learning/exam-prep/radio/route.ts", "src/components/parity/prep-radio.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/synthesize(?:Charged|Shared|Line)\s*\(|reserveCredits\s*\(|commitCredits\s*\(|recordUsage\s*\(|\/api\/learning\/podcast\/audio/);
    }
    const cache = read("src/lib/learning/audio-cache.ts");
    const fn = cache.slice(cache.indexOf("export async function cachedAudioOnly"), cache.indexOf("export async function synthesizeShared"));
    expect(fn).not.toMatch(/synthesizeLine\(|reserveCredits\(|recordUsage\(|ensureAudio\(/);
    expect(read("src/app/api/learning/podcast/audio/route.ts")).toContain("podcastLineSpeech(line)");
    expect(read("src/lib/learning/prep-radio-server.ts")).toContain("podcastLineSpeech(line)");
  });
});

describe("radyo ucu", () => {
  it("önbellekte olmayan bölüm 409 not_cached, hazır bölüm 200 ve 0 kredi; geçersiz gövde 400", async () => {
    vi.resetModules();
    const chapters = chaptersOf("uc");
    const hashes = await hashesFor(chapters);
    const missing = chaptersOf("uc-eksik");
    const { service } = fakeService({
      exam_preps: [{ id: PREP, user_id: USER }],
      exam_prep_podcasts: [
        { id: POD_A, exam_prep_id: PREP, user_id: USER, topic_key: "k", topic_label: "K", title: "Hazır", chapters, created_at: "2026-11-01" },
        { id: POD_B, exam_prep_id: PREP, user_id: USER, topic_key: "k", topic_label: "K", title: "Eksik", chapters: missing, created_at: "2026-11-01" },
      ],
      lesson_audio: cacheRows(hashes),
    });
    vi.doMock("@/lib/api/guards", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/api/guards")>()),
      withUser: vi.fn(async () => ({ ok: true, ctx: { userId: USER, service } })),
    }));
    const { POST } = await import("@/app/api/learning/exam-prep/radio/route");
    const call = (body: unknown) =>
      POST(new Request("http://localhost/api/learning/exam-prep/radio", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

    const ok = await call({ prepId: PREP, podcastId: POD_A });
    expect(ok.status).toBe(200);
    const okBody = (await ok.json()) as { creditsSpent: number; lines: unknown[] };
    expect(okBody.creditsSpent).toBe(0);
    expect(okBody.lines).toHaveLength(2);

    const skip = await call({ prepId: PREP, podcastId: POD_B });
    expect(skip.status).toBe(409);
    expect(((await skip.json()) as { code: string }).code).toBe("not_cached");

    expect((await call({ prepId: "x", podcastId: POD_A })).status).toBe(400);
    expect(synthesizeLine).not.toHaveBeenCalled();
    expect(reserveCredits).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/api/guards");
  });
});
