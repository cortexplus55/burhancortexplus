// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PREP_REVIEW_COPY, PrepReviewSession } from "@/components/parity/prep-review-session";
import { ExamPrepHome, type HomeNode } from "@/components/parity/exam-prep-home";
import type { ServedReviewItem } from "@/lib/learning/review-items";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

/**
 * Günü gelen tekrarın oynatıcısı ve hazırlık sayfasındaki "Bugün N tekrar" kartı (20 Ekim 2026).
 * Not sunucuda: sayfada doğru cevap yok; ağ düşerse soru geçilmez; kart yolu ve "Devam et"i değiştirmez.
 */

const PREP = "prep-1";
const choice: ServedReviewItem = {
  id: "i-1",
  mode: "choice",
  prompt: "Hangisi bir sera gazıdır?",
  options: ["Argon", "Karbondioksit", "Azot"],
  multi: false,
  topicLabel: "Atmosfer",
  sourceLabel: "Test sorusu",
  reasonLabel: null,
};
const multi: ServedReviewItem = {
  id: "i-2",
  mode: "choice",
  prompt: "Hangileri asittir?",
  options: ["HCl", "NaOH", "HNO3"],
  multi: true,
  topicLabel: "Asitler",
  sourceLabel: "Test sorusu",
  reasonLabel: "Sınav noktası",
};
const recall: ServedReviewItem = {
  id: "i-3",
  mode: "recall",
  front: "Mitoz kaç hücre verir?",
  back: "İki özdeş hücre.",
  topicLabel: "Hücre",
  sourceLabel: "Kart",
  reasonLabel: null,
};

type Sent = { url: string; body: Record<string, unknown> };
function stubFetch(responses: { status: number; body: Record<string, unknown> }[]) {
  const sent: Sent[] = [];
  let index = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      const next = responses[Math.min(index, responses.length - 1)]!;
      index += 1;
      if (next.status === 0) throw new Error("offline");
      return new Response(JSON.stringify(next.body), { status: next.status });
    }),
  );
  return sent;
}

const outcome = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  correct: false,
  mode: "choice",
  correctAnswers: ["Karbondioksit"],
  explanation: "CO₂ ısıyı tutar.",
  step: 0,
  dueOn: "2026-10-21",
  status: "active",
  line: "Yanlış · yarın yeniden sorulacak",
  remaining: 0,
  ...overrides,
});

