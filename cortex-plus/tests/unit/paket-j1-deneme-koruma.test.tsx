// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/*
  Paket J1 (31 Ekim 2026, ürün sahibinin kararı) — deneme ve konu testinde geri tuşu / yenileme koruması,
  telefonda klavye ve uygulamanın tarayıcısı şeridi.

  A) Yazılı deneme cevapları yalnız sunucuya 800 ms bekleyip gidiyordu; kaldığı soru hiç yazılmıyordu
     (`cursorIndex` gönderiliyor, saklanmıyordu), yenilenen deneme 1. sorudan açılıyordu. Artık her
     düzenleme tarayıcı taslağına hemen, sunucuya kısa beklemeyle; açılışta hangisi yeniyse o. Süre sunucunun
     bitiş anından. Sınav sürerken sayfadan çıkış sorulur, bitince sorulmaz. Konu testinde de aynı.
  B) Sohbet, sözlü ve deneme ekranları 100dvh (vh önce, eski tarayıcı için).
  C) Instagram / Facebook / TikTok / WhatsApp tarayıcısında "Tarayıcıda aç" şeridi.

  Örnekler farklı derslerden: Fizik (basınç), Kimya (mol), Tarih (Cumhuriyet).
*/

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  guard: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
vi.mock("@/lib/student/student-shell-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/student/student-shell-context")>()),
  useIsFounder: () => false,
}));
vi.mock("@/lib/api/guards", () => ({
  withUser: mocks.guard,
  errorResponse: (status: number, error: string) => Response.json({ error }, { status }),
}));

import { ParityExamRunner, type RunnerQuestion } from "@/components/parity/exam-runner";
import { ExamNodeSession } from "@/components/parity/exam-node-session";
import { InAppBrowserBanner, IN_APP_BANNER_DISMISS_KEY } from "@/components/layout/in-app-browser-banner";
import { googleBlockedWebViewApp, inAppBrowserApp } from "@/lib/auth/in-app-browser";
import { attemptDraftKey, readAttemptDraft } from "@/lib/learning/attempt-draft";
import {
  examDraftKey,
  pickNewerExamDraft,
  readExamDraft,
  resolveExamResume,
  splitExamDraftMeta,
  withExamDraftMeta,
  type ExamDraft,
} from "@/lib/learning/mock-exam/exam-draft";
import { POST as sessionPOST } from "@/app/api/learning/exam/session/route";

type Body = Record<string, unknown>;

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

/** Uygulamanın tarayıcısında çıkış uyarısı: dinleyici `preventDefault` çağırdı mı. */
function leaveWarned(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function useFakeClock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date("2026-10-31T09:00:00.000Z"));
}

/** `fetch` yerine: adrese ve gövdeye bakıp yanıt verir; gövdeler sırayla kayıtlı. */
function fakeFetch(route: (url: string, body: Body) => { status?: number; data?: Body }) {
  const calls: { url: string; body: Body }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Body;
    calls.push({ url, body });
    const reply = route(url, body);
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply.data ?? {},
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return {
    calls,
    saves: () => calls.filter((call) => call.url.includes("action=save")).map((call) => call.body),
    grades: () => calls.filter((call) => call.url.includes("/exam/grade")).map((call) => call.body),
  };
}

