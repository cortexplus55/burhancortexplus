// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatPanel } from "@/components/chat/chat-panel";

vi.mock("next/navigation", () => ({
  usePathname: () => "/deneme-sinavlari/prep/sohbet",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

Element.prototype.scrollIntoView = vi.fn();
window.matchMedia = vi.fn().mockReturnValue({ matches: false });

afterEach(cleanup);

function renderExam(messages?: { role: "user" | "assistant"; content: string }[]) {
  return render(
    <ChatPanel
      variant="parity"
      composerMode="parity"
      examChrome
      hasDocuments
      showSubjectPicker={false}
      greetingLine="Selam! Termodinamik için 7 gün kaldı. Neye çalışmak istersin?"
      placeholder="Sor, konuş veya dosya gönder"
      starterPrompts={[
        { label: "Anlamadığım bir şeyi açıkla", prompt: "Anlamadığım bir şeyi açıkla" },
        { label: "Zayıf noktalarımı bul", prompt: "Zayıf noktalarımı bul" },
      ]}
      initialMessages={messages}
    />,
  );
}

describe("exam chat chrome", () => {
  it("shows a greeting and right-side chips without a title or start button", () => {
    renderExam();
    expect(
      screen.getByText("Selam! Termodinamik için 7 gün kaldı. Neye çalışmak istersin?"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anlamadığım bir şeyi açıkla" })).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button", { name: /Başla/ })).toBeNull();
    expect(screen.getByPlaceholderText("Sor, konuş veya dosya gönder")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gönder" })).toBeNull();
    expect(screen.getByRole("button", { name: "Daha fazla" })).toBeTruthy();
  });

  it("shows a blue send control once text is typed", () => {
    renderExam();
    fireEvent.change(screen.getByPlaceholderText("Sor, konuş veya dosya gönder"), {
      target: { value: "Entalpi nedir?" },
    });
    expect(screen.getByRole("button", { name: "Gönder" })).toBeTruthy();
  });

  it("opens the six quick commands and shows Konuş after a reply", () => {
    renderExam([
      { role: "user", content: "Entalpi nedir?" },
      { role: "assistant", content: "Entalpi toplam enerjidir." },
    ]);
    expect(screen.getByText("Entalpi nedir?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Konuş" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Daha fazla" }));
    expect(screen.getByRole("button", { name: "Bana özel ders ver" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Konuyu ne kadar iyi anladığımı test et" }),
    ).toBeTruthy();
  });
});
