import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import {
  BOARD_TOOL,
  boardCardMarkdown,
  parseBoardToolArguments,
  sanitizeBoardCard,
} from "@/lib/tutor/realtime/board-cards";
import { composeSavedTurns, conversationTitleFrom, sanitizeTurns } from "@/lib/tutor/realtime/transcript";
import { buildRealtimeInstructions, plainHistoryText } from "@/lib/tutor/realtime-instructions";
import { estimateRealtimeUsd, laterUsage, realtimeUsageRows, sanitizeUsage, USAGE_FIELD_CAP } from "@/lib/tutor/realtime/usage";
import {
  callIdFromLocation,
  createRealtimeCall,
  realtimeSessionConfig,
  REALTIME_CALLS_URL,
  safetyIdentifier,
} from "@/lib/tutor/realtime/openai-call";
import { claimTrial, resolveRealtimeAccess, TRIAL_USAGE_CODE } from "@/lib/tutor/realtime/access";
import { realtimeFixtureEnabled, parseFixtureAccess } from "@/lib/tutor/realtime/fixture";
import { BOARD_BODY_MAX, BOARD_TITLE_MAX, REALTIME_MODEL, REALTIME_VOICE } from "@/lib/tutor/realtime/config";
import { ACTION_LABELS } from "@/lib/admin/labels";
import { STALE_REFUND_ACTION_CODES } from "@/lib/credits/service";

const read = (path: string) => readFileSync(path, "utf8");

describe("tahta kartı süzgeci", () => {
  it("geçerli kartlar; tür, boş metin ve sınır", () => {
    expect(sanitizeBoardCard({ kind: "formula", title: " Alan ", body: "$$A = \\pi r^2$$" })).toEqual({
      kind: "formula",
      title: "Alan",
      body: "$A = \\pi r^2$",
    });
    expect(sanitizeBoardCard({ kind: "concept", title: "Hipotenüs", body: "Dik açının karşısındaki kenar." })).toMatchObject({ kind: "concept" });
    expect(sanitizeBoardCard({ kind: "html", title: "x", body: "y" })).toBeNull();
    expect(sanitizeBoardCard({ kind: "concept", title: "   ", body: "y" })).toBeNull();
    expect(sanitizeBoardCard({ kind: "concept", title: "x", body: "" })).toBeNull();
    expect(sanitizeBoardCard({ kind: "formula", title: "x", body: "$ a $ b $" })).toBeNull();
    const long = sanitizeBoardCard({ kind: "concept", title: "a".repeat(200), body: "b".repeat(900) })!;
    expect(long.title.length).toBeLessThanOrEqual(BOARD_TITLE_MAX);
    expect(long.body.length).toBeLessThanOrEqual(BOARD_BODY_MAX);
    // Formül kısaltılmaz (bozulmasın): sınırı aşan atılır.
    expect(sanitizeBoardCard({ kind: "formula", title: "x", body: `$${"a+".repeat(300)}b$` })).toBeNull();
  });

  it("kontrol ve görünmez karakterler düşer; HTML ekranda kaçışla çizilir (ham basılmaz)", () => {
    const card = sanitizeBoardCard({ kind: "concept", title: `Ba${String.fromCharCode(0x200b)}şlık${String.fromCharCode(7)}`, body: "<img src=x onerror=alert(1)>" })!;
    expect(card.title).toBe("Başlık");
    const component = read("src/components/chat/realtime/realtime-board-card.tsx");
    expect(component).not.toContain("dangerouslySetInnerHTML");
    expect(component).toContain("MathText");
  });

  it("aracın JSON'u; bozuk JSON null; araç tanımı iki tür", () => {
    expect(parseBoardToolArguments('{"kind":"formula","title":"Pisagor","body":"$a^2+b^2=c^2$"}')).toMatchObject({ kind: "formula" });
    expect(parseBoardToolArguments("{bozuk")).toBeNull();
    expect(BOARD_TOOL.name).toBe("tahtaya_yaz");
    expect(BOARD_TOOL.parameters.properties.kind.enum).toEqual(["formula", "concept"]);
  });

  it("sohbete kayıt biçimi: formül kartı ve kilit bilgi", () => {
    expect(boardCardMarkdown({ kind: "formula", title: "Alan", body: "$A=\\pi r^2$" })).toBe("**Alan**\n\n$$A=\\pi r^2$$");
    expect(boardCardMarkdown({ kind: "concept", title: "Hipotenüs", body: "En uzun kenar." })).toBe("==Hipotenüs==: En uzun kenar.");
  });
});