beforeEach(() => {
  mocks.push.mockClear();
  mocks.refresh.mockClear();
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // jsdom deposu her zaman var.
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ───────────── A · Yazılı deneme: taslak ───────────── */

const EXAM = "8b0e1c52-6f43-4b8a-9a55-1f0c2a7d3e01";
const Q = [
  "1f2e3d4c-0000-4000-8000-000000000001",
  "1f2e3d4c-0000-4000-8000-000000000002",
  "1f2e3d4c-0000-4000-8000-000000000003",
  "1f2e3d4c-0000-4000-8000-000000000004",
];

const PHYSICS: RunnerQuestion[] = [
  { id: Q[0], text: "Basıncın SI birimi hangisidir?", options: ["Pascal", "Newton", "Joule", "Watt"], question_type: "mcq", points: 5 },
  { id: Q[1], text: "Sıvı basıncı nelere bağlıdır? (birden çok)", options: ["Derinlik", "Yoğunluk", "Kabın şekli"], question_type: "multi_mcq", points: 5 },
  { id: Q[2], text: "Kaldırma kuvvetini açıkla.", options: [], question_type: "open", points: 10 },
  { id: Q[3], text: "Atmosfer basıncı yükseldikçe azalır.", options: [], question_type: "true_false", points: 5 },
];

function localDraft(input: Partial<ExamDraft>): ExamDraft {
  return {
    v: 1,
    answers: {},
    flaggedIds: [],
    cursor: 0,
    deadlineAt: null,
    updatedAt: Date.now(),
    savedAt: null,
    ...input,
  };
}

describe("exam-draft: hangisi yeniyse o", () => {
  it("kaydedilmemiş yerel düzenleme sunucudan yeniyse yerel; değilse sunucu (başka cihaz)", () => {
    const at = Date.parse("2026-10-31T09:00:00Z");
    const local = localDraft({ answers: { a: "Pascal" }, updatedAt: at, savedAt: at - 60_000 });
    expect(pickNewerExamDraft(local, { answers: {}, flaggedIds: [], cursor: 0, updatedAt: "2026-10-31T08:58:00Z" })).toBe("local");
    expect(pickNewerExamDraft(local, { answers: {}, flaggedIds: [], cursor: 0, updatedAt: "2026-10-31T09:10:00Z" })).toBe("server");
    // Eski kayıt (saat yok): kaydedilmemiş yerel düzenleme üstün.
    expect(pickNewerExamDraft(local, { answers: {}, flaggedIds: [], cursor: null, updatedAt: null })).toBe("local");
    // Yerelde kaydedilmemiş bir şey yok: sunucu bildiğimiz her şeyi aldı, üstüne başka cihaz yazmış olabilir.
    const clean = localDraft({ answers: { a: "Pascal" }, updatedAt: at, savedAt: at });
    expect(pickNewerExamDraft(clean, { answers: { a: "Newton" }, flaggedIds: [], cursor: 2, updatedAt: null })).toBe("server");
    expect(pickNewerExamDraft(null, null)).toBeNull();
  });

  it("kazananın cevabı üstün, öbürünün yalnız boş kalan cevapları eklenir; fark varsa sunucuya gider", () => {
    const at = Date.parse("2026-10-31T09:00:00Z");
    const local = localDraft({
      answers: { a: "0,5 mol", b: "" },
      cursor: 3,
      updatedAt: at,
      savedAt: null,
    });
    const resume = resolveExamResume(local, {
      answers: { a: "2 mol", b: "Avogadro sayısı", c: ["H2O"] },
      flaggedIds: ["c"],
      cursor: 1,
      updatedAt: "2026-10-31T08:50:00Z",
    });
    expect(resume.from).toBe("local");
    expect(resume.answers).toEqual({ a: "0,5 mol", b: "Avogadro sayısı", c: ["H2O"] });
    expect(resume.cursor).toBe(3);
    expect(resume.push).toBe(true);
  });

  it("sunucu taslağı göçsüz: soru ve kayıt anı `__meta`'da; okurken cevaplardan ayrılır", () => {
    const stored = withExamDraftMeta({ [Q[0]]: "Pascal" }, { cursor: 2, savedAt: "2026-10-31T09:00:00.000Z" });
    expect(stored).toEqual({ [Q[0]]: "Pascal", __meta: { cursor: 2, savedAt: "2026-10-31T09:00:00.000Z" } });
    expect(splitExamDraftMeta(stored)).toEqual({
      answers: { [Q[0]]: "Pascal" },
      cursor: 2,
      updatedAt: "2026-10-31T09:00:00.000Z",
    });
    // Eski kayıt: meta yok.
    expect(splitExamDraftMeta({ [Q[0]]: "Pascal" })).toEqual({ answers: { [Q[0]]: "Pascal" }, cursor: null, updatedAt: null });
    expect(splitExamDraftMeta(null)).toEqual({ answers: {}, cursor: null, updatedAt: null });
  });
});

/* Oturum rotası: kayıt `__meta` yazar, açılış soruyu ve kayıt anını döndürür. */
function fakeService(state: { exam: Body; draft: Body | null; updates: Body[]; inserts: Body[] }) {
  return {
    from(table: string) {
      let op: "select" | "update" = "select";
      let payload: Body | null = null;
      const resolve = () => {
        if (op === "update") {
          state.updates.push({ table, ...(payload ?? {}) });
          return { data: null, error: null };
        }
        if (table === "practice_exams") return { data: state.exam, error: null };
        return { data: state.draft, error: null };
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => resolve(),
        update: (next: Body) => {
          op = "update";
          payload = next;
          return chain;
        },
        insert: async (row: Body) => {
          state.inserts.push({ table, ...row });
          return { data: null, error: null };
        },
        then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(resolve()).then(onFulfilled, onRejected),
      };
      return chain;
    },
  };
}

describe("oturum rotası: kaldığı soru sunucuda", () => {
  it("kayıt cevapları, soruyu ve kayıt anını yazar; açılış ikisini cevaplardan ayırıp döndürür", async () => {
    const deadline = new Date(Date.now() + 754_000).toISOString();
    const state = {
      exam: { id: EXAM, user_id: "u1", deadline_at: deadline, duration_minutes: 40, started_at: new Date().toISOString() },
      draft: { id: "draft-1" } as Body | null,
      updates: [] as Body[],
      inserts: [] as Body[],
    };
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "u1", service: fakeService(state) } });

    const save = await sessionPOST(
      new Request("http://localhost/api/learning/exam/session?action=save", {
        method: "POST",
        body: JSON.stringify({ examId: EXAM, answers: { [Q[0]]: "Pascal" }, flaggedIds: [Q[1]], cursorIndex: 2 }),
      }),
    );
    const saved = (await save.json()) as Body;
    expect(save.status).toBe(200);
    expect(typeof saved.savedAt).toBe("string");
    const written = state.updates[0]!.answers as Record<string, unknown>;
    expect(written[Q[0]]).toBe("Pascal");
    expect(written.__meta).toEqual({ cursor: 2, savedAt: saved.savedAt });

    state.draft = { id: "draft-1", answers: written, flagged_ids: [Q[1]] };
    const start = await sessionPOST(
      new Request("http://localhost/api/learning/exam/session?action=start", {
        method: "POST",
        body: JSON.stringify({ examId: EXAM }),
      }),
    );
    const opened = (await start.json()) as Body;
    expect(opened.answers).toEqual({ [Q[0]]: "Pascal" });
    expect(opened.cursorIndex).toBe(2);
    expect(opened.updatedAt).toBe(saved.savedAt);
    expect(opened.flaggedIds).toEqual([Q[1]]);
    expect(opened.timeLeftSec).toBeGreaterThan(740);
  });
});

