// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { ExamNodeSession } from "@/components/parity/exam-node-session";

/*
  Oturum ekranının yaşam döngüsü (30 Ekim 2026, ürün sahibi: "bir yeri yapıyoruz öbür yer bozuluyor"). Ekran tek
  yaşam döngüsü kancasına ve tür başına çizim bileşenlerine bölünmeden ÖNCE yazıldı, eski kodda yeşildi: açılış bir
  kez, sunucu özellikleri yenilenince (router.refresh) aşama korunur, başlat → oyna → bitir → sonuç, bekleme ve
  yoklama, tekrarla / farklı anlat, ısınma, parça parça açılan dersin yoklaması, yazılı denemenin kayıtlı incelemesi.
  Gözlenen yalnız öğrencinin gördüğü (ekran) ve sunucuya gidenler (istek gövdeleri).
*/

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: nav.refresh }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
vi.mock("@/lib/student/student-shell-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/student/student-shell-context")>()),
  useIsFounder: () => false,
}));

type Body = Record<string, unknown>;
type Reply = { status?: number; data?: Body } | Promise<{ status?: number; data?: Body }>;

function stubFetch(route: (body: Body, count: number) => Reply) {
  const bodies: Body[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Body;
    bodies.push({ url: String(input), ...body });
    const count = bodies.filter((item) => item.action === body.action).length;
    const reply = await route(body, count);
    const status = reply.status ?? 200;
    return new Response(JSON.stringify(reply.data ?? {}), { status });
  });
  vi.stubGlobal("fetch", fn);
  return {
    bodies,
    actions: () => bodies.filter((body) => String(body.url).includes("/exam-prep/node")).map((body) => String(body.action)),
    of: (action: string) => bodies.filter((body) => body.action === action),
  };
}

type Props = ComponentProps<typeof ExamNodeSession>;
const BASE: Props = {
  prepId: "prep-1",
  nodeId: "node-1",
  kind: "quiz",
  prepTitle: "YKS Biyoloji",
  topicLabel: "Hücre Bölünmesi",
  todayMood: "ready",
  initialFamiliarity: "basics",
};

const QUIZ = {
  type: "quiz",
  questions: [{ text: "Mitozda kromozom sayısı nasıl değişir?", options: ["Değişmez", "Yarıya iner"], correct: ["Değişmez"], multi: false }],
};

function started(payload: Body, extra: Body = {}) {
  return { data: { ok: true, attemptId: "attempt-1", generationId: "gen-1", contentVersion: 1, payload, ...extra } };
}