describe("konuşmanın sohbete kaydı", () => {
  it("art arda aynı rol birleşir; boş ve geçersiz satırlar düşer", () => {
    expect(sanitizeTurns([{ role: "user", text: " a " }, { role: "x", text: "b" }, { role: "assistant", text: "" }, null])).toEqual([
      { role: "user", text: "a" },
    ]);
    const messages = composeSavedTurns(
      [
        { role: "assistant", text: "Bir." },
        { role: "assistant", text: "İki." },
        { role: "user", text: "Soru" },
      ],
      [],
    );
    expect(messages).toEqual([
      { role: "assistant", content: "Bir.\n\nİki." },
      { role: "user", content: "Soru" },
    ]);
  });

  it("kart öğrenci satırını gösteriyorsa sonraki öğretmen mesajına; hiç yoksa sona", () => {
    const messages = composeSavedTurns(
      [
        { role: "user", text: "Soru" },
        { role: "assistant", text: "Cevap" },
      ],
      [
        { kind: "concept", title: "Terim", body: "Tanım.", afterTurn: 0 },
        { kind: "concept", title: "Son", body: "Sonda." },
      ],
    );
    expect(messages[1]!.content).toBe("Cevap\n\n==Terim==: Tanım.\n\n==Son==: Sonda.");
  });

  it("başlık öğrencinin ilk cümlesinden; yoksa yedek ad", () => {
    expect(conversationTitleFrom([{ role: "user", content: "Kesirleri anlatır mısın? Bir de örnek ver." }])).toBe("Kesirleri anlatır mısın?");
    expect(conversationTitleFrom([{ role: "assistant", content: "Merhaba" }])).toBe("Sesli ders");
  });
});

describe("talimat", () => {
  const input = {
    name: "Elif",
    calibration: "SEVİYE KALİBRASYONU: Lise (14-18).",
    context: "ÖĞRENCİNİN ÇALIŞMA KAYITLARI (yalnız bu satırlar gerçek kayıttır):\n- Ölçülen konular: zayıf: Kesirler",
    prep: { title: "TYT Matematik", daysLeft: 12 },
    history: [
      { role: "user" as const, text: "**Kesir** nedir? $\\frac{1}{2}$" },
      { role: "assistant" as const, text: "> 📌 Sınav ipucu: ==pay== üstte." },
    ],
    trial: false,
  };

  it("öğrencinin adı, seviyesi, hazırlığı, kayıtları ve son sohbet girer; ses kuralları var", () => {
    const text = buildRealtimeInstructions(input);
    expect(text).toContain("adıyla (Elif)");
    expect(text).toContain("SEVİYE KALİBRASYONU: Lise");
    expect(text).toContain("AKTİF HAZIRLIK: TYT Matematik (sınava 12 gün var)");
    expect(text).toContain("zayıf: Kesirler");
    expect(text).toContain("SON SOHBET");
    expect(text).toMatch(/15-25 saniye/);
    expect(text).toContain("TEK, doğal bir soru");
    expect(text).toContain("benzetme");
    expect(text).toContain("tahtaya_yaz");
    expect(text).toContain("Reddederse ısrar etme");
    expect(text).toContain("Robotik kalıp yok");
    expect(text).not.toContain("DENEME:");
  });

  it("son sohbet düz metin (Markdown okunmaz); iç sistem adı sızmaz", () => {
    const text = buildRealtimeInstructions(input);
    const history = text.slice(text.indexOf("SON SOHBET"));
    expect(history).not.toMatch(/\*\*|==|\$|>/);
    expect(plainHistoryText("**a** ==b== `c` # d")).toBe("a b c d");
    for (const internal of ["exam_prep", "mistake_entries", "ai_usage", "teacher.v2", "credit", "supabase", "REALTIME_", "tutor_"]) {
      expect(text, internal).not.toContain(internal);
    }
  });

  it("ad yoksa ad uydurulmaz; deneme kuralı yalnız denemede", () => {
    const text = buildRealtimeInstructions({ ...input, name: null, history: [], trial: true });
    expect(text).toContain("ad uydurma");
    expect(text).toContain("DENEME:");
    expect(text).toContain("Süreyi, ücreti ya da paketleri anma");
  });
});

