// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/*
  Paket I (30 Ekim 2026) — cevap kaydı ve bitirme takılmasın. Canlı stres testinde sözlü denemenin
  son cevabı 2-6 dk "Gönderiliyor…"da kaldı, "Sınavı bitir" ve × çalışmadı; sayfa yenilenince 2-5.
  cevaplar yoktu. Kök neden: kayıt tek `fetch` (zaman aşımı ve yeniden deneme yok), askıdaki istek
  "kaydediliyor" sayacını hiç düşürmüyordu; bitirme sözlüyü yanıtın içinde dakikalarca notluyordu.

  Senaryolar üç etkinlik türünden ve üç disiplinden: konu testi (Fizik · basınç), doğru/yanlış
  (Biyoloji · hücre), sözlü deneme (Tarih · Cumhuriyet'in ilk yılları); taslak birleştirmesi kart
  destesiyle (Kimya · mol) de denenir.
*/

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  afterTasks: [] as (() => unknown)[],
  guard: vi.fn(),
  flag: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
vi.mock("@/lib/student/student-shell-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/student/student-shell-context")>()),
  useIsFounder: () => false,
}));
// Rota testinde `after` yakalanır: notlandırmanın yanıttan SONRA koştuğu görülsün.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    mocks.afterTasks.push(task);
  },
}));
vi.mock("@/lib/api/guards", () => ({
  withUser: mocks.guard,
  errorResponse: (status: number, error: string) => Response.json({ error }, { status }),
}));
vi.mock("@/lib/admin/feature-flags", () => ({
  PDF_LEARNING_V2_FLAG: "pdf_learning_v2",
  isFeatureEnabled: mocks.flag,
}));
vi.mock("@/lib/ai/generate", () => ({
  generateJson: mocks.generate,
  isPremiumUser: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/learning/prep-chat-grounding", () => ({
  loadPrepChatGrounding: vi.fn().mockResolvedValue({ corpus: "", passages: [] }),
}));

import { ExamNodeSession, resultPollDelay, SAVE_TYPING_DEBOUNCE_MS } from "@/components/parity/exam-node-session";
import { OralAnswerDesk } from "@/components/parity/oral-answer-desk";
import {
  COMPLETE_TIMEOUT_MS,
  fetchWithRetry,
  isRetryFetchError,
  SAVE_RETRY_DELAYS_MS,
  SAVE_TIMEOUT_MS,
} from "@/lib/learning/retry-fetch";
import {
  answerSaveSummary,
  attemptDraftKey,
  markAttemptDraftSaved,
  mergeDraftIntoServer,
  readAttemptDraft,
  writeAttemptDraft,
} from "@/lib/learning/attempt-draft";
import { POST } from "@/app/api/learning/exam-prep/node/route";

type Body = Record<string, unknown>;
type Reply = { status?: number; data?: Body } | "hang" | "network";

/** `fetch` yerine: gövdeye bakıp yanıt verir; "hang" iptal edilene kadar bekler. */
function fakeFetch(route: (body: Body, call: number) => Reply) {
  const calls: Body[] = [];
  const fn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Body;
    calls.push(body);
    const reply = route(body, calls.filter((item) => item.action === body.action).length);
    if (reply === "network") return Promise.reject(new TypeError("Failed to fetch"));
    if (reply === "hang") {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    const status = reply.status ?? 200;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply.data ?? {},
    } as unknown as Response);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls, of: (action: string) => calls.filter((body) => body.action === action) };
}

async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function useFakeClock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date("2026-10-30T09:00:00.000Z"));
}

