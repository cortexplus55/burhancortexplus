// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPanel } from "@/components/chat/chat-panel";

vi.mock("next/navigation", () => ({
  usePathname: () => "/deneme-sinavlari/prep/sohbet",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

Element.prototype.scrollIntoView = vi.fn();
window.matchMedia = vi.fn().mockReturnValue({ matches: false });

afterEach(cleanup);

function renderExam(
  messages?: { role: "user" | "assistant"; content: string }[],
  conversationId?: string,
) {
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
      initialConversationId={conversationId}
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

  it("switches the visible thread when the conversation id changes", async () => {
    const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const chatCalls: { conversationId?: string; message?: string }[] = [];
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/ai/chat")) {
        chatCalls.push(JSON.parse(String(init?.body ?? "{}")));
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("Yeni cevap"));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            "X-Conversation-Id": second,
            "X-Message-Id": "m-1",
            "X-Credits-Used": "1",
            "X-Model": "test",
          },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    try {
      const { rerender } = renderExam(
        [
          { role: "user", content: "Eski konu sorusu" },
          { role: "assistant", content: "Eski yanıt" },
        ],
        first,
      );
      expect(screen.getByText("Eski konu sorusu")).toBeTruthy();
      fireEvent.change(screen.getByPlaceholderText("Sor, konuş veya dosya gönder"), {
        target: { value: "Bu taslak eski sohbette kalmalı" },
      });

      rerender(
        <ChatPanel
          variant="parity"
          composerMode="parity"
          examChrome
          hasDocuments
          showSubjectPicker={false}
          greetingLine="Selam! Termodinamik için 7 gün kaldı. Neye çalışmak istersin?"
          placeholder="Sor, konuş veya dosya gönder"
          initialConversationId={second}
          initialMessages={[
            { role: "user", content: "Yeni konu sorusu" },
            { role: "assistant", content: "Yeni yanıt" },
          ]}
        />,
      );

      expect(screen.getByText("Yeni konu sorusu")).toBeTruthy();
      expect(screen.queryByText("Eski konu sorusu")).toBeNull();
      expect(screen.queryByText("Bu taslak eski sohbette kalmalı")).toBeNull();

      fireEvent.change(screen.getByPlaceholderText("Sor, konuş veya dosya gönder"), {
        target: { value: "Devam sorusu" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Gönder" }));

      await waitFor(() => expect(chatCalls).toHaveLength(1));
      expect(chatCalls[0]?.conversationId).toBe(second);
      expect(chatCalls[0]?.message).toBe("Devam sorusu");
    } finally {
      global.fetch = originalFetch;
    }
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