describe("kullanım kaydı", () => {
  it("ses, metin, görsel ve önbellekli girdi ayrı model adlarıyla; sıfır satır yazılmaz", () => {
    const usage = sanitizeUsage({ textIn: 1000, textOut: 200, audioIn: 300, audioOut: 1500, cachedText: 4000, transcribeAudio: 100, responses: 3 })!;
    const rows = realtimeUsageRows(usage);
    expect(rows).toEqual([
      { model: REALTIME_MODEL, tokensIn: 1000, tokensOut: 200 },
      { model: `${REALTIME_MODEL}-audio`, tokensIn: 300, tokensOut: 1500 },
      { model: `${REALTIME_MODEL}-cached-text`, tokensIn: 4000, tokensOut: 0 },
      { model: "gpt-4o-mini-transcribe", tokensIn: 30, tokensOut: 0 },
    ]);
    // 1000×0,6 + 200×2,4 + 300×10 + 1500×20 + 4000×0,06 (1M başına) + 30 KB × 0,016667/1000
    expect(estimateRealtimeUsd(usage)).toBeCloseTo(0.03432 + 0.0005, 4);
  });

  it("bozuk sayılar kırpılır; kümülatif görüntü geri gitmez", () => {
    expect(sanitizeUsage({ textIn: -5, audioOut: "x", imageIn: 1e12 })).toMatchObject({ textIn: 0, imageIn: USAGE_FIELD_CAP });
    expect(sanitizeUsage(null)).toBeNull();
    const a = sanitizeUsage({ textIn: 10, audioOut: 50 });
    const b = sanitizeUsage({ textIn: 5, audioOut: 80 });
    expect(laterUsage(a, b)).toMatchObject({ textIn: 10, audioOut: 80 });
  });

  it("fiyat satırları göçte; göç yalnız ekler ve uygulanmadı diye işaretli", () => {
    const sql = read("supabase/migrations/20261121170000_realtime_voice_minute.sql");
    expect(sql).toContain("YAZILDI, UYGULANMADI");
    expect(sql).toContain("('REALTIME_VOICE_MINUTE', 60,");
    for (const model of ["", "-audio", "-image", "-cached-text", "-cached-audio", "-cached-image"]) {
      expect(sql).toContain(`'${REALTIME_MODEL}${model}'`);
    }
    expect(sql.match(/ON CONFLICT \([a-z_]+\) DO NOTHING/g)).toHaveLength(2);
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|DROP|ALTER|CREATE)\b/);
  });

  it("yönetim etiketi Türkçe; dakika kaydı takılı ayırma temizliğinde", () => {
    expect(ACTION_LABELS.REALTIME_VOICE_MINUTE).toMatch(/Canlı sesli öğretmen/);
    expect(ACTION_LABELS.REALTIME_VOICE).toBe("Canlı sesli öğretmen");
    expect(ACTION_LABELS.REALTIME_VOICE_TRIAL).toMatch(/deneme/);
    expect(STALE_REFUND_ACTION_CODES).toContain("REALTIME_VOICE_MINUTE");
  });
});