beforeEach(() => {
  mocks.push.mockClear();
  mocks.refresh.mockClear();
  try {
    window.localStorage.clear();
  } catch {
    // jsdom deposu her zaman var; yine de sessiz.
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/* ───────────── Saf yardımcılar ───────────── */

describe("retry-fetch: zaman aşımı ve yeniden deneme", () => {
  it("askıdaki istek 15 sn'de düşer, 1 sn sonra yeniden denenir ve başarı döner", async () => {
    useFakeClock();
    let call = 0;
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      call += 1;
      if (call === 1) {
        return new Promise<Response>((_r, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
        );
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });
    const pending = fetchWithRetry("/x", {}, {
      timeoutMs: SAVE_TIMEOUT_MS,
      retryDelaysMs: SAVE_RETRY_DELAYS_MS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS - 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1 + SAVE_RETRY_DELAYS_MS[0]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(pending).resolves.toMatchObject({ status: 200 });
  });

  it("4xx yeniden denenmez; 5xx üç kez denenir (1 s, 3 s, 8 s), sonra son yanıt döner", async () => {
    useFakeClock();
    const stale = vi.fn(() => Promise.resolve({ ok: false, status: 409 } as Response));
    await expect(
      fetchWithRetry("/x", {}, { timeoutMs: 1000, retryDelaysMs: SAVE_RETRY_DELAYS_MS, fetchImpl: stale as unknown as typeof fetch }),
    ).resolves.toMatchObject({ status: 409 });
    expect(stale).toHaveBeenCalledTimes(1);

    const down = vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response));
    const pending = fetchWithRetry("/x", {}, { timeoutMs: 1000, retryDelaysMs: SAVE_RETRY_DELAYS_MS, fetchImpl: down as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(1_000 + 3_000 + 8_000);
    await expect(pending).resolves.toMatchObject({ status: 503 });
    expect(down).toHaveBeenCalledTimes(4);
  });

  it("çağıranın iptali (yeni cevap kümesi) askıdaki isteği 'superseded' diye bitirir", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_r, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      ),
    );
    const pending = fetchWithRetry("/x", {}, {
      timeoutMs: COMPLETE_TIMEOUT_MS,
      retryDelaysMs: SAVE_RETRY_DELAYS_MS,
      signal: controller.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    controller.abort();
    const error = await pending.catch((caught: unknown) => caught);
    expect(isRetryFetchError(error) && error.reason).toBe("superseded");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("attempt-draft: tarayıcı taslağı ve birleştirme", () => {
  it("Kimya kart destesi: onaylanan kayıt taslağı siler, sonraki düzenleme taslakta kalır", () => {
    const storage = window.localStorage;
    writeAttemptDraft(storage, "kimya-kart", { answers: { "0": 5, "1": 3 }, cursor: 1, now: 1_000 });
    markAttemptDraftSaved(storage, "kimya-kart", { "0": 5, "1": 3 }, 2_000);
    expect(storage.getItem(attemptDraftKey("kimya-kart"))).toBeNull();

    writeAttemptDraft(storage, "kimya-kart", { answers: { "0": 5, "1": 3, "2": 1 }, cursor: 2, now: 3_000 });
    markAttemptDraftSaved(storage, "kimya-kart", { "0": 5, "1": 3 }, 4_000);
    const draft = readAttemptDraft(storage, "kimya-kart", 4_000);
    expect(draft?.answers).toEqual({ "0": 5, "1": 3, "2": 1 });
    expect(answerSaveSummary(draft!.answers, { "0": 5, "1": 3 })).toEqual({ saved: 2, unsaved: 1 });
  });

  it("sunucu kaydı taslaktan yeniyse (başka cihaz) taslak üstün gelmez", () => {
    const draft = { v: 1 as const, answers: { "0": "eski" }, cursor: 0, updatedAt: Date.parse("2026-10-30T09:00:00Z"), savedAt: null };
    const merged = mergeDraftIntoServer(
      { answers: { "0": "yeni cihaz" }, cursor: 3, updatedAt: "2026-10-30T09:30:00Z" },
      draft,
    );
    expect(merged.restored).toEqual([]);
    expect(merged.answers).toEqual({ "0": "yeni cihaz" });
  });

  it("yardımcı anahtarlar (__meta) taslağa yazılmaz; bozuk taslak okunmaz", () => {
    const storage = window.localStorage;
    writeAttemptDraft(storage, "x", { answers: { "0": "A", __meta: { hintsUsed: {} } }, cursor: 0 });
    expect(readAttemptDraft(storage, "x")?.answers).toEqual({ "0": "A" });
    storage.setItem(attemptDraftKey("y"), "{bozuk");
    expect(readAttemptDraft(storage, "y")).toBeNull();
  });
});

/* ───────────── Oturum ekranı ───────────── */

const PHYSICS_QUIZ = {
  type: "quiz",
  questions: [
    { text: "Basınç hangi birimle ölçülür?", options: ["Pascal", "Newton"], correct: ["Pascal"], multi: false },
    { text: "Sıvı basıncı neye bağlıdır?", options: ["Derinliğe", "Kabın şekline"], correct: ["Derinliğe"], multi: false },
  ],
};

const BIOLOGY_TF = {
  type: "true_false",
  items: [
    { text: "Ribozom zarla çevrili bir organeldir.", correct: false, explanation: "Ribozom zarsızdır." },
    { text: "Mitokondri kendi DNA'sını taşır.", correct: true, explanation: "Halkasal DNA'sı vardır." },
  ],
};

const HISTORY_ORAL = (count: number) => ({
  type: "oral",
  questions: Array.from({ length: count }, (_, i) => ({
    prompt: ["Lozan Antlaşması hangi yıl imzalandı?", "Saltanat ne zaman kaldırıldı?", "Cumhuriyet hangi gün ilan edildi?"][i] ?? `Soru ${i + 1}`,
    probeKind: "detail",
  })),
});

function resumed(attemptId: string, payload: Body, extra: Body = {}): Reply {
  return {
    data: { ok: true, resumed: true, attemptId, generationId: `${attemptId}-gen`, contentVersion: 1, payload, answers: {}, ...extra },
  };
}

describe("(1) konu testi · Fizik: askıdaki kayıt 15 sn'de düşer, yeniden denenir, sayaç sıfırlanır", () => {
  it("'Cevapların kaydediliyor…' her terminal sonuçta kalkar", async () => {
    useFakeClock();
    const net = fakeFetch((body, call) => {
      if (body.action === "resume") return resumed("fizik-1", PHYSICS_QUIZ);
      if (body.action === "save") return call === 1 ? "hang" : { data: { ok: true, contentVersion: 2 } };
      return { data: {} };
    });
    render(<ExamNodeSession prepId="prep-f" nodeId="node-f" kind="quiz" prepTitle="Fizik" topicLabel="Basınç" resumeEnabled />);
    await tick();
    expect(screen.getByText("Basınç hangi birimle ölçülür?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Pascal/ }));
    // Taslak hemen yazılır; sunucu kaydı kısa beklemeden sonra.
    expect(readAttemptDraft(window.localStorage, "fizik-1")?.answers).toEqual({ "0": "Pascal" });
    await tick(400);
    expect(net.of("save")).toHaveLength(1);
    expect(screen.getByText("Cevapların kaydediliyor…")).toBeTruthy();

    await tick(SAVE_TIMEOUT_MS);
    await tick(SAVE_RETRY_DELAYS_MS[0]);
    expect(net.of("save")).toHaveLength(2);
    expect(net.of("save")[1].answers).toEqual({ "0": "Pascal" });
    expect(screen.queryByText("Cevapların kaydediliyor…")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    // Onaylanan kayıt taslağı temizler.
    expect(window.localStorage.getItem(attemptDraftKey("fizik-1"))).toBeNull();
  });
});

describe("(2) doğru/yanlış · Biyoloji: üç yeniden deneme de düşer", () => {
  it("hata görünür, taslak tarayıcıda durur, 'Kaydı yeniden dene' çalışır", async () => {
    useFakeClock();
    let down = true;
    const net = fakeFetch((body) => {
      if (body.action === "resume") return resumed("bio-1", BIOLOGY_TF);
      if (body.action === "save") return down ? { status: 503, data: { error: "save_failed" } } : { data: { ok: true, contentVersion: 5 } };
      return { data: {} };
    });
    render(<ExamNodeSession prepId="prep-b" nodeId="node-b" kind="true_false" prepTitle="Biyoloji" topicLabel="Hücre" resumeEnabled />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Yanlış" }));
    await tick(400);
    await tick(1_000);
    await tick(3_000);
    await tick(8_000);
    expect(net.of("save")).toHaveLength(4);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/kaydedilemedi/);
    expect(alert.textContent).toMatch(/bu cihazda saklı/);
    expect(screen.queryByText("Cevapların kaydediliyor…")).toBeNull();
    expect(readAttemptDraft(window.localStorage, "bio-1")?.answers).toEqual({ "0": false });

    const retry = screen.getByRole("button", { name: "Kaydı yeniden dene" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    down = false;
    fireEvent.click(retry);
    await tick();
    expect(net.of("save")).toHaveLength(5);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hız sınırı (429) kırmızı uyarı açmaz; en son küme kendiliğinden yeniden gider", async () => {
    useFakeClock();
    let limited = true;
    const net = fakeFetch((body) => {
      if (body.action === "resume") return resumed("bio-3", BIOLOGY_TF);
      if (body.action === "save") return limited ? { status: 429, data: { error: "Çok fazla istek." } } : { data: { ok: true, contentVersion: 2 } };
      return { data: {} };
    });
    render(<ExamNodeSession prepId="prep-b" nodeId="node-b" kind="true_false" prepTitle="Biyoloji" topicLabel="Hücre" resumeEnabled />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Doğru" }));
    await tick(400);
    expect(net.of("save")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    limited = false;
    await tick(15_000);
    expect(net.of("save")).toHaveLength(2);
    expect(window.localStorage.getItem(attemptDraftKey("bio-3"))).toBeNull();
  });

  it("kendi düşen isteği sunucuya ulaştıysa sürüm hatası 'başka sekme' sayılmaz: güncel sürümle yeniden gider", async () => {
    useFakeClock();
    const net = fakeFetch((body, call) => {
      if (body.action === "resume" && body.attemptId) {
        return { data: { ok: true, active: true, grading: false, attemptId: "bio-2", generationId: "bio-2-gen", contentVersion: 7 } };
      }
      if (body.action === "resume") return resumed("bio-2", BIOLOGY_TF);
      if (body.action === "save") {
        if (call === 1) return "hang";
        if (body.contentVersion !== 7) return { status: 409, data: { error: "stale_version" } };
        return { data: { ok: true, contentVersion: 8 } };
      }
      return { data: {} };
    });
    render(<ExamNodeSession prepId="prep-b" nodeId="node-b" kind="true_false" prepTitle="Biyoloji" topicLabel="Hücre" resumeEnabled />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Yanlış" }));
    await tick(400);
    await tick(SAVE_TIMEOUT_MS + SAVE_RETRY_DELAYS_MS[0]);
    expect(net.of("save").map((body) => body.contentVersion)).toEqual([1, 1, 7]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("(3) sözlü · Tarih: yeniden yüklemede taslak sunucudan yeniyse birleştirilir", () => {
  it("2-3. cevaplar geri gelir, hemen kaydedilir, öğrenciye söylenir", async () => {
    const now = Date.now();
    window.localStorage.setItem(
      attemptDraftKey("tarih-1"),
      JSON.stringify({
        v: 1,
        answers: { "0": "1923'te imzalandı.", "1": "1 Kasım 1922'de.", "2": "29 Ekim 1923." },
        cursor: 2,
        updatedAt: now,
        savedAt: now - 60_000,
      }),
    );
    const net = fakeFetch((body) => {
      if (body.action === "resume") {
        return resumed("tarih-1", HISTORY_ORAL(3), {
          answers: { "0": "1923'te imzalandı." },
          cursorIndex: 1,
          updatedAt: new Date(now - 120_000).toISOString(),
        });
      }
      if (body.action === "save") return { data: { ok: true, contentVersion: 2 } };
      return { data: {} };
    });
    render(<ExamNodeSession prepId="prep-t" nodeId="node-t" kind="oral" prepTitle="Tarih" topicLabel="Cumhuriyet" resumeEnabled />);
    await screen.findByText("Kaydedilmemiş cevapların geri yüklendi.");
    await waitFor(() => expect(net.of("save")).toHaveLength(1));
    expect(net.of("save")[0].answers).toEqual({
      "0": "1923'te imzalandı.",
      "1": "1 Kasım 1922'de.",
      "2": "29 Ekim 1923.",
    });
    // Kaldığı yer taslağın ilerisi: üçüncü soru.
    expect(screen.getByText("Soru 3/3")).toBeTruthy();
    await waitFor(() => expect(window.localStorage.getItem(attemptDraftKey("tarih-1"))).toBeNull());
  });
});

describe("(4) sözlü · Tarih: bitirme 60 sn'de düşer → 'Değerlendiriliyor…' + yoklama → sonuç", () => {
  it("sonuç gelince değerlendirme ekranı açılır; yoklama kaydı kimliğiyle sorar", async () => {
    useFakeClock();
    let graded = false;
    const net = fakeFetch((body) => {
      if (body.action === "resume" && body.attemptId) {
        return graded
          ? { data: { ok: true, completed: true, grading: false, score: 60, total: 100, nextHref: "/deneme-sinavlari/prep-t" } }
          : { data: { ok: true, grading: true, attemptId: "tarih-2" } };
      }
      if (body.action === "resume") return resumed("tarih-2", HISTORY_ORAL(1));
      if (body.action === "complete") return "hang";
      return { data: { ok: true, contentVersion: 2 } };
    });
    render(<ExamNodeSession prepId="prep-t" nodeId="node-t" kind="oral" prepTitle="Tarih" topicLabel="Cumhuriyet" resumeEnabled />);
    await tick();
    fireEvent.change(screen.getByLabelText("Cevabın"), { target: { value: "Lozan 24 Temmuz 1923'te imzalandı." } });
    fireEvent.click(screen.getByRole("button", { name: "Sınavı bitir" }));
    await tick();
    expect(net.of("complete")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Gönderiliyor/ })).toBeTruthy();

    await tick(COMPLETE_TIMEOUT_MS);
    expect(screen.getByText("Değerlendiriliyor…")).toBeTruthy();
    expect(screen.getByText(/Sonuç hazır olunca burada görünecek/)).toBeTruthy();

    await tick(3_000);
    const polls = net.calls.filter((body) => body.action === "resume" && body.attemptId === "tarih-2");
    expect(polls.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Değerlendiriliyor…")).toBeTruthy();

    graded = true;
    await tick(3_000);
    expect(screen.getByRole("button", { name: "Sonuçlarımı gör" })).toBeTruthy();
    // Bitirme yeniden gönderilmedi: sunucu notluyordu. Bitirme sonucu yoklayabildiğini söyledi.
    expect(net.of("complete")).toHaveLength(1);
    expect(net.of("complete")[0].gradingAsync).toBe(true);
  });

  it("yoklama dakikada 16 isteklik sınırın altında kalır", () => {
    let elapsed = 0;
    let polls = 0;
    const times: number[] = [];
    while (elapsed < 10 * 60_000) {
      elapsed += resultPollDelay(polls);
      polls += 1;
      times.push(elapsed);
    }
    for (const start of times) {
      // Bitirme isteği ve bir yeniden gönderim için iki yer bırakılır.
      expect(times.filter((at) => at >= start && at < start + 60_000).length).toBeLessThanOrEqual(14);
    }
    expect(resultPollDelay(0)).toBe(3_000);
  });
});

describe("(6) × ve 'Sınavı bitir' kayıt ya da gönderim sürerken çalışır", () => {
  it("× kilitli değil; kaydedilmemiş cevapta özet gösterir ve çıkışa izin verir", async () => {
    useFakeClock();
    fakeFetch((body) => {
      if (body.action === "resume") return resumed("tarih-3", HISTORY_ORAL(2));
      if (body.action === "save") return "hang";
      return { data: {} };
    });
    render(<ExamNodeSession prepId="prep-t" nodeId="node-t" kind="oral" prepTitle="Tarih" topicLabel="Cumhuriyet" resumeEnabled />);
    await tick();
    fireEvent.change(screen.getByLabelText("Cevabın"), { target: { value: "1923" } });
    // Yazarken her tuş istek açmaz; taslak hemen, sunucu kaydı son tuştan sonra.
    expect(readAttemptDraft(window.localStorage, "tarih-3")?.answers).toEqual({ "0": "1923" });
    await tick(SAVE_TYPING_DEBOUNCE_MS - 1);
    expect(screen.queryByText("Cevapların kaydediliyor…")).toBeNull();
    await tick(1);
    expect(screen.getByText("Cevapların kaydediliyor…")).toBeTruthy();
    const exit = screen.getByRole("button", { name: "Oturumdan çık" }) as HTMLButtonElement;
    expect(exit.disabled).toBe(false);
    fireEvent.click(exit);
    expect(screen.getByRole("dialog").textContent).toMatch(/0 cevap kaydedildi, 1 cevap kaydedilemedi/);
    fireEvent.click(screen.getByRole("button", { name: "Yine de çık" }));
    expect(mocks.push).toHaveBeenCalledWith("/deneme-sinavlari/prep-t");
  });

  it("gönderim sürerken 'Sınavı bitir' bekleme ekranına geçirir", async () => {
    useFakeClock();
    fakeFetch((body) => {
      if (body.action === "resume" && body.attemptId) return { data: { ok: true, grading: true, attemptId: "tarih-4" } };
      if (body.action === "resume") return resumed("tarih-4", HISTORY_ORAL(1));
      if (body.action === "complete") return "hang";
      return { data: { ok: true, contentVersion: 2 } };
    });
    render(<ExamNodeSession prepId="prep-t" nodeId="node-t" kind="oral" prepTitle="Tarih" topicLabel="Cumhuriyet" resumeEnabled />);
    await tick();
    fireEvent.change(screen.getByLabelText("Cevabın"), { target: { value: "29 Ekim 1923" } });
    fireEvent.click(screen.getByRole("button", { name: "Sınavı bitir" }));
    await tick();
    const end = screen.getByRole("button", { name: "Sınavı bitir" }) as HTMLButtonElement;
    expect(end.disabled).toBe(false);
    fireEvent.click(end);
    await tick();
    expect(screen.getByText("Değerlendiriliyor…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Oturumdan çık" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("cevap masası: busy yalnız gönderi kilitler", () => {
    const onFinish = vi.fn();
    render(
      <OralAnswerDesk
        index={0}
        total={1}
        prompt="Saltanat ne zaman kaldırıldı?"
        probeKind="detail"
        persona="helpful"
        minutes={3}
        value="1922"
        busy
        onChange={() => undefined}
        onAdvance={() => undefined}
        onFinish={onFinish}
      />,
    );
    expect((screen.getByRole("button", { name: /Gönderiliyor/ }) as HTMLButtonElement).disabled).toBe(true);
    const end = screen.getByRole("button", { name: "Sınavı bitir" }) as HTMLButtonElement;
    expect(end.disabled).toBe(false);
    fireEvent.click(end);
    expect(onFinish).toHaveBeenCalledWith("1922", undefined);
  });
});

/* ───────────── Rota: sözlü notlandırma yanıttan sonra, çift notlandırma yok ───────────── */

const PREP = "00000000-0000-4000-8000-000000000101";
const NODE = "00000000-0000-4000-8000-000000000102";
const ATTEMPT = "00000000-0000-4000-8000-000000000103";
const GEN = "00000000-0000-4000-8000-000000000104";
const COMPLETE_REQ = "00000000-0000-4000-8000-000000000105";

type Row = Record<string, unknown>;

/** Tek satırlık deneme tablosu: eşitlik süzgeçleri ve koşullu güncelleme (sahiplenme) gerçekten uygulanır. */
function fakeService(row: Row) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "complete_exam_prep_node") {
      if (row.status === "active") Object.assign(row, { status: "completed", score: args.p_score, total: args.p_total, answers: args.p_answers });
      return { data: { score: row.score, total: row.total, nextId: null }, error: null };
    }
    return { data: null, error: null };
  });
  const generic = (result: unknown) => {
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    for (const key of ["select", "eq", "or", "gt", "gte", "in", "neq", "lt", "not", "is", "order", "limit", "insert", "update", "upsert", "delete"]) {
      builder[key] = self;
    }
    builder.maybeSingle = async () => ({ data: result, error: null });
    builder.single = async () => ({ data: result, error: null });
    return builder;
  };
  const attempts = () => {
    const filters: [string, string, unknown][] = [];
    let patch: Row | null = null;
    const matches = () =>
      filters.every(([type, key, value]) => (type === "is" ? (row[key] ?? null) === value : !(key in row) || row[key] === value));
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    for (const key of ["select", "or", "gt", "in", "order", "limit", "not"]) builder[key] = self;
    builder.eq = (key: string, value: unknown) => {
      filters.push(["eq", key, value]);
      return builder;
    };
    builder.is = (key: string, value: unknown) => {
      filters.push(["is", key, value]);
      return builder;
    };
    builder.update = (values: Row) => {
      patch = values;
      return builder;
    };
    builder.maybeSingle = async () => ({ data: matches() ? { ...row } : null, error: null });
    builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
      try {
        const hit = matches();
        if (patch && hit) Object.assign(row, patch);
        return Promise.resolve(resolve({ data: hit ? [{ id: row.id }] : [], error: null }));
      } catch (error) {
        return Promise.resolve(reject(error));
      }
    };
    return builder;
  };
  const from = vi.fn((table: string) => {
    if (table === "exam_prep_node_attempts") return attempts();
    if (table === "exam_preps") return generic({ id: PREP, title: "Tarih", exam_type: "yks", active_topic_id: null, target_score: 70 });
    if (table === "exam_prep_nodes") return generic({ id: NODE, kind: "oral", title: "Sözlü", status: "ready", sort_order: 3, day_index: 1, session_meta: null });
    return generic(null);
  });
  return { service: { from, rpc }, rpc };
}

function post(body: Body) {
  return POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ prepId: PREP, nodeId: NODE, ...body }) }));
}

describe("(5) rota: sözlü bitirme 'grading' döner, notlandırma yanıttan sonra ve bir kez", () => {
  it("ikinci bitirme notlamaz; notlandırma bitince yoklama sonucu verir", async () => {
    mocks.afterTasks.length = 0;
    mocks.flag.mockResolvedValue(true);
    mocks.generate.mockReset();
    mocks.generate.mockResolvedValue({ ok: false });
    const row: Row = {
      id: ATTEMPT,
      node_id: NODE,
      user_id: "user",
      exam_prep_id: PREP,
      status: "active",
      payload: {
        type: "oral",
        questions: [{ prompt: "Lozan Antlaşması hangi yıl imzalandı?", expectedPoints: ["1923"], modelAnswer: "1923" }],
      },
      answers: {},
      score: null,
      total: 1,
      generation_id: GEN,
      client_request_id: null,
      complete_request_id: null,
      content_version: 2,
      updated_at: new Date().toISOString(),
    };
    const { service, rpc } = fakeService(row);
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user", service } });
    const complete = {
      action: "complete",
      attemptId: ATTEMPT,
      generationId: GEN,
      completeRequestId: COMPLETE_REQ,
      gradingAsync: true,
      answers: { "0": "1923'te" },
    };

    const first = await post(complete);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, grading: true });
    // Sahiplenme cevapları da yazdı; notlandırma henüz koşmadı.
    expect(row.complete_request_id).toBe(COMPLETE_REQ);
    expect(row.answers).toEqual({ "0": "1923'te" });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.afterTasks).toHaveLength(1);

    const again = await post(complete);
    expect(await again.json()).toMatchObject({ ok: true, grading: true });
    expect(mocks.afterTasks).toHaveLength(1);

    const pollWhileGrading = await post({ action: "resume", attemptId: ATTEMPT });
    expect(await pollWhileGrading.json()).toMatchObject({ grading: true, completed: false });

    // Yanıttan sonraki iş: hakem (düşünce bir kez daha) ve tamamlama bir kez.
    await mocks.afterTasks[0]();
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.filter(([name]) => name === "complete_exam_prep_node")).toHaveLength(1);
    expect(row.status).toBe("completed");

    const third = await post(complete);
    expect(await third.json()).toMatchObject({ ok: true, idempotent: true, state: "completed" });
    expect(rpc.mock.calls.filter(([name]) => name === "complete_exam_prep_node")).toHaveLength(1);

    const poll = await post({ action: "resume", attemptId: ATTEMPT });
    const polled = await poll.json();
    expect(polled).toMatchObject({ completed: true, grading: false, state: "completed" });
    expect(typeof polled.nextHref).toBe("string");
  });

  it("sahiplik bayatladıysa (işlev öldü) yeni bitirme devralır", async () => {
    mocks.afterTasks.length = 0;
    mocks.flag.mockResolvedValue(true);
    mocks.generate.mockReset();
    mocks.generate.mockResolvedValue({ ok: false });
    const row: Row = {
      id: ATTEMPT,
      node_id: NODE,
      user_id: "user",
      exam_prep_id: PREP,
      status: "active",
      payload: { type: "oral", questions: [{ prompt: "Saltanat ne zaman kaldırıldı?", expectedPoints: ["1922"] }] },
      answers: { "0": "1922" },
      score: null,
      total: 1,
      generation_id: GEN,
      client_request_id: null,
      complete_request_id: "00000000-0000-4000-8000-0000000000aa",
      content_version: 2,
      updated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    };
    const { service } = fakeService(row);
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user", service } });
    const opened = await post({ action: "resume" });
    // Bayat sahiplik "notlanıyor" sayılmaz: kayıt kaldığı yerden açılır.
    expect(await opened.json()).toMatchObject({ resumed: true });
    const res = await post({
      action: "complete",
      attemptId: ATTEMPT,
      generationId: GEN,
      completeRequestId: COMPLETE_REQ,
      gradingAsync: true,
      answers: {},
    });
    expect(await res.json()).toMatchObject({ grading: true });
    expect(row.complete_request_id).toBe(COMPLETE_REQ);
    expect(mocks.afterTasks).toHaveLength(1);
  });

  it("yoklayamayan eski sekme sonucu yine yanıtın içinde alır", async () => {
    mocks.afterTasks.length = 0;
    mocks.flag.mockResolvedValue(true);
    mocks.generate.mockReset();
    mocks.generate.mockResolvedValue({ ok: false });
    const row: Row = {
      id: ATTEMPT,
      node_id: NODE,
      user_id: "user",
      exam_prep_id: PREP,
      status: "active",
      payload: { type: "oral", questions: [{ prompt: "Cumhuriyet hangi gün ilan edildi?", expectedPoints: ["29 Ekim 1923"] }] },
      answers: {},
      score: null,
      total: 1,
      generation_id: GEN,
      client_request_id: null,
      complete_request_id: null,
      content_version: 2,
      updated_at: new Date().toISOString(),
    };
    const { service, rpc } = fakeService(row);
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user", service } });
    const res = await post({ action: "complete", attemptId: ATTEMPT, generationId: GEN, completeRequestId: COMPLETE_REQ, answers: { "0": "29 Ekim 1923" } });
    const body = await res.json();
    expect(body.grading).toBeUndefined();
    expect(body).toMatchObject({ ok: true, state: "completed" });
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.filter(([name]) => name === "complete_exam_prep_node")).toHaveLength(1);
  });
});
