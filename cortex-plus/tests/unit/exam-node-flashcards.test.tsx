// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamNodeSession } from "@/components/parity/exam-node-session";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/student/student-shell-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/student/student-shell-context")>()),
  useIsFounder: () => false,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CARDS = [
  { front: "Hedef boy nasıl hesaplanır?", back: "Anne ve baba boyu toplanır, cinsiyete göre 13 cm düzeltilir, ikiye bölünür." },
  { front: "3. persentil kaç SD'ye denk gelir?", back: "Yaklaşık -1,88 SD." },
];

function renderResumedDeck(sources: { id: string; name: string; href: string }[] = []) {
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string };
    const data =
      body.action === "resume"
        ? { resumed: true, attemptId: "attempt-1", payload: { type: "cards", cards: CARDS } }
        : body.action === "complete"
          ? { score: 1, total: 1, retried: 0 }
          : {};
    return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  const view = render(
    <ExamNodeSession
      prepId="prep-1"
      nodeId="node-1"
      kind="flashcards"
      prepTitle="Pediatri"
      topicLabel="Büyüme"
      resumeEnabled
      sources={sources}
    />,
  );
  return { ...view, fetchMock };
}

const flip = () => fireEvent.click(screen.getByRole("button", { name: /Kartı çevir, cevabı göster/ }));

describe("exam-prep flashcards — reveal before self-assessment", () => {
  it("does not offer Evet/Hayır before the card has been flipped", async () => {
    renderResumedDeck();
    await screen.findByText("Hedef boy nasıl hesaplanır?");
    expect(screen.queryByRole("button", { name: "Evet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hayır" })).toBeNull();
    expect(screen.getByText(/Önce kendin hatırlamaya çalış/)).toBeTruthy();
  });

  it("shows the answer and the self-assessment after flipping", async () => {
    renderResumedDeck();
    await screen.findByText("Hedef boy nasıl hesaplanır?");
    fireEvent.click(screen.getByRole("button", { name: /Kartı çevir, cevabı göster/ }));
    expect(screen.getByText(/13 cm düzeltilir/)).toBeTruthy();
    expect(screen.getByText("Cevap")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Evet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hayır" })).toBeTruthy();
  });

  it("keeps the self-assessment available if the student flips back to the question side", async () => {
    renderResumedDeck();
    await screen.findByText("Hedef boy nasıl hesaplanır?");
    fireEvent.click(screen.getByRole("button", { name: /Kartı çevir, cevabı göster/ }));
    fireEvent.click(screen.getByRole("button", { name: /Kartı soru yüzüne çevir/ }));
    expect(screen.getByText("Hedef boy nasıl hesaplanır?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Evet" })).toBeTruthy();
  });

  it("moves to the next card with the question side and self-assessment hidden again", async () => {
    renderResumedDeck();
    await screen.findByText("Hedef boy nasıl hesaplanır?");
    fireEvent.click(screen.getByRole("button", { name: /Kartı çevir, cevabı göster/ }));
    fireEvent.click(screen.getByRole("button", { name: "Evet" }));
    expect(await screen.findByText("3. persentil kaç SD'ye denk gelir?")).toBeTruthy();
    expect(screen.getByText("2 / 2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Evet" })).toBeNull();
  });
});

/*
  Astra (1 Ekim 2026): destenin sonunda "Hayır" denen kartlar için tekrar
  turu; sonuç "Bildiğin kartlar"; kart ekranında "N kaynak".
*/
describe("exam-prep flashcards — Astra gibi tekrar turu ve kaynak", () => {
  it("bilinmeyen kartı sonda bir kez daha sorar; kayıtta ilk tur cevabı kalır", async () => {
    const { fetchMock } = renderResumedDeck();
    await screen.findByText("Hedef boy nasıl hesaplanır?");
    flip();
    fireEvent.click(screen.getByRole("button", { name: "Hayır" }));
    await screen.findByText("3. persentil kaç SD'ye denk gelir?");
    flip();
    fireEvent.click(screen.getByRole("button", { name: "Evet" }));

    expect(await screen.findByText("Bilmediğin kartlara bir kez daha bakalım")).toBeTruthy();
    expect(screen.getByText(/Tekrarlanacak kartlar/).textContent).toContain("1");
    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));

    expect(await screen.findByText("Hedef boy nasıl hesaplanır?")).toBeTruthy();
    expect(screen.getByText("Tekrar · 1 / 1")).toBeTruthy();
    // Boşluk tuşu kartı çevirir.
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText(/13 cm düzeltilir/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Evet" }));

    expect(await screen.findByText("Bildiğin kartlar")).toBeTruthy();
    expect(screen.getByLabelText("2 karttan 2 biliniyor")).toBeTruthy();
    expect(screen.getByText(/1 kart ilk turda bilinmedi/)).toBeTruthy();
    const complete = fetchMock.mock.calls
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")))
      .find((body) => body.action === "complete");
    expect(complete.answers["0"]).toBe(false);
    expect(complete.answers["1"]).toBe(true);
    expect(screen.getByRole("link", { name: /Arkadaşına meydan oku/ }).getAttribute("href")).toBe(
      "/deneme-sinavlari/prep-1/duello",
    );
  });

  it("Atla tekrar turunu geçer, bilinmeyen kart sayılmaz", async () => {
    renderResumedDeck();
    await screen.findByText("Hedef boy nasıl hesaplanır?");
    flip();
    fireEvent.click(screen.getByRole("button", { name: "Hayır" }));
    await screen.findByText("3. persentil kaç SD'ye denk gelir?");
    flip();
    fireEvent.click(screen.getByRole("button", { name: "Evet" }));
    fireEvent.click(await screen.findByRole("button", { name: "Atla" }));
    expect(await screen.findByLabelText("2 karttan 1 biliniyor")).toBeTruthy();
  });

  it("hepsi bilinince teklif çıkmaz", async () => {
    renderResumedDeck();
    await screen.findByText("Hedef boy nasıl hesaplanır?");
    flip();
    fireEvent.click(screen.getByRole("button", { name: "Evet" }));
    await screen.findByText("3. persentil kaç SD'ye denk gelir?");
    flip();
    fireEvent.click(screen.getByRole("button", { name: "Evet" }));
    expect(await screen.findByLabelText("2 karttan 2 biliniyor")).toBeTruthy();
    expect(screen.queryByText("Bilmediğin kartlara bir kez daha bakalım")).toBeNull();
  });

  it("N kaynak düğmesi materyalleri yeni sekmede açılacak bağlantıyla listeler", async () => {
    renderResumedDeck([{ id: "doc-1", name: "pediatri.pdf", href: "/dokumanlar/doc-1" }]);
    await screen.findByText("Hedef boy nasıl hesaplanır?");
    fireEvent.click(screen.getByRole("button", { name: "1 kaynak" }));
    expect(screen.getByRole("dialog", { name: "Kaynaklar" })).toBeTruthy();
    expect(screen.getByText("pediatri.pdf")).toBeTruthy();
    const open = screen.getByRole("link", { name: "Aç" });
    expect(open.getAttribute("href")).toBe("/dokumanlar/doc-1");
    expect(open.getAttribute("target")).toBe("_blank");
  });
});