describe("tekrar oturumu", () => {
  it("sayfada doğru cevap ve açıklama yok; seçip kontrol edince doğru gövde gider, geri bildirim ve satır görünür", async () => {
    const sent = stubFetch([{ status: 200, body: outcome() }]);
    const { container } = render(<PrepReviewSession prepId={PREP} prepTitle="Kimya" items={[choice]} total={1} />);
    expect(container.innerHTML).not.toContain("CO₂ ısıyı tutar");
    expect(screen.getByRole("heading", { name: PREP_REVIEW_COPY.title })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kapat" }).getAttribute("href")).toBe(`/deneme-sinavlari/${PREP}`);
    fireEvent.click(screen.getByRole("radio", { name: /Argon/ }));
    fireEvent.click(screen.getByRole("button", { name: PREP_REVIEW_COPY.check }));
    await screen.findByText("Yanlış · yarın yeniden sorulacak");
    expect(sent).toEqual([{ url: "/api/learning/exam-prep/review", body: { prepId: PREP, itemId: "i-1", pick: "Argon" } }]);
    expect(screen.getByText("CO₂ ısıyı tutar.")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Karbondioksit/ }).className).toContain("is-right");
    expect(screen.getByRole("radio", { name: /Argon/ }).className).toContain("is-wrong");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(PREP_REVIEW_COPY.finish) }));
    expect(screen.getByRole("heading", { name: PREP_REVIEW_COPY.done })).toBeTruthy();
    expect(screen.getByText(/1 sorudan 0 doğru/)).toBeTruthy();
  });

  it("çok cevaplıda seçimler açılıp kapanır; dizi gönderilir", async () => {
    const sent = stubFetch([{ status: 200, body: outcome({ correct: true, correctAnswers: ["HCl", "HNO3"], line: "Doğru · 3 gün sonra yeniden" }) }]);
    render(<PrepReviewSession prepId={PREP} prepTitle="Kimya" items={[multi]} total={1} />);
    expect(screen.getByText("Sınav noktası")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /NaOH/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /HCl/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /NaOH/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /HNO3/ }));
    fireEvent.click(screen.getByRole("button", { name: PREP_REVIEW_COPY.check }));
    await screen.findByText("Doğru · 3 gün sonra yeniden");
    expect(sent[0]!.body.pick).toEqual(["HCl", "HNO3"]);
  });

  it("hatırlama: önce cevap açılır, sonra Evet/Hayır gönderilir", async () => {
    const sent = stubFetch([{ status: 200, body: outcome({ mode: "recall", correct: false, line: "Hatırlamadın · yarın yeniden sorulacak", correctAnswers: undefined }) }]);
    render(<PrepReviewSession prepId={PREP} prepTitle="Biyoloji" items={[recall]} total={1} />);
    expect(screen.queryByText("İki özdeş hücre.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: PREP_REVIEW_COPY.reveal }));
    expect(screen.getByText("İki özdeş hücre.")).toBeTruthy();
    expect(screen.getByText(PREP_REVIEW_COPY.ask)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hayır" }));
    await screen.findByText("Hatırlamadın · yarın yeniden sorulacak");
    expect(sent[0]!.body).toEqual({ prepId: PREP, itemId: "i-3", recalled: false });
  });

  it("ağ düşerse soru geçilmez; yeniden denenince kaydedilir", async () => {
    stubFetch([
      { status: 0, body: {} },
      { status: 200, body: outcome() },
    ]);
    render(<PrepReviewSession prepId={PREP} prepTitle="Kimya" items={[choice, recall]} total={2} />);
    fireEvent.click(screen.getByRole("radio", { name: /Azot/ }));
    fireEvent.click(screen.getByRole("button", { name: PREP_REVIEW_COPY.check }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toBe(PREP_REVIEW_COPY.saveFailed);
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: new RegExp(PREP_REVIEW_COPY.next) })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: PREP_REVIEW_COPY.retry }));
    await screen.findByText("Yanlış · yarın yeniden sorulacak");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(PREP_REVIEW_COPY.next) }));
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });

  it("kalan tekrar varsa bitişte 'Kalan N tekrar · Devam et' sayfayı tazeler; hiç yoksa boş ekran", async () => {
    stubFetch([{ status: 200, body: outcome({ remaining: 7 }) }]);
    render(<PrepReviewSession prepId={PREP} prepTitle="Kimya" items={[choice]} total={8} />);
    fireEvent.click(screen.getByRole("radio", { name: /Argon/ }));
    fireEvent.click(screen.getByRole("button", { name: PREP_REVIEW_COPY.check }));
    await screen.findByText("Yanlış · yarın yeniden sorulacak");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(PREP_REVIEW_COPY.finish) }));
    fireEvent.click(screen.getByRole("button", { name: "Kalan 7 tekrar · Devam et" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    cleanup();
    render(<PrepReviewSession prepId={PREP} prepTitle="Kimya" items={[]} total={0} />);
    expect(screen.getByText(PREP_REVIEW_COPY.empty)).toBeTruthy();
    expect(screen.getByRole("link", { name: PREP_REVIEW_COPY.back }).getAttribute("href")).toBe(`/deneme-sinavlari/${PREP}`);
  });

  it("bekleyen tekrar varsa başlık 'Bu tur bitti' der, hepsi bitince 'Bugünkü tekrar bitti'; cevapsız bitişte sayı satırı yok", async () => {
    stubFetch([{ status: 200, body: outcome({ remaining: 7 }) }]);
    render(<PrepReviewSession prepId={PREP} prepTitle="Kimya" items={[choice]} total={8} />);
    fireEvent.click(screen.getByRole("radio", { name: /Argon/ }));
    fireEvent.click(screen.getByRole("button", { name: PREP_REVIEW_COPY.check }));
    await screen.findByText("Yanlış · yarın yeniden sorulacak");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(PREP_REVIEW_COPY.finish) }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(PREP_REVIEW_COPY.roundDone);
    expect(screen.queryByText(PREP_REVIEW_COPY.done)).toBeNull();
    cleanup();
    stubFetch([{ status: 200, body: outcome({ remaining: 0 }) }]);
    render(<PrepReviewSession prepId={PREP} prepTitle="Kimya" items={[choice]} total={1} />);
    fireEvent.click(screen.getByRole("radio", { name: /Argon/ }));
    fireEvent.click(screen.getByRole("button", { name: PREP_REVIEW_COPY.check }));
    await screen.findByText("Yanlış · yarın yeniden sorulacak");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(PREP_REVIEW_COPY.finish) }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(PREP_REVIEW_COPY.done);
    expect(screen.getByText("1 sorudan 0 doğru · Kimya")).toBeTruthy();
    cleanup();
    // Her soru başka yerde bitmişse (409) hiçbir şey cevaplanmadan bitiş: "0 sorudan 0 doğru" yazılmaz.
    stubFetch([{ status: 409, body: { error: "not_due" } }]);
    render(<PrepReviewSession prepId={PREP} prepTitle="Kimya" items={[choice]} total={1} />);
    fireEvent.click(screen.getByRole("radio", { name: /Argon/ }));
    fireEvent.click(screen.getByRole("button", { name: PREP_REVIEW_COPY.check }));
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/sorudan/)).toBeNull();
  });

  it("başka yerde bitmiş soru (409) hata ekranı açmaz, geçilir", async () => {
    stubFetch([{ status: 409, body: { code: "not_due" } }]);
    render(<PrepReviewSession prepId={PREP} prepTitle="Kimya" items={[choice, recall]} total={2} />);
    fireEvent.click(screen.getByRole("radio", { name: /Azot/ }));
    fireEvent.click(screen.getByRole("button", { name: PREP_REVIEW_COPY.check }));
    await screen.findByText(PREP_REVIEW_COPY.gone);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(PREP_REVIEW_COPY.next) }));
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });
});

