// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { autoGrowHeight, AUTO_GROW_FALLBACK_MAX_PX, useAutoGrow } from "@/lib/ui/use-auto-grow";
import { createSendLock } from "@/lib/ui/send-lock";

vi.mock("next/navigation", () => ({
  usePathname: () => "/deneme-sinavlari/prep/sohbet",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

Element.prototype.scrollIntoView = vi.fn();
window.matchMedia = vi.fn().mockReturnValue({ matches: false });

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* Faz 3 (20 Kasım 2026): /ogretmen yazma alanı Safari/Firefox'ta da büyür; çift Enter / çift tık ikinci istek göndermez. */

describe("otomatik büyüme yedeği", () => {
  it("içerik kadar büyür, CSS'teki üst sınırı geçmez; sınırda kendi içinde kayar", () => {
    expect(autoGrowHeight(60, 128)).toEqual({ height: 60, overflow: "hidden" });
    expect(autoGrowHeight(300, 128)).toEqual({ height: 128, overflow: "auto" });
    // max-height okunamazsa (none → NaN) 8rem.
    expect(autoGrowHeight(300, Number.NaN)).toEqual({ height: AUTO_GROW_FALLBACK_MAX_PX, overflow: "auto" });
  });

  function Probe() {
    const ref = useRef<HTMLTextAreaElement>(null);
    const [value, setValue] = useState("");
    useAutoGrow(ref, value);
    return <textarea ref={ref} aria-label="alan" style={{ maxHeight: "128px" }} value={value} onChange={(e) => setValue(e.target.value)} />;
  }

  it("field-sizing bilmeyen tarayıcıda yüksekliği scrollHeight'tan yazar", () => {
    let scroll = 52;
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(() => scroll);
    render(<Probe />);
    const area = screen.getByRole("textbox", { name: "alan" }) as HTMLTextAreaElement;
    expect(area.style.height).toBe("52px");
    scroll = 96;
    fireEvent.change(area, { target: { value: "bir\niki\nüç" } });
    expect(area.style.height).toBe("96px");
    scroll = 400;
    fireEvent.change(area, { target: { value: "çok uzun" } });
    expect(area.style.height).toBe("128px");
    expect(area.style.overflowY).toBe("auto");
  });

  it("field-sizing bilen tarayıcıda dokunmaz (büyümeyi CSS yapar)", () => {
    const original = (globalThis as { CSS?: unknown }).CSS;
    (globalThis as { CSS?: unknown }).CSS = { supports: () => true };
    try {
      vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockReturnValue(90);
      render(<Probe />);
      expect((screen.getByRole("textbox", { name: "alan" }) as HTMLTextAreaElement).style.height).toBe("");
    } finally {
      (globalThis as { CSS?: unknown }).CSS = original;
    }
  });

  it("sohbet yazma alanı kancayı kullanır", () => {
    expect(read("src/components/chat/chat-panel.tsx")).toContain("useAutoGrow(composerRef, input);");
  });
});

describe("çift gönderim kilidi", () => {
  it("kilit tek sahip alır, bırakınca yeniden alınır", () => {
    const lock = createSendLock();
    expect(lock.tryAcquire()).toBe(true);
    expect(lock.tryAcquire()).toBe(false);
    expect(lock.held).toBe(true);
    lock.release();
    expect(lock.tryAcquire()).toBe(true);
  });

  function renderChat() {
    return render(
      <ChatPanel
        variant="parity"
        composerMode="parity"
        examChrome
        hasDocuments
        showSubjectPicker={false}
        greetingLine="Selam!"
        placeholder="Sor, konuş veya dosya gönder"
        starterPrompts={[{ label: "Zayıf noktalarımı bul", prompt: "Zayıf noktalarımı bul" }]}
      />,
    );
  }

  /** Cevap hiç gelmeyen istek: ilki sürerken ikincinin gidip gitmediği sayılır. */
  function pendingChatFetch() {
    const chatCalls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/ai/chat")) {
        chatCalls.push(JSON.parse(String(init?.body ?? "{}")).message);
        return new Promise<Response>(() => {});
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    return chatCalls;
  }

  it("aynı çizimde art arda iki Enter tek istek gönderir", async () => {
    const chatCalls = pendingChatFetch();
    renderChat();
    const box = screen.getByPlaceholderText("Sor, konuş veya dosya gönder");
    fireEvent.change(box, { target: { value: "Entalpi nedir?" } });
    // İki tuş aynı act içinde: arada durum (loading, input) güncellenmez; eski kod ikinci isteği de gönderiyordu.
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(chatCalls).toEqual(["Entalpi nedir?"]);
  });

  it("öneri çipine çift tık tek istek gönderir", async () => {
    const chatCalls = pendingChatFetch();
    renderChat();
    const chip = screen.getByRole("button", { name: "Zayıf noktalarımı bul" });
    await act(async () => {
      fireEvent.click(chip);
      fireEvent.click(chip);
    });
    expect(chatCalls).toEqual(["Zayıf noktalarımı bul"]);
  });

  it("istek bitince (hata da olsa) kilit açılır, sonraki mesaj gider", async () => {
    const chatCalls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/ai/chat")) {
        chatCalls.push(JSON.parse(String(init?.body ?? "{}")).message);
        throw new TypeError("ağ yok");
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    renderChat();
    const box = screen.getByPlaceholderText("Sor, konuş veya dosya gönder");
    fireEvent.change(box, { target: { value: "İlk soru" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    fireEvent.change(box, { target: { value: "İkinci soru" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(chatCalls).toEqual(["İlk soru", "İkinci soru"]);
  });

  it("kilit gönderimin başında alınır, finally'de bırakılır", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toMatch(/if \(!text\.trim\(\) \|\| \(loading && !allowWhileLoading\)\) return;\n\s*\/\/[^\n]*\n\s*if \(!sendLock\.tryAcquire\(\)\) return;/);
    expect(panel).toMatch(/setLoading\(false\);\n\s*sendLock\.release\(\);/);
    expect(panel).toMatch(/if \(!composerLock\.tryAcquire\(\)\) return;\n\s*try \{\n\s*await sendComposerNow\(\);\n\s*\} finally \{\n\s*composerLock\.release\(\);/);
  });
});