beforeEach(() => {
  nav.push.mockClear();
  nav.refresh.mockClear();
  try {
    window.sessionStorage.clear();
    window.localStorage.clear();
  } catch {
    // jsdom
  }
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("açılış", () => {
  it("açık oturum: 'kaldığın yer' ekranı, sonra sorular; yenileme aşamayı değiştirmez, açılış bir kez", async () => {
    let release: (value: Reply) => void = () => undefined;
    const pending = new Promise<{ status?: number; data?: Body }>((resolve) => (release = resolve as typeof release));
    const net = stubFetch((body) => (body.action === "resume" ? pending : { data: {} }));
    const view = render(<ExamNodeSession {...BASE} resumeEnabled />);
    expect(screen.getByText("Kaldığın yer açılıyor…")).toBeTruthy();
    await act(async () => {
      release({ data: { ok: true, resumed: true, attemptId: "attempt-1", generationId: "gen-1", payload: QUIZ } });
    });
    await screen.findByText("Mitozda kromozom sayısı nasıl değişir?");
    view.rerender(<ExamNodeSession {...BASE} resumeEnabled openAttempt={false} />);
    view.rerender(<ExamNodeSession {...BASE} resumeEnabled openAttempt />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText("Mitozda kromozom sayısı nasıl değişir?")).toBeTruthy();
    expect(net.actions()).toEqual(["resume"]);
    expect(net.of("resume")[0]).toMatchObject({ prepId: "prep-1", nodeId: "node-1", action: "resume", lessonFormat: 3 });
  });

  it("açık oturum yoksa kurulum kartı; başlat isteği seçimleri ve kalıcı istek kimliğini taşır", async () => {
    const net = stubFetch((body) => (body.action === "start" ? started(QUIZ) : { data: {} }));
    render(<ExamNodeSession {...BASE} resumeEnabled openAttempt={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Testi oluştur" }));
    await screen.findByText("Mitozda kromozom sayısı nasıl değişir?");
    const start = net.of("start")[0]!;
    expect(start).toMatchObject({ action: "start", lessonFormat: 3, difficulty: "orta", voiceMode: false, familiarity: "basics", mood: "ready" });
    expect(typeof start.clientRequestId).toBe("string");
    expect(window.sessionStorage.getItem("exam-node-req:prep-1:node-1")).toBe(start.clientRequestId);
    expect(net.actions()).toEqual(["start"]);
  });

  it("ders: ısınma kurulum kartında bir kez istenir; hazırlık ekranı kendiliğinden başlar", async () => {
    const net = stubFetch(() => ({ data: { ok: true } }));
    render(<ExamNodeSession {...BASE} kind="lesson" resumeEnabled openAttempt={false} />);
    await waitFor(() => expect(net.of("warm")).toHaveLength(1));
    expect(net.of("warm")[0]).toMatchObject({ action: "warm", familiarity: "basics", lessonFormat: 3 });
    cleanup();
    const ready = stubFetch((body) =>
      body.action === "start" ? started({ type: "readiness", screen: { headline: "Neredeyse hazırsın", ready: false, lead: "İki konu kaldı.", topics: [], actions: [], mockLine: "" } }) : { data: { ok: true } },
    );
    render(<ExamNodeSession {...BASE} kind="readiness" resumeEnabled openAttempt={false} />);
    await waitFor(() => expect(ready.of("start")).toHaveLength(1));
    // Hazır olma ekranı görülünce adım tamamlanır (düğme beklenmez).
    await waitFor(() => expect(ready.of("complete")).toHaveLength(1));
  });

  it("yazılı deneme: açık oturum yoksa kayıtlı inceleme sonuç ekranında açılır", async () => {
    const net = stubFetch((body) =>
      body.action === "resume"
        ? { data: { ok: true, resumed: false } }
        : body.action === "review"
          ? { data: { ok: true, review: { score: 3, total: 5, items: [], byTopic: [] }, score: 3, total: 5 } }
          : { data: {} },
    );
    render(<ExamNodeSession {...BASE} kind="written_exam" resumeEnabled />);
    await waitFor(() => expect(net.actions()).toEqual(["resume", "review"]));
    expect(net.of("review")[0]).toMatchObject({ action: "review", lessonFormat: 3 });
    await screen.findByText("Yazılı deneme sonucu");
    expect(screen.getByText("3/5")).toBeTruthy();
  });
});

describe("bitirme", () => {
  it("test: sonuç hemen görünür, bitirme isteği arkada; yıldız ve yenileme yanıtla gelir", async () => {
    const net = stubFetch((body) =>
      body.action === "resume"
        ? { data: { ok: true, resumed: true, attemptId: "attempt-1", generationId: "gen-1", payload: QUIZ } }
        : body.action === "complete"
          ? { data: { ok: true, score: 1, total: 1, stars: 10, nextHref: "/deneme-sinavlari/prep-1/dugum/node-2" } }
          : { data: { ok: true, contentVersion: 2, generationId: "gen-1" } },
    );
    render(<ExamNodeSession {...BASE} resumeEnabled />);
    await screen.findByText("Mitozda kromozom sayısı nasıl değişir?");
    fireEvent.click(screen.getByRole("button", { name: /Değişmez/ }));
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    fireEvent.click(screen.getByRole("button", { name: "Testi bitir" }));
    expect(screen.getByLabelText("1 sorudan 1 doğru")).toBeTruthy();
    await screen.findByText(/\+10 yıldız/);
    const complete = net.of("complete")[0]!;
    expect(complete).toMatchObject({ action: "complete", attemptId: "attempt-1", generationId: "gen-1", gradingAsync: true, lessonFormat: 3 });
    expect(typeof complete.completeRequestId).toBe("string");
    expect(complete.answers).toMatchObject({ "0": "Değişmez", __meta: { hintsUsed: {} } });
    expect(nav.refresh).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Devam et" }).getAttribute("href")).toBe("/deneme-sinavlari/prep-1/dugum/node-2");
  });

  it("sunucu notluyorsa 'Değerlendiriliyor…' ve yoklama; sonuç gelince sonuç ekranı", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const net = stubFetch((body) =>
      body.action === "resume" && !body.attemptId
        ? {
            data: {
              ok: true,
              resumed: true,
              attemptId: "attempt-1",
              generationId: "gen-1",
              payload: { type: "practice_empty", practice: "focused", message: "Bu konu için kayıtlı soru yok." },
            },
          }
        : body.action === "complete"
          ? { data: { ok: true, grading: true, state: "grading", attemptId: "attempt-1" } }
          : body.action === "resume"
            ? { data: { ok: true, completed: true, score: 1, total: 1, nextHref: "/deneme-sinavlari/prep-1" } }
            : { data: {} },
    );
    render(<ExamNodeSession {...BASE} kind="focused" resumeEnabled />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "Bu adımı tamamla" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Değerlendiriliyor…")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByText("Bu adım kaydedildi")).toBeTruthy();
    expect(net.actions()).toEqual(["resume", "complete", "resume"]);
    expect(net.of("resume")[1]).toMatchObject({ action: "resume", attemptId: "attempt-1" });
  });

  it("ders sonu: 'Dersi tekrarla' kayıtlı dersi yeniden açar, 'Farklı anlat' kurulum kartına döner", async () => {
    const lesson = { type: "lesson", title: "Hücre Bölünmesi", contentMd: "Mitoz eş hücre verir." };
    const net = stubFetch((body) =>
      body.action === "resume"
        ? { data: { ok: true, resumed: true, attemptId: "attempt-1", generationId: "gen-1", payload: lesson } }
        : body.action === "complete"
          ? { data: { ok: true, score: 1, total: 1 } }
          : body.action === "start"
            ? started(lesson, { attemptId: "attempt-2" })
            : { data: { ok: true } },
    );
    render(<ExamNodeSession {...BASE} kind="lesson" resumeEnabled />);
    fireEvent.click(await screen.findByRole("button", { name: "Bitir" }));
    await screen.findByText("Dersin tamamı bu kadar");
    fireEvent.click(screen.getByRole("button", { name: "Dersi tekrarla" }));
    await waitFor(() => expect(net.of("start")).toHaveLength(1));
    expect(net.of("start")[0]).toMatchObject({ action: "start", replay: true, lessonStream: true });
    await screen.findByRole("button", { name: "Bitir" });
    fireEvent.click(screen.getByRole("button", { name: "Bitir" }));
    await screen.findByText("Dersin tamamı bu kadar");
    fireEvent.click(screen.getByRole("button", { name: "Farklı anlat" }));
    expect(screen.queryByText("Dersin tamamı bu kadar")).toBeNull();
    expect(net.of("start")).toHaveLength(1);
  });
});

describe("parça parça açılan içerik", () => {
  it("yazımı süren ders kayıttan yoklanır; yazım bitince yoklama durur", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const lesson = {
      format: 3,
      title: "Hücre Bölünmesi",
      screens: [
        {
          heading: "Mitoz",
          concept: "Mitoz",
          blocks: [
            { type: "text", text: "Mitoz eş hücre verir." },
            { type: "check", check: { type: "trueFalse", prompt: "Mitoz eş hücre verir.", options: ["Doğru", "Yanlış"] } },
          ],
        },
      ],
    };
    const net = stubFetch((body, count) =>
      body.action === "start"
        ? started({ type: "lesson", lesson, building: true, upcoming: ["Mayoz"] })
        : body.action === "progress"
          ? { data: { ok: true, building: count < 2, payload: { type: "lesson", lesson, building: count < 2 } } }
          : { data: { ok: true } },
    );
    render(<ExamNodeSession {...BASE} kind="lesson" resumeEnabled openAttempt={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole("button", { name: /Ders oluştur|Dersi oluştur|Oluştur/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(net.of("start")[0]).toMatchObject({ lessonStream: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(net.of("progress")).toHaveLength(2);
    expect(net.of("progress")[0]).toMatchObject({ action: "progress", attemptId: "attempt-1", lessonFormat: 3 });
  });
});