const lesson: HomeNode = { id: "lesson-1", kind: "lesson", title: "Giriş Dersi", dayIndex: 1, sortOrder: 0, status: "ready" };
const podcast: HomeNode = { id: "pod-1", kind: "podcast", title: "Podcast Dinle", dayIndex: 1, sortOrder: 1, status: "locked" };

function renderHome(dueReviews?: number) {
  return render(
    <ExamPrepHome
      prepId={PREP}
      title="Termodinamik"
      examType="Okul"
      examDate={null}
      daysLabel=""
      progressPct={0}
      nodes={[lesson, podcast]}
      hasTopic
      needsIntro={false}
      startHref="/deneme-sinavlari/prep-1/sonraki"
      topicCount={2}
      topicsDone={0}
      topicLabels={["Sistemler", "Enerji"]}
      {...(dueReviews === undefined ? {} : { dueReviews })}
    />,
  );
}

describe("hazırlık sayfası: Bugün N tekrar", () => {
  it("tekrar yoksa kart yok; varsa başlık ve bağlantı; 'Devam et' ve sıradaki değişmez", () => {
    renderHome();
    expect(screen.queryByRole("heading", { name: /Bugün \d+ tekrar/ })).toBeNull();
    const before = screen.getByRole("link", { name: "Devam et" }).getAttribute("href");
    cleanup();
    const { container } = renderHome(5);
    expect(screen.getByRole("heading", { name: "Bugün 5 tekrar" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tekrara başla" }).getAttribute("href")).toBe("/deneme-sinavlari/prep-1/tekrar");
    expect(screen.getByRole("link", { name: "Devam et" }).getAttribute("href")).toBe(before);
    expect(before).toBe("/deneme-sinavlari/prep-1/dugum/lesson-1");
    // Kart yolun "Sıradaki" kartının dışında; rozet sırası aynı.
    const next = container.querySelector(".cp-path-next") as HTMLElement;
    expect([...next.querySelectorAll(".cp-prep-badge")].map((item) => item.textContent)).toEqual(["Sıradaki", "Giriş Dersi"]);
  });

  it("kart geniş ekranda gizlenen sınıfı kullanmaz", () => {
    const css = readFileSync("src/styles/prep-review.css", "utf8");
    expect(css).toContain(".cp-prep-due {");
    expect(readFileSync("src/components/parity/prep-review-card.tsx", "utf8")).not.toContain("cp-prep-last");
  });
});