function startReply(extra: Body = {}) {
  return {
    data: {
      ok: true,
      startedAt: new Date(Date.now() - 600_000).toISOString(),
      deadlineAt: new Date(Date.now() + 754_000).toISOString(),
      untimed: false,
      timeLeftSec: 754,
      answers: {},
      flaggedIds: [],
      cursorIndex: null,
      updatedAt: null,
      ...extra,
    },
  };
}

describe("yazılı deneme · Fizik: yenilenince aynı soru, aynı cevaplar, aynı süre", () => {
  it("bu cihazın taslağı sunucudan yeniyse cevaplar ve soru taslaktan, süre sunucudan; fark hemen kaydedilir", async () => {
    useFakeClock();
    window.localStorage.setItem(
      examDraftKey(EXAM),
      JSON.stringify(
        localDraft({
          answers: {
            [Q[0]]: "Pascal",
            [Q[1]]: ["Derinlik", "Yoğunluk"],
            [Q[2]]: "Cismin batan hacmi kadar sıvının ağırlığına eşittir.",
          },
          flaggedIds: [Q[1]],
          cursor: 2,
          deadlineAt: new Date(Date.now() + 760_000).toISOString(),
          updatedAt: Date.now() - 5_000,
          savedAt: Date.now() - 40_000,
        }),
      ),
    );
    const net = fakeFetch((url) =>
      url.includes("action=start")
        ? startReply({ answers: { [Q[0]]: "Pascal" }, cursorIndex: 0, updatedAt: new Date(Date.now() - 60_000).toISOString() })
        : { data: { ok: true, savedAt: new Date().toISOString(), timeLeftSec: 754 } },
    );
    render(<ParityExamRunner examId={EXAM} prepId="prep-fizik" title="Fizik denemesi" questions={PHYSICS} />);
    await tick();

    // Kaldığı soru: 3/4, yazılı cevap yerinde.
    expect(screen.getByRole("button", { name: "Soru haritasını aç" }).textContent).toContain("3 / 4");
    expect((screen.getByPlaceholderText("Cevabını yaz") as HTMLTextAreaElement).value).toBe(
      "Cismin batan hacmi kadar sıvının ağırlığına eşittir.",
    );
    // Süre sunucunun bitiş anından.
    expect(screen.getByLabelText("Kalan süre 12:34")).toBeTruthy();
    expect(screen.getByText("3 / 4 yanıtlandı")).toBeTruthy();

    // Taslak sunucudan yeni: cevaplar ve soru hemen kaydedilir.
    await tick(0);
    expect(net.saves()).toHaveLength(1);
    expect(net.saves()[0]).toMatchObject({
      examId: EXAM,
      cursorIndex: 2,
      flaggedIds: [Q[1]],
      answers: {
        [Q[0]]: "Pascal",
        [Q[1]]: ["Derinlik", "Yoğunluk"],
        [Q[2]]: "Cismin batan hacmi kadar sıvının ağırlığına eşittir.",
      },
    });

    // Önceki soruya dönüş taslağa hemen yazılır.
    fireEvent.click(screen.getByRole("button", { name: "← Önceki" }));
    expect(readExamDraft(window.localStorage, EXAM)?.cursor).toBe(1);
    expect(screen.getByRole("button", { name: "Soru haritasını aç" }).textContent).toContain("2 / 4");
  });

  it("başka cihazın kaydı yeniyse sunucu kazanır: o cihazın cevapları ve sorusu", async () => {
    useFakeClock();
    window.localStorage.setItem(
      examDraftKey(EXAM),
      JSON.stringify(localDraft({ answers: { [Q[0]]: "Newton" }, cursor: 0, updatedAt: Date.now() - 600_000, savedAt: Date.now() - 600_000 })),
    );
    const net = fakeFetch((url) =>
      url.includes("action=start")
        ? startReply({
            answers: { [Q[0]]: "Pascal", [Q[3]]: "Yanlış" },
            cursorIndex: 3,
            updatedAt: new Date(Date.now() - 30_000).toISOString(),
          })
        : { data: { ok: true } },
    );
    render(<ParityExamRunner examId={EXAM} prepId="prep-fizik" title="Fizik denemesi" questions={PHYSICS} />);
    await tick();
    expect(screen.getByRole("button", { name: "Soru haritasını aç" }).textContent).toContain("4 / 4");
    expect(screen.getByRole("button", { name: "Yanlış" }).className).toContain("bg-action");
    await tick(1_000);
    // Sunucuyla aynı: yeniden gönderilecek bir şey yok.
    expect(net.saves()).toHaveLength(0);
    expect(readExamDraft(window.localStorage, EXAM)?.answers).toEqual({ [Q[0]]: "Pascal", [Q[3]]: "Yanlış" });
  });

  it("seçim tarayıcıya hemen yazılır; sunucu kaydı kısa beklemeden sonra kaldığı soruyla gider", async () => {
    useFakeClock();
    const net = fakeFetch((url) => (url.includes("action=start") ? startReply() : { data: { ok: true } }));
    render(<ParityExamRunner examId={EXAM} prepId="prep-fizik" title="Fizik denemesi" questions={PHYSICS} />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: /Pascal/ }));
    expect(readExamDraft(window.localStorage, EXAM)?.answers).toEqual({ [Q[0]]: "Pascal" });
    expect(net.saves()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Sonraki →" }));
    expect(readExamDraft(window.localStorage, EXAM)?.cursor).toBe(1);
    await tick(800);
    expect(net.saves()).toHaveLength(1);
    expect(net.saves()[0]).toMatchObject({ answers: { [Q[0]]: "Pascal" }, cursorIndex: 1 });
  });

  it("açılış isteği düşerse taslakla devam: cevaplar ve süre taslaktaki bitiş anından", async () => {
    useFakeClock();
    window.localStorage.setItem(
      examDraftKey(EXAM),
      JSON.stringify(
        localDraft({ answers: { [Q[0]]: "Pascal" }, cursor: 1, deadlineAt: new Date(Date.now() + 300_000).toISOString() }),
      ),
    );
    fakeFetch(() => ({ status: 400, data: { error: "invalid_input" } }));
    render(<ParityExamRunner examId={EXAM} prepId="prep-fizik" title="Fizik denemesi" questions={PHYSICS} />);
    await tick();
    expect(screen.getByRole("button", { name: "Soru haritasını aç" }).textContent).toContain("2 / 4");
    expect(screen.getByLabelText("Kalan süre 5:00")).toBeTruthy();
  });
});