describe("OpenAI çağrısı (SDP sunucu üzerinden)", () => {
  it("oturum ayarı: model, ses, Türkçe döküm, anlamsal dönüş algılama, tahta aracı", () => {
    const config = realtimeSessionConfig({ instructions: "x", micProfile: "near" });
    expect(config).toMatchObject({
      type: "realtime",
      model: "gpt-realtime-2.1-mini",
      output_modalities: ["audio"],
      audio: {
        input: {
          noise_reduction: { type: "near_field" },
          transcription: { model: "gpt-4o-mini-transcribe", language: "tr" },
          turn_detection: { type: "semantic_vad", interrupt_response: true, create_response: true },
        },
        output: { voice: REALTIME_VOICE },
      },
      tool_choice: "auto",
    });
    expect(config.tools.map((tool) => tool.name)).toEqual(["tahtaya_yaz"]);
    expect(realtimeSessionConfig({ instructions: "x" }).audio.input.noise_reduction.type).toBe("far_field");
  });

  it("Location başlığından çağrı kimliği", () => {
    expect(callIdFromLocation("/v1/realtime/calls/rtc_123abc")).toBe("rtc_123abc");
    expect(callIdFromLocation("https://api.openai.com/v1/realtime/calls/rtc_9?x=1")).toBe("rtc_9");
    expect(callIdFromLocation(null)).toBeNull();
    expect(callIdFromLocation("/v1/realtime/calls/<script>")).toBeNull();
  });

  it("çok parçalı istek: sdp + session, sunucu anahtarı ve gizli öğrenci belirteci", async () => {
    const fetchImpl = vi.fn(async () => new Response("v=0\r\nanswer", { status: 201, headers: { Location: "/v1/realtime/calls/rtc_42" } }));
    const result = await createRealtimeCall({
      apiKey: "sk-live",
      sdp: "v=0\r\noffer",
      session: realtimeSessionConfig({ instructions: "talimat" }),
      userId: "user-1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true, answer: "v=0\r\nanswer", callId: "rtc_42" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(REALTIME_CALLS_URL);
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-live");
    expect(headers.get("openai-safety-identifier")).toBe(safetyIdentifier("user-1"));
    expect(safetyIdentifier("user-1")).not.toContain("user-1");
    const form = init.body as FormData;
    expect(form.get("sdp")).toBe("v=0\r\noffer");
    expect(JSON.parse(String(form.get("session")))).toMatchObject({ model: "gpt-realtime-2.1-mini", instructions: "talimat" });
  });

  it("hata eşlemesi: kota bitti ayrı; SDP olmayan gövde reddedilir", async () => {
    const quota = await createRealtimeCall({
      apiKey: "k",
      sdp: "v=0",
      session: realtimeSessionConfig({ instructions: "x" }),
      userId: "u",
      fetchImpl: (async () => new Response('{"error":{"code":"insufficient_quota"}}', { status: 429 })) as unknown as typeof fetch,
    });
    expect(quota).toMatchObject({ ok: false, status: 429, quotaExhausted: true });
    const bad = await createRealtimeCall({
      apiKey: "k",
      sdp: "v=0",
      session: realtimeSessionConfig({ instructions: "x" }),
      userId: "u",
      fetchImpl: (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch,
    });
    expect(bad).toMatchObject({ ok: false, status: 502 });
  });
});

type Op = { table: string; op: string; filters: [string, unknown][] };

function fakeService(firstId: () => string | null, ops: Op[] = [], insertId = "mine") {
  const builder = (table: string) => {
    const filters: [string, unknown][] = [];
    let op = "select";
    const chain: Record<string, unknown> = {};
    const finish = async () => {
      ops.push({ table, op, filters: [...filters] });
      if (op === "insert") return { data: { id: insertId }, error: null };
      if (op === "delete") return { data: null, error: null };
      const id = firstId();
      return { data: id ? [{ id }] : [], error: null };
    };
    Object.assign(chain, {
      select: () => chain,
      insert: () => {
        op = "insert";
        return chain;
      },
      delete: () => {
        op = "delete";
        return chain;
      },
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      single: finish,
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => finish().then(resolve, reject),
    });
    return chain;
  };
  return { from: builder } as unknown as SupabaseClient;
}

describe("deneme kanıtı (göçsüz, kalıcı: ai_usage_events)", () => {
  it("ilk satır kazanır; sonra gelen kendi satırını siler ve 'kullanıldı' alır", async () => {
    const ops: Op[] = [];
    const won = await claimTrial(fakeService(() => "mine", ops), "u1");
    expect(won).toEqual({ ok: true, markerId: "mine" });
    expect(ops[0]).toMatchObject({ table: "ai_usage_events", op: "insert" });
    const lostOps: Op[] = [];
    const lost = await claimTrial(fakeService(() => "earlier", lostOps), "u1");
    expect(lost).toEqual({ ok: false, reason: "used" });
    expect(lostOps.some((entry) => entry.op === "delete" && entry.filters.some(([c, v]) => c === "action_code" && v === TRIAL_USAGE_CODE))).toBe(true);
  });

  it("erişim: Plus / Sınav Haftası / Sigma açık, kurucu açık, ücretsizde deneme", async () => {
    vi.resetModules();
    const entitlements = { isPaid: true, plan: "plus" };
    vi.doMock("@/lib/billing/entitlements", () => ({ getUserEntitlements: vi.fn(async () => entitlements) }));
    vi.doMock("@/lib/billing/free-preview", () => ({ billingExempt: vi.fn(async () => false) }));
    const fresh = await import("@/lib/tutor/realtime/access");
    const service = fakeService(() => null);
    expect(await fresh.resolveRealtimeAccess(service, "u")).toEqual({ kind: "paid" });
    entitlements.plan = "sigma";
    expect(await fresh.resolveRealtimeAccess(service, "u")).toEqual({ kind: "paid" });
    Object.assign(entitlements, { isPaid: false, plan: "free" });
    expect(await fresh.resolveRealtimeAccess(service, "u")).toEqual({ kind: "trial" });
    expect(await fresh.resolveRealtimeAccess(fakeService(() => "old"), "u")).toEqual({ kind: "trial_used" });
    vi.doUnmock("@/lib/billing/entitlements");
    vi.doUnmock("@/lib/billing/free-preview");
    vi.resetModules();
    expect(typeof resolveRealtimeAccess).toBe("function");
  });
});

describe("fikstür ucu üretimde kapalı", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("yalnız E2E_FIXTURE=1 ve üretim dışı", () => {
    expect(realtimeFixtureEnabled({ E2E_FIXTURE: "1", NODE_ENV: "development" })).toBe(true);
    expect(realtimeFixtureEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(realtimeFixtureEnabled({ E2E_FIXTURE: "1", NODE_ENV: "production" })).toBe(false);
    expect(realtimeFixtureEnabled({ E2E_FIXTURE: "1", NODE_ENV: "development", VERCEL_ENV: "production" })).toBe(false);
    expect(parseFixtureAccess("paid-cedar")).toEqual({ access: "paid", voice: "cedar" });
    expect(parseFixtureAccess("admin")).toBeNull();
  });

  it("üretimde uçlar 404 (OpenAI'ye istek yok)", async () => {
    vi.stubEnv("E2E_FIXTURE", "1");
    vi.stubEnv("NODE_ENV", "production");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("@/app/api/e2e/realtime-session/[access]/route");
    const response = await POST(new Request("http://x/api/e2e/realtime-session/paid", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ access: "paid" }),
    });
    expect(response.status).toBe(404);
    const tick = await import("@/app/api/e2e/realtime-session/[access]/tick/route");
    expect((await tick.POST(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ access: "paid" }) })).status).toBe(404);
    const end = await import("@/app/api/e2e/realtime-session/[access]/end/route");
    expect((await end.POST(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ access: "paid" }) })).status).toBe(404);
    expect((await end.GET()).status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("fikstür sayfası da E2E_FIXTURE ister", () => {
    expect(read("src/app/e2e/sesli-ders/page.tsx")).toContain('process.env.E2E_FIXTURE !== "1"');
  });
});
