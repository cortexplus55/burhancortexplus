// @vitest-environment jsdom
/*
  Paket 2 akış düzeltmeleri (6 Kasım 2026): hata yolları görünür ve yeniden denenebilir, sohbet listesi
  uygulama içi tarayıcıda çalışır (prompt/confirm yok), pencereler Esc ile kapanır ve odağı geri verir,
  test aracı ağ düşse de doğru sayıyı gösterir.
*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: routerRefresh, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));

// Test aracının kabuğu sade tutulur: yalnız akışın kendisi denenir.
const postStudio = vi.fn();
vi.mock("@/components/learning/studio/studio-shared", () => ({
  postStudio: (...args: unknown[]) => postStudio(...args),
  StudioFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StudioEntry: ({ onSubmit }: { onSubmit: (topic: string) => void }) => (
    <button type="button" onClick={() => onSubmit("Hücre")}>
      Testi başlat
    </button>
  ),
  StudioLoading: () => <p>Yükleniyor</p>,
  StudioPaywall: () => null,
  StudioProgress: () => null,
}));
vi.mock("@/components/learning/studio/studio-setup", () => ({
  documentSuggestions: () => undefined,
  sourceNotice: () => null,
  StudioChoices: () => null,
  StudioSetup: () => null,
  StudioSourcePicker: () => null,
}));
vi.mock("@/lib/learning/studio-sound", () => ({ playPlusTone: vi.fn() }));

import { AdaptiveStudySession } from "@/components/parity/adaptive-study-session";
import { MistakeRunner } from "@/components/parity/mistake-runner";
import { SohbetlerList } from "@/components/parity/sohbetler-list";
import { QuizStudio, localQuizStats } from "@/components/learning/studio/quiz-studio";
import { useDismiss } from "@/lib/ui/use-dismiss";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  toastError.mockReset();
  postStudio.mockReset();
  routerRefresh.mockReset();
});

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const SESSION = { id: "s1", objective: "Hücre bölünmesi", plannedDurationMinutes: 20, completionPct: 0 };
const ACTION = {
  action: "teach",
  topicId: "t1",
  topicKey: "hucre",
  teachingMode: "x",
  difficulty: "orta",
  durationTarget: 5,
  reasonCode: "r",
  reasonCopy: "Neden",
  decisionTraceId: "d1",
};
const CONTENT = {
  id: "c1",
  action: "teach",
  kind: "k",
  title: "Mitoz",
  bodyMarkdown: "Anlatım",
  question: null,
  decisionTraceId: "d1",
};

function routeAdaptive(overrides: Record<string, () => Promise<Response>> = {}) {
  fetchMock.mockImplementation((url: string) => {
    const key = String(url).split("/").pop()!;
    if (overrides[key]) return overrides[key]();
    if (key === "start") return json({ ok: true, session: SESSION, action: ACTION });
    if (key === "content") return json({ ok: true, content: CONTENT });
    if (key === "complete") return json({ ok: true, summary: null });
    if (key === "next") return json({ ok: true, action: ACTION });
    return json({ ok: false }, 404);
  });
}

describe("uyarlamalı oturum", () => {
  it("bitince birincil düğme hazırlığa döner, ikincil ana sayfa /ogretmen", async () => {
    routeAdaptive();
    render(<AdaptiveStudySession prepId="p1" prepTitle="Biyoloji" daysRemaining={3} />);
    fireEvent.click(await screen.findByRole("button", { name: "Oturumu bitir" }));
    const back = await screen.findByRole("link", { name: "Hazırlığa dön" });
    expect(back.getAttribute("href")).toBe("/deneme-sinavlari/p1");
    expect(screen.getByRole("link", { name: "Ana sayfaya dön" }).getAttribute("href")).toBe("/ogretmen");
  });

  it("bitirme isteği düşerse hata görünür, 'Tekrar dene' aynı isteği yineler", async () => {
    let fail = true;
    routeAdaptive({
      complete: () => (fail ? Promise.reject(new TypeError("Failed to fetch")) : json({ ok: true, summary: null })),
    });
    render(<AdaptiveStudySession prepId="p1" prepTitle="Biyoloji" daysRemaining={3} />);
    const finish = await screen.findByRole("button", { name: "Oturumu bitir" });
    fireEvent.click(finish);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Bağlantı sorunu; oturum kapatılamadı."),
    );
    // Düğmeler kilitli kalmaz.
    await waitFor(() => expect((finish as HTMLButtonElement).disabled).toBe(false));
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(await screen.findByRole("link", { name: "Hazırlığa dön" })).toBeTruthy();
  });

  it("ok:false cevabı da hata sayılır, ekran 'tamamlandı'ya geçmez", async () => {
    routeAdaptive({ complete: () => json({ ok: false }, 500) });
    render(<AdaptiveStudySession prepId="p1" prepTitle="Biyoloji" daysRemaining={3} />);
    fireEvent.click(await screen.findByRole("button", { name: "Oturumu bitir" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Oturum şu an kapatılamadı.");
    expect(screen.queryByText("Bugün tamamlandı")).toBeNull();
  });

  it("sıradaki adım isteği düşerse hata ve tekrar deneme", async () => {
    routeAdaptive({ next: () => Promise.reject(new TypeError("Failed to fetch")) });
    render(<AdaptiveStudySession prepId="p1" prepTitle="Biyoloji" daysRemaining={3} />);
    fireEvent.click(await screen.findByRole("button", { name: "Anladım, devam" }));
    expect((await screen.findByRole("alert")).textContent).toContain("sıradaki adım alınamadı");
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeTruthy();
  });

  it("elle tercih ağ düşünce 'kaydedildi' demez", async () => {
    routeAdaptive({ next: () => Promise.reject(new TypeError("Failed to fetch")) });
    render(<AdaptiveStudySession prepId="p1" prepTitle="Biyoloji" daysRemaining={3} />);
    fireEvent.click(await screen.findByRole("button", { name: "Daha kolay örnek" }));
    await screen.findByRole("alert");
    expect(screen.queryByText(/Tercihin kaydedildi/)).toBeNull();
  });
});

describe("yanlışlar defteri koşucusu", () => {
  it("ağ hatasında 'Yanıtın kaydedilemedi' görünür, düğme kilitli kalmaz", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(
      <MistakeRunner
        question={{
          id: "m1",
          source: "quiz",
          questionText: "Soru?",
          options: ["A şıkkı", "B şıkkı"],
          correctStreak: 0,
          wrongCount: 1,
          topicLabel: null,
        } as never}
        position={1}
        total={1}
        onNext={() => undefined}
        nextLabel="Sonraki"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "A şıkkı" }));
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    expect(await screen.findByText(/Yanıtın kaydedilemedi/)).toBeTruthy();
    expect(screen.queryByText("Kontrol ediliyor…")).toBeNull();
  });
});

describe("sohbet listesi", () => {
  const items = [{ id: "c1", title: "Eski ad", updatedAt: "2026-11-06T08:00:00.000Z" }];
  const now = "2026-11-06T10:00:00.000Z";

  it("satır içi ad değiştirme: Enter kaydeder, prompt kullanılmaz", async () => {
    const prompt = vi.spyOn(window, "prompt");
    fetchMock.mockImplementation(() => json({ ok: true }));
    render(<SohbetlerList items={items} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Yeniden adlandır" }));
    const input = screen.getByRole("textbox", { name: "Sohbet adı" });
    fireEvent.change(input, { target: { value: "Yeni ad" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("Yeni ad")).toBeTruthy();
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body).toEqual({ conversationId: "c1", title: "Yeni ad" });
    expect(prompt).not.toHaveBeenCalled();
  });

  it("Esc vazgeçer, istek atılmaz", () => {
    render(<SohbetlerList items={items} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Yeniden adlandır" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Sohbet adı" }), { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Sohbet adı" })).toBeNull();
    expect(screen.getByText("Eski ad")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("iki adımlı silme: Sil → Silinsin mi? → Evet; confirm kullanılmaz", async () => {
    const confirm = vi.spyOn(window, "confirm");
    fetchMock.mockImplementation(() => json({ ok: true }));
    render(<SohbetlerList items={items} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Sohbeti sil" }));
    expect(screen.getByText("Silinsin mi?")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Evet" }));
    await waitFor(() => expect(screen.queryByText("Eski ad")).toBeNull());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ conversationId: "c1", deleted: true });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("Vazgeç silmeyi iptal eder; ağ hatası satırda görünür", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SohbetlerList items={items} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Sohbeti sil" }));
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByText("Silinsin mi?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sohbeti sil" }));
    fireEvent.click(screen.getByRole("button", { name: "Evet" }));
    expect((await screen.findByRole("alert")).textContent).toContain("sohbet silinemedi");
    expect(screen.getByText("Eski ad")).toBeTruthy();
  });
});

function DismissHarness() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDismiss(open, () => setOpen(false), { initialFocus: closeRef });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Aç
      </button>
      {open ? (
        <div role="dialog" aria-modal="true">
          <button type="button" ref={closeRef} onClick={() => setOpen(false)}>
            Kapat
          </button>
        </div>
      ) : null}
    </div>
  );
}

describe("useDismiss", () => {
  it("Esc kapatır, ilk odak verilir, kapanınca odak açan düğmeye döner", async () => {
    render(<DismissHarness />);
    const opener = screen.getByRole("button", { name: "Aç" });
    opener.focus();
    fireEvent.click(opener);
    const close = screen.getByRole("button", { name: "Kapat" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("kapalıyken Esc bir şey çağırmaz", () => {
    const onClose = vi.fn();
    function Closed() {
      useDismiss(false, onClose);
      return null;
    }
    render(<Closed />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("test aracı sonucu", () => {
  it("yerel sayım: doğru, yanlış ve boş toplamı soru sayısı", () => {
    const qs = [
      { id: "a", correct: "x" },
      { id: "b", correct: "y" },
      { id: "c", correct: "z" },
    ];
    expect(localQuizStats(qs, { a: "x", b: "q" })).toEqual({ correct: 1, incorrect: 1, blank: 1 });
  });

  it("notlama isteği düşerse sayılar cevaplardan, 'Sonuç kaydedilemedi' notu", async () => {
    postStudio.mockResolvedValue({
      ok: true,
      data: {
        quizId: "q1",
        title: "Hücre",
        questions: [
          { id: "1", text: "Soru 1", options: ["Doğru1", "Yanlış1"], correct: "Doğru1" },
          { id: "2", text: "Soru 2", options: ["Doğru2", "Yanlış2"], correct: "Doğru2" },
        ],
      },
    });
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<QuizStudio creditCost={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Testi başlat" }));
    fireEvent.click(await screen.findByRole("button", { name: /Doğru1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sonraki soru" }));
    fireEvent.click(await screen.findByRole("button", { name: /Yanlış2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sonucu gör" }));
    expect(await screen.findByText("Doğru 1 · Yanlış 1 · Boş 0")).toBeTruthy();
    expect(screen.getByText(/Sonuç kaydedilemedi/)).toBeTruthy();
    expect(screen.getByText("%50")).toBeTruthy();
  });

  it("yanlışsız sonuçta 'Çalışmaya devam et' Araçlar'a gider", async () => {
    postStudio.mockResolvedValue({
      ok: true,
      data: { quizId: null, questions: [{ id: "1", text: "Soru 1", options: ["Evet", "Hayır"], correct: "Evet" }] },
    });
    render(<QuizStudio creditCost={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Testi başlat" }));
    fireEvent.click(await screen.findByRole("button", { name: /Evet/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sonucu gör" }));
    const link = await screen.findByRole("link", { name: "Çalışmaya devam et" });
    expect(link.getAttribute("href")).toBe("/araclar");
    expect(screen.queryByText(/Sonuç kaydedilemedi/)).toBeNull();
  });
});