describe("yazılı deneme: sayfadan çıkış uyarısı", () => {
  it("cevap yokken sorulmaz, sınav sürerken sorulur, notlanınca sorulmaz ve taslak silinir", async () => {
    useFakeClock();
    const net = fakeFetch((url) =>
      url.includes("action=start")
        ? startReply()
        : url.includes("/exam/grade")
          ? { data: { ok: true, score: 100 } }
          : { data: { ok: true } },
    );
    render(<ParityExamRunner examId={EXAM} prepId="prep-fizik" title="Fizik denemesi" questions={[PHYSICS[0]]} />);
    await tick();
    expect(leaveWarned()).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Pascal/ }));
    expect(leaveWarned()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Sınavı bitir" }));
    fireEvent.click(screen.getByRole("button", { name: "Evet, sınavı bitir" }));
    await tick();
    expect(net.grades()[0]).toMatchObject({ examId: EXAM, answers: { [Q[0]]: "Pascal" } });
    expect(mocks.push).toHaveBeenCalledWith(`/deneme-sinavlari/prep-fizik/sonuc?examId=${EXAM}`);
    expect(leaveWarned()).toBe(false);
    expect(window.localStorage.getItem(examDraftKey(EXAM))).toBeNull();
  });
});

/* ───────────── A · Konu testi (yol düğümü) ───────────── */

