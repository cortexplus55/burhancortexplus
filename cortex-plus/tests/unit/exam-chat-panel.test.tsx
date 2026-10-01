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
    expect(screen.getByRole("heading", { name: "Ne öğrenmek istersin?" })).toBeTruthy();
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

  it("renders an outside badge and follow-up chips instead of a raw heading", () => {
    renderExam([
      {
        role: "assistant",
        content:
          "Bu, belgede yok.\n\nMateryal dışı: Kısa not.\n\n[[chip:Benzer bir soru ver|Benzer bir soru ver]]\n[[kaynak:Notlar.pdf|4|sayfa|/dokumanlar/abc]]",
      },
    ]);
    expect(screen.getByText("Materyal dışı")).toBeTruthy();
    expect(screen.queryByText(/####/)).toBeNull();
    expect(screen.getByRole("link", { name: /Notlar\.pdf/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Benzer bir soru ver" }));
    expect(screen.getAllByText("Benzer bir soru ver").length).toBeGreaterThan(0);
  });

  it("renders a syllabus quote card and a real numbered list", () => {
    renderExam([
      {
        role: "assistant",
        content: [
          "Bu konu sınav kapsamı dışındadır.",
          "[[alinti:Katlı oranlar kanunu sınav kapsamı dışındadır.|ders-konulari.docx]]",
          "Kısa özet cümlesi burada durur.",
          "Belirlenmesi için:1. Mol sayısını hesaplayın.2. Katsayıya bölün.3. Küçük oranı seçin.",
          "[[chip:Yine de detaylı anlat|Katlı oranlar konusunu yine de ayrıntılı anlat.]]",
          "[[chip:Sınav konusuna dön (Stokiyometri)|Stokiyometri konusuna dönelim.]]",
        ].join("\n\n"),
      },
    ]);
    const quote = document.querySelector(".cp-tutor-quote");
    expect(quote?.textContent).toMatch(/Katlı oranlar kanunu sınav kapsamı dışındadır/);
    expect(quote?.textContent).toMatch(/ders-konulari\.docx/);
    expect(screen.queryByText(/^>/)).toBeNull();
    expect(document.querySelectorAll(".cp-tutor-quote")).toHaveLength(1);
    expect(document.querySelector("ol")).toBeTruthy();
    expect(document.querySelectorAll("ol li")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Yine de detaylı anlat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sınav konusuna dön (Stokiyometri)" })).toBeTruthy();
  });
});

/*
  Astra'nın yazı kutusu (1 Ekim 2026): ayar düğmesi bugünkü ruh halini
  sorar, periyodik tablo sohbetten çıkmadan açılır; balonda ders etiketi yok.
*/
describe("sohbet: ruh hali, periyodik tablo, ders etiketi", () => {
  it("ayar düğmesi ruh hali menüsü açar; seçilen ruh hali isteğe gider ve güne bağlı saklanır", async () => {
    window.localStorage.clear();
    const bodies: { mood?: string; message?: string }[] = [];
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/ai/chat")) {
        bodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(new ReadableStream({ start: (c) => { c.enqueue(new TextEncoder().encode("Tamam")); c.close(); } }), {
          status: 200,
          headers: { "X-Conversation-Id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "X-Message-Id": "m-2" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;
    try {
      renderExam();
      fireEvent.click(screen.getByRole("button", { name: "Ayarlar" }));
      const menu = screen.getByRole("menu", { name: "Bugünkü ruh hali" });
      expect(menu.textContent).toContain("Nötr");
      expect(screen.getByRole("menuitemradio", { name: /Nötr/ }).getAttribute("aria-checked")).toBe("true");
      expect(screen.getByRole("menuitem", { name: "Tüm ayarlar" })).toBeTruthy();
      fireEvent.click(screen.getByRole("menuitemradio", { name: /Stresli/ }));
      expect(screen.queryByRole("menu", { name: "Bugünkü ruh hali" })).toBeNull();
      expect(JSON.parse(window.localStorage.getItem("cortex-chat-mood") ?? "{}").mood).toBe("stressed");

      fireEvent.change(screen.getByPlaceholderText("Sor, konuş veya dosya gönder"), {
        target: { value: "Entalpi nedir?" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]?.mood).toBe("stressed");
    } finally {
      global.fetch = originalFetch;
      window.localStorage.clear();
    }
  });

  it("nötrken ruh hali gönderilmez", async () => {
    window.localStorage.clear();
    const bodies: { mood?: string }[] = [];
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/ai/chat")) bodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({}), { status: 500 });
    }) as typeof fetch;
    try {
      renderExam();
      fireEvent.change(screen.getByPlaceholderText("Sor, konuş veya dosya gönder"), {
        target: { value: "Entalpi nedir?" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).not.toHaveProperty("mood");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("periyodik tablo sohbetin üstünde açılır, Araçlar'a geri bağlantısı yok", () => {
    renderExam();
    fireEvent.click(screen.getByRole("button", { name: "Periyodik tablo" }));
    const dialog = screen.getByRole("dialog", { name: "Periyodik tablo" });
    expect(dialog.textContent).toContain("118 element");
    expect(screen.queryByRole("link", { name: /Araçlar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(screen.queryByRole("dialog", { name: "Periyodik tablo" })).toBeNull();
  });

  it("öğrenci balonunda [Matematik] etiketi görünmez", () => {
    renderExam([
      { role: "user", content: "[Matematik] Pisagor teoremi nedir?" },
      { role: "assistant", content: "Dik üçgende..." },
    ]);
    expect(screen.getByText("Pisagor teoremi nedir?")).toBeTruthy();
    expect(document.body.textContent).not.toContain("[Matematik]");
  });
});