const CHEMISTRY_QUIZ = {
  type: "quiz",
  questions: [
    { text: "1 mol karbon atomu kaç gramdır?", options: ["12 g", "6 g"], correct: ["12 g"], multi: false },
    { text: "Avogadro sayısı yaklaşık kaçtır?", options: ["6,02 × 10²³", "3,01 × 10²³"], correct: ["6,02 × 10²³"], multi: false },
  ],
};

const NODE_PROPS = {
  prepId: "prep-k",
  nodeId: "node-k",
  kind: "quiz" as const,
  prepTitle: "YKS Kimya",
  topicLabel: "Mol Kavramı",
  todayMood: "ready" as const,
  initialFamiliarity: "basics" as const,
};

function nodeFetch(extra: Body = {}) {
  return fakeFetch((url, body) => {
    if (body.action === "resume") {
      return {
        data: {
          ok: true,
          resumed: true,
          attemptId: "kimya-1",
          generationId: "kimya-1-gen",
          contentVersion: 1,
          payload: CHEMISTRY_QUIZ,
          answers: {},
          ...extra,
        },
      };
    }
    if (body.action === "complete") return { data: { ok: true, score: 2, total: 2 } };
    return { data: { ok: true, contentVersion: 2 } };
  });
}

describe("konu testi · Kimya: test sürerken çıkış sorulur, kaldığı soru kaydedilir", () => {
  it("cevap kaydedilmiş olsa da test bitmeden çıkış sorulur; bitince sorulmaz", async () => {
    useFakeClock();
    const net = nodeFetch();
    render(<ExamNodeSession {...NODE_PROPS} resumeEnabled />);
    await tick();
    expect(screen.getByText("1 mol karbon atomu kaç gramdır?")).toBeTruthy();
    expect(leaveWarned()).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /12 g/ }));
    await tick(400);
    expect(net.calls.filter((call) => call.body.action === "save")).toHaveLength(1);
    // Sunucu onayladı (kaydedilmemiş cevap yok) ama test sürüyor: yine sorulur.
    expect(window.localStorage.getItem(attemptDraftKey("kimya-1"))).toBeNull();
    expect(leaveWarned()).toBe(true);

    // "Sonraki soru": aynı cevaplar ve yeni soruyla kaydedilir.
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
    expect(readAttemptDraft(window.localStorage, "kimya-1")?.cursor).toBe(1);
    await tick(400);
    const saves = net.calls.filter((call) => call.body.action === "save").map((call) => call.body);
    expect(saves).toHaveLength(2);
    expect(saves[1]).toMatchObject({ answers: { "0": "12 g" }, cursorIndex: 1 });

    fireEvent.click(screen.getByRole("button", { name: /6,02/ }));
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    fireEvent.click(screen.getByRole("button", { name: "Testi bitir" }));
    await tick(0);
    expect(screen.getByLabelText("2 sorudan 2 doğru")).toBeTruthy();
    expect(leaveWarned()).toBe(false);
  });

  it("yenilenen test kaldığı soruda açılır: sunucu kaydı yetişmediyse soru taslaktan", async () => {
    useFakeClock();
    window.localStorage.setItem(
      attemptDraftKey("kimya-1"),
      JSON.stringify({ v: 1, answers: { "0": "12 g" }, cursor: 1, updatedAt: Date.now(), savedAt: null }),
    );
    nodeFetch({ answers: { "0": "12 g" }, cursorIndex: 0, updatedAt: new Date(Date.now() - 30_000).toISOString() });
    render(<ExamNodeSession {...NODE_PROPS} resumeEnabled />);
    await tick();
    expect(screen.getByText("Avogadro sayısı yaklaşık kaçtır?")).toBeTruthy();
    expect(screen.getByText("Soru 2 / 2")).toBeTruthy();
  });
});

/* ───────────── B · Telefonda klavye: 100dvh ───────────── */

describe("sohbet, sözlü ve deneme ekranları dinamik görünüm yüksekliğinde", () => {
  it("deneme ekranı 100vh değil 100dvh", () => {
    const runner = read("src/components/parity/exam-runner.tsx");
    expect(runner).toContain("min-h-[calc(100dvh-120px)]");
    expect(runner).not.toMatch(/calc\(100vh|\bh-screen\b|\bmin-h-screen\b/);
  });

  it("sohbet ve sınav sohbeti kabuğu: önce vh (eski tarayıcı), sonra dvh", () => {
    const shell = read("src/styles/parity-shell.css");
    expect(shell).toMatch(/\.cp-sor-root \{\n(?:\s*\/\*[\s\S]*?\*\/\n)?\s*min-height: 100vh;\n\s*min-height: 100dvh;/);
    expect(shell).toContain(".cp-sor-root:has(.cp-sor-composer-zone--aside) {\n    height: 100vh;\n    height: 100dvh;\n    max-height: 100vh;\n    max-height: 100dvh;");
    expect(shell).toMatch(/\.cp-sor-root\.cp-sor-root--exam \{[^}]*height: 100vh;\n\s*height: 100dvh;/);
  });

  it("sözlü deneme: önce vh, sonra dvh; sohbet, sözlü ve deneme bileşenlerinde h-screen yok", () => {
    const oral = read("src/styles/oral-exam-chrome.css");
    expect(oral).toContain("min-height: calc(100vh - 7.5rem);\n  min-height: calc(100dvh - 7.5rem);");
    for (const file of [
      "src/components/chat/chat-panel.tsx",
      "src/components/parity/oral-exam-flow.tsx",
      "src/components/parity/oral-answer-desk.tsx",
      "src/components/parity/exam-node/oral.tsx",
      "src/components/parity/exam-node/quiz.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/\b100vh\b|\bh-screen\b|\bmin-h-screen\b/);
    }
  });
});

/* ───────────── C · Uygulamanın tarayıcısı şeridi ───────────── */

const UA = {
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; tr_TR; tr; scale=3.00; 1170x2532; 615215290)",
  whatsappIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.24.20.79 iOS/17.5",
  whatsappAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 WhatsApp/2.24.21.80",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};

describe("uygulamanın tarayıcısı: 'Tarayıcıda aç' şeridi", () => {
  it("WhatsApp şeridi açar ama Google kuralını değiştirmez", () => {
    expect(inAppBrowserApp(UA.instagramIos)).toBe("Instagram");
    expect(inAppBrowserApp(UA.whatsappIos)).toBe("WhatsApp");
    expect(inAppBrowserApp(UA.whatsappAndroid)).toBe("WhatsApp");
    expect(inAppBrowserApp(UA.chromeAndroid)).toBeNull();
    expect(inAppBrowserApp(UA.safariIos)).toBeNull();
    expect(inAppBrowserApp(undefined)).toBeNull();
    expect(googleBlockedWebViewApp(UA.whatsappIos)).toBeNull();
  });

  it("Instagram'da görünür; kapatılınca bu oturumda yeniden çıkmaz", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(UA.instagramIos);
    const { unmount } = render(<InAppBrowserBanner />);
    const banner = screen.getByRole("complementary", { name: "Instagram tarayıcısı önerisi" });
    expect(banner.textContent).toContain("🌐 En iyi ses ve yükleme deneyimi için sağ üstten 'Tarayıcıda (Safari/Chrome) Aç'a dokun");
    fireEvent.click(screen.getByRole("button", { name: "Öneriyi kapat" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(window.sessionStorage.getItem(IN_APP_BANNER_DISMISS_KEY)).toBe("1");
    unmount();
    render(<InAppBrowserBanner />);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("WhatsApp'ta görünür; normal Chrome ve Safari'de görünmez", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(UA.whatsappAndroid);
    const first = render(<InAppBrowserBanner />);
    expect(screen.getByRole("complementary", { name: "WhatsApp tarayıcısı önerisi" })).toBeTruthy();
    first.unmount();

    for (const agent of [UA.chromeAndroid, UA.safariIos]) {
      vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(agent);
      const view = render(<InAppBrowserBanner />);
      expect(screen.queryByRole("complementary")).toBeNull();
      view.unmount();
    }
  });

  it("depo kapalıysa (gizli pencere) şerit yine çıkar, kapatma sayfayı düşürmez", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(UA.instagramIos);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(<InAppBrowserBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Öneriyi kapat" }));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("kök yerleşimde bir kez; sunucuda çizilmez (karar etkide), 375 px'te taşmaz", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout.match(/<InAppBrowserBanner \/>/g)).toHaveLength(1);
    const banner = read("src/components/layout/in-app-browser-banner.tsx");
    expect(banner).toContain('"use client"');
    expect(banner).toContain("useEffect(() => {");
    expect(banner).toContain("if (!app) return null;");
    const css = read("src/styles/in-app-browser-banner.css");
    expect(css).toContain("max-width: 100%;");
    expect(css).toContain("min-width: 0;");
    expect(css).toContain("overflow-wrap: anywhere;");
    expect(css).toContain("background: var(--c-surface-2);");
    expect(css).not.toMatch(/position:\s*fixed/);
  });
});

/* Sunucuda çizim: şerit hiçbir şey basmaz (hidrasyon aynı kalsın). */
describe("uygulamanın tarayıcısı şeridi: sunucu çizimi", () => {
  it("renderToString boş döner", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(UA.instagramIos);
    const { renderToString } = await import("react-dom/server");
    expect(renderToString(<InAppBrowserBanner />)).toBe("");
  });
});

/* Taslak açılışta istek düşerse saat taslaktan sürer ama geçmiş bitiş anı sınavı göndermez. */
describe("yazılı deneme: geçmiş bitiş anı", () => {
  it("taslaktaki bitiş geçmişse ve sunucu yanıt vermediyse sınav kendiliğinden gönderilmez", async () => {
    useFakeClock();
    window.localStorage.setItem(
      examDraftKey(EXAM),
      JSON.stringify(localDraft({ answers: { [Q[0]]: "Pascal" }, deadlineAt: new Date(Date.now() - 10_000).toISOString() })),
    );
    const net = fakeFetch(() => ({ status: 503, data: { error: "unavailable" } }));
    render(<ParityExamRunner examId={EXAM} prepId="prep-fizik" title="Fizik denemesi" questions={PHYSICS} />);
    await tick(13_000);
    expect(net.grades()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Soru haritasını aç" })).toBeTruthy();
    expect(screen.queryByText("Süre doldu")).toBeNull();
  });
});
