// @vitest-environment jsdom
/**
 * Öğretmen v3 ekranı (teacher.v2 ana sohbeti, 21 Kasım 2026, ürün sahibi: "kalabalık, teknik damgalarla boğulmuş;
 * karşımda canlı bir öğretmen var hissini öldürüyor"). Sohbet açıkken tek ince şerit, çerçevesiz tuval ve tek yuvarlak
 * kapsül. Bayrak kapalıyken bugünkü ekran birebir. Model, kredi ve canlı API yok: istekler sahte. Örnekler farklı
 * derslerden (biyoloji, fizik, kimya, tarih).
 */
import type { ComponentProps } from "react";
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel, chatGateProps } from "@/components/chat/chat-panel";
import { TutorHistoryPanel } from "@/components/parity/tutor-history-panel";
import { HomeSelectionContext, type HomeSelection } from "@/components/parity/home-selection";
import type { CockpitPrep } from "@/lib/learning/home-cockpit-model";
import { MORE_COMMANDS } from "@/lib/teacher/more-commands";
import { GENERAL_NOTE_TEXT, V3_DOC_MARK, V3_GENERAL_MARK, cleanV3Reply, hidePartialMarkers, v3PlainText, v3Segments } from "@/lib/teacher/v3-reply";
import { REVEAL_FINISH_MS, REVEAL_MAX_LAG_MS, revealStep, wordEnd } from "@/lib/teacher/smooth-reveal";
import { THINKING_PHASES, THINKING_SECOND_AT_MS, thinkingPhase, thoughtLabel } from "@/lib/teacher/thinking-phase";
import { RESUME_HAP, WELCOME_HAPS, parseResume, welcomeLines } from "@/lib/teacher/welcome";
import { RECAP_MAX_ITEMS, lessonRecapItems } from "@/lib/teacher/lesson-recap";
import { AUTO_SPEAK_KEY } from "@/lib/teacher/auto-speak";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/ogretmen",
  useRouter: () => ({ replace, push, refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }));

Element.prototype.scrollIntoView = vi.fn();
Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const CONV = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const mid = (n: number) => `0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c${String(n).padStart(2, "0")}`;

type Handler = (init?: RequestInit) => Response | Promise<Response>;
type Call = { url: string; init?: RequestInit; body: Record<string, unknown> | null };

function mockFetch(handlers: Record<string, Handler> = {}) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let body: Record<string, unknown> | null = null;
    try {
      body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    calls.push({ url, init, body });
    for (const [key, handler] of Object.entries(handlers)) if (url.includes(key)) return handler(init);
    if (url.includes("/api/profile/me") || url.includes("/api/teacher/start-cards")) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
  return calls;
}

const chatReply = (text: string, messageId = mid(9)) =>
  new Response(text, { status: 200, headers: { "X-Message-Id": messageId, "X-Conversation-Id": CONV } });

/** Sunucunun bugünkü damgalarıyla bir yanıt (kaynak başlığı, atıf, kaynak işareti, Kaynaklar bloğu, genel bilgi, takip). */
const STAMPED = [
  "#### Belgeden",
  "",
  "Fotosentezde ışık enerjisi **klorofil** tarafından soğurulur ve ==kimyasal enerjiye dönüştürülür== [1].",
  "",
  "#### Genel bilgiden — kaynak gösterilmez",
  "",
  "Bitkiler bu enerjiyi glikoz üretmek için kullanır.",
  "",
  "[[kaynak:Biyoloji notu|3|sayfa|/dokumanlar/x?sayfa=3]]",
  "[[chip:Benzer bir soru ver|Buna benzer bir soru ver.]]",
  "",
  "Kaynaklar:",
  "- [1] [Biyoloji notu · s.3](/dokumanlar/x)",
  "[[sorular:Işığa bağlı evrede hangi ürünler oluşur?|Klorofil neden yeşil görünür?|Stroma ile tilakoit arasındaki fark nedir?]]",
].join("\n");

const THREAD = [
  { role: "user" as const, content: "Fotosentezde ışığın görevi nedir?", id: mid(1) },
  { role: "assistant" as const, content: STAMPED, id: mid(2) },
];

function renderPanel(props: Partial<ComponentProps<typeof ChatPanel>> = {}) {
  return render(
    <ChatPanel
      variant="parity"
      composerMode="parity"
      hasDocuments={false}
      showSubjectPicker={false}
      placeholder="Sor, konuş veya dosya gönder"
      initialTutorStyle="step_by_step"
      startGreeting="Merhaba! Bugün ne çalışalım?"
      {...props}
    />,
  );
}

function selection(title = "Hücre Bölünmeleri ve Kalıtım"): HomeSelection {
  const prep = { id: "p-hucre", title, topics: [{ id: "t", label: "Mitoz", done: false, next: null }], currentTopic: 0 } as unknown as CockpitPrep;
  return { preps: [prep], prepIndex: 0, topicIndex: 0, selectPrep: vi.fn(), selectTopic: vi.fn() };
}

beforeEach(() => {
  window.localStorage.clear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  replace.mockClear();
  push.mockClear();
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("bayrak kapalıyken bugünkü ekran", () => {
  it("imza, kaynak çipleri ve devam önerileri bugünkü gibi; v3 parçalarının hiçbiri yok", () => {
    mockFetch();
    const { container } = renderPanel({ initialConversationId: CONV, initialMessages: THREAD });
    expect(container.querySelector(".cp-sor-messages")).toBeTruthy();
    expect(screen.getByText("Cortex öğretmen")).toBeTruthy();
    expect(container.querySelector(".cx-v3, .cx-v3-thread, .cx-v3-capsule")).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Anlatım modu" })).toBeTruthy();
  });

  it("hazırlık sohbetinde (prepId) bayrak açık olsa da bugünkü ekran", () => {
    mockFetch();
    const { container } = renderPanel({ teacherV2: true, prepId: "11111111-1111-4111-8111-111111111111", initialMessages: THREAD });
    expect(container.querySelector(".cx-v3")).toBeNull();
    expect(container.querySelector(".cp-sor-messages")).toBeTruthy();
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("aktif sohbet: çerçevesiz tuval", () => {
  it("üstte yalnız geri, geçmiş ve Yeni sohbet; damgalar, seçiciler ve çipler yok", async () => {
    mockFetch();
    const { container } = renderPanel({ teacherV2: true, showSubjectPicker: true, hasDocuments: true, initialConversationId: CONV, initialMessages: THREAD, feedbackEnabled: true });
    const bar = container.querySelector(".cx-v3-bar")!;
    expect(within(bar as HTMLElement).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual([
      "Geri",
      "Sohbet geçmişi",
      "Yeni sohbet",
    ]);
    const text = container.textContent ?? "";
    for (const stamp of ["Cortex öğretmen", "Belgeden", "Kaynaklar:", "[1]", "Genel bilgiden", "kaynak gösterilmez", "Biyoloji notu", "Benzer bir soru ver", "Sıra sende"]) {
      expect(text, stamp).not.toContain(stamp);
    }
    expect(container.querySelector(".cp-tutor-cites, .cp-followups, .cx-v2-chips, .cp-sor-controls, .cp-thread-bar")).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Anlatım modu" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ders seç/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "Kaynak modu" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Küçük bir ipucu|Yanlışlar Defterime|mini test/ })).toBeNull();
    // Genel bilgi bölümü başlık değil, tek soluk satırla işaretli kalır (güven kuralı).
    expect(screen.getByText(GENERAL_NOTE_TEXT)).toBeTruthy();
    expect(screen.getByText(/glikoz üretmek/)).toBeTruthy();
    expect(container.querySelector("mark.cp-key")?.textContent).toBe("kimyasal enerjiye dönüştürülür");
  });

  it("yanıtın altında yalnız dört simge: beğen, beğenme, sesli dinle, kopyala (yeniden üret yok)", () => {
    mockFetch();
    const { container } = renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD, feedbackEnabled: true });
    const acts = container.querySelector(".cx-v3-acts")!;
    expect(within(acts as HTMLElement).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Faydalı",
      "Faydalı değil",
      "Sesli dinle",
      "Kopyala",
    ]);
    expect(screen.queryByRole("button", { name: "Yeniden üret" })).toBeNull();
  });

  it("takip soruları son yanıtın altında sağa yaslı haplar; dokunulan soru öğrencinin mesajı olur", async () => {
    const calls = mockFetch({ "/api/ai/chat": () => chatReply("Glikoz ve oksijen.") });
    renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD });
    const group = screen.getByRole("group", { name: "Takip soruları" });
    const haps = within(group).getAllByRole("button");
    expect(haps.map((hap) => hap.textContent)).toEqual([
      "↳Işığa bağlı evrede hangi ürünler oluşur?",
      "↳Klorofil neden yeşil görünür?",
      "↳Stroma ile tilakoit arasındaki fark nedir?",
    ]);
    await act(async () => {
      fireEvent.click(haps[1]!);
    });
    const chat = calls.find((call) => call.url.includes("/api/ai/chat"));
    expect(chat?.body?.message).toBe("Klorofil neden yeşil görünür?");
    expect(chat?.body?.tutorStyle).toBe("tutor_steps");
    expect(chat?.body).not.toHaveProperty("welcomeAnswer");
  });

  it("soru yoksa takip hapı çizilmez (uydurma yok); yalnız son yanıtta", () => {
    mockFetch();
    renderPanel({
      teacherV2: true,
      initialConversationId: CONV,
      initialMessages: [
        ...THREAD,
        { role: "user", content: "Peki ya karbondioksit?", id: mid(3) },
        { role: "assistant", content: "Karbondioksit stromada kullanılır.", id: mid(4) },
      ],
    });
    expect(screen.queryByRole("group", { name: "Takip soruları" })).toBeNull();
  });

  it("geri ana ekrana döner; eski ana ekran bugünkü gibi", async () => {
    mockFetch();
    const { container } = renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: [{ role: "user", content: "Selam", id: mid(1) }, { role: "assistant", content: "Merhaba!", id: mid(2) }] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Geri" }));
    });
    expect(container.querySelector(".cx-v3")).toBeNull();
    expect(screen.getByRole("button", { name: "Başla" })).toBeTruthy();
  });

  it("CSS: sohbet açıkken uygulamanın üst menüsü, alt sekme çubuğu ve şeritleri gizli", () => {
    const css = read("src/styles/teacher-v3.css");
    for (const selector of [".cx-home-top", ".cp-sor-bottomnav", ".cx-shell-countdown", ".cp-verify-bar", ".cx-thist-toggle"]) {
      expect(css).toContain(`.cp-sor-root:has(.cx-v3-thread)`);
      expect(css).toContain(selector);
    }
    expect(css).toMatch(/\.cp-sor-root:has\(\.cx-v3-thread\) > \.cx-home-top,\n\.cp-sor-root:has\(\.cx-v3-thread\) > \.cp-sor-bottomnav,/);
    // Yanıt 16 px, satır aralığı 1.68; telefonda dokunma alanı 44 px.
    expect(css).toContain("line-height: 1.68;");
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*width: var\(--cx-tap-min\);/);
    // Hareket azaltmada animasyon yok.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.cx-v3-shimmer[\s\S]*animation: none;/);
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("karşılama", () => {
  it("Başla: işaret, seçili hazırlıkla selam ve sağa yaslı üç hap; hap welcomeAnswer ve contextPrepId ile gider", async () => {
    const calls = mockFetch({ "/api/ai/chat": () => chatReply("Harika, o zaman alıştırmayla başlayalım.") });
    render(
      <HomeSelectionContext.Provider value={selection()}>
        <ChatPanel variant="parity" composerMode="parity" hasDocuments={false} teacherV2 studentFirstName="Elif" startGreeting="Merhaba!" placeholder="Sor, konuş veya dosya gönder" />
      </HomeSelectionContext.Provider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Başla" }));
    });
    const welcome = screen.getByRole("region", { name: "Karşılama" });
    const lines = welcomeLines({ firstName: "Elif", prepTitle: "Hücre Bölünmeleri ve Kalıtım" });
    expect(within(welcome).getByText(`${lines.hello} ${lines.body}`)).toBeTruthy();
    expect(lines.body.startsWith("Hücre Bölünmeleri ve Kalıtım için nasıl hazırlanmak istediğini anlat")).toBe(true);
    const group = within(welcome).getByRole("group", { name: "Başlangıç önerileri" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(WELCOME_HAPS.map((text) => `↳${text}`));
    // Karşılama açıkken eski selam balonu ve karşılama kartları yok.
    expect(screen.queryByText("Merhaba!")).toBeNull();
    await act(async () => {
      fireEvent.click(within(group).getByRole("button", { name: /Bazı konularda zorlanıyorum/ }));
    });
    const chat = calls.find((call) => call.url.includes("/api/ai/chat"))!;
    expect(chat.body).toMatchObject({ message: "Bazı konularda zorlanıyorum", welcomeAnswer: true, contextPrepId: "p-hucre", tutorStyle: "tutor_steps" });
  });

  it("karşılamada yazılan ilk mesaj da welcomeAnswer taşır; sonraki mesaj taşımaz", async () => {
    const calls = mockFetch({ "/api/ai/chat": () => chatReply("Anladım.") });
    renderPanel({ teacherV2: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Başla" }));
    });
    const box = screen.getByPlaceholderText("Sor, konuş veya dosya gönder");
    fireEvent.change(box, { target: { value: "Görsel örneklerle daha iyi anlıyorum" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await waitFor(() => expect(screen.getByText("Anladım.")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("Sor, konuş veya dosya gönder"), { target: { value: "Tamam, başlayalım" } });
    await act(async () => {
      fireEvent.keyDown(screen.getByPlaceholderText("Sor, konuş veya dosya gönder"), { key: "Enter" });
    });
    const chats = calls.filter((call) => call.url.includes("/api/ai/chat"));
    expect(chats[0]!.body?.welcomeAnswer).toBe(true);
    expect(chats[1]!.body).not.toHaveProperty("welcomeAnswer");
  });

  it("hazırlık ve ad yoksa sıcak genel karşılama; ad yoksa 'Selam!'", () => {
    expect(welcomeLines({}).hello).toBe("Selam!");
    expect(welcomeLines({ firstName: "Can" }).body).toBe(
      "Bugün neyi birlikte çalışalım? Nasıl öğrenmeyi sevdiğini ya da nerede zorlandığını anlatırsan hatırlarım.",
    );
  });

  it("kaldığın yerden: resume varsa satırı selamın altında, devam hapı en üstte; aynı konuşmada sürer, welcomeAnswer yok", async () => {
    const resume = { line: "Dün «Newton yasaları» konusunda kalmıştık, oradan devam edelim mi?", prompt: "Dün Newton yasalarında kaldığımız yerden devam edelim.", conversationId: "0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d" };
    const calls = mockFetch({
      "/api/teacher/start-cards": () => new Response(JSON.stringify({ cards: [], resume }), { status: 200 }),
      "/api/ai/chat": () => chatReply("Tamam, ikinci yasadan sürdürelim."),
    });
    renderPanel({ teacherV2: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Başla" }));
    });
    await waitFor(() => expect(screen.getAllByText(resume.line).length).toBeGreaterThan(0));
    const group = screen.getByRole("group", { name: "Başlangıç önerileri" });
    const haps = within(group).getAllByRole("button");
    expect(haps[0]!.textContent).toBe(`↳${RESUME_HAP}`);
    expect(haps).toHaveLength(4);
    await act(async () => {
      fireEvent.click(haps[0]!);
    });
    const chat = calls.find((call) => call.url.includes("/api/ai/chat"))!;
    expect(chat.body).toMatchObject({ message: resume.prompt, conversationId: resume.conversationId });
    expect(chat.body).not.toHaveProperty("welcomeAnswer");
    expect(calls.filter((call) => call.url.includes("/api/teacher/start-cards"))).toHaveLength(1);
  });

  it("start-cards düşerse ya da resume null ise ekran değişmez", async () => {
    mockFetch({ "/api/teacher/start-cards": () => new Response(JSON.stringify({ cards: [], resume: null }), { status: 200 }) });
    renderPanel({ teacherV2: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Başla" }));
    });
    await act(async () => undefined);
    expect(screen.queryByRole("button", { name: new RegExp(RESUME_HAP) })).toBeNull();
    expect(within(screen.getByRole("group", { name: "Başlangıç önerileri" })).getAllByRole("button")).toHaveLength(3);
    expect(parseResume({ line: "x", prompt: "" })).toBeNull();
    expect(parseResume({ line: "Devam?", prompt: "Devam edelim.", conversationId: "kotu" })).toEqual({ line: "Devam?", prompt: "Devam edelim.", conversationId: null });
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("yazma kapsülü", () => {
  it("⋮ Daha fazla: altı komut ve ayrı sesli okuma anahtarı; komut doğrudan gider, Esc kapatır ve odak hapa döner", async () => {
    const calls = mockFetch({ "/api/ai/chat": () => chatReply("Peki, ilk soru geliyor.") });
    renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD, isPremium: true });
    const trigger = screen.getByRole("button", { name: "Daha fazla" });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Daha fazla" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(MORE_COMMANDS.map((command) => `${command.label}▸`));
    expect(within(menu).getByRole("menuitemcheckbox", { name: /Yanıtları sesli oku/ }).getAttribute("aria-checked")).toBe("false");
    expect(within(menu).getByRole("separator")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    fireEvent.click(trigger);
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /Konuyu ne kadar iyi anladığımı test et/ }));
    });
    const chat = calls.find((call) => call.url.includes("/api/ai/chat"))!;
    expect(chat.body?.message).toBe(MORE_COMMANDS[5]!.prompt);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Konuş ↔ Gönder: yazı boşken Konuş (sesli mod verildiyse), yazınca Gönder; Konuş sesli modu açar", () => {
    mockFetch();
    const onLiveTalk = vi.fn();
    renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD, onLiveTalk });
    const action = screen.getByRole("button", { name: "Konuş" });
    expect(action.getAttribute("data-mode")).toBe("talk");
    fireEvent.click(action);
    expect(onLiveTalk).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByPlaceholderText("Sor, konuş veya dosya gönder"), { target: { value: "Neden?" } });
    const send = screen.getByRole("button", { name: "Gönder" });
    // Aynı düğme biçim değiştirir (pürüzsüz geçiş için tek öğe).
    expect(send).toBe(action);
    expect(send.getAttribute("data-mode")).toBe("send");
    expect(screen.queryByRole("button", { name: "Konuş" })).toBeNull();
  });

  it("sesli mod verilmezse Konuş hiç çizilmez; yerinde Gönder (boşken kapalı)", () => {
    mockFetch();
    renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD });
    expect(screen.queryByRole("button", { name: "Konuş" })).toBeNull();
    expect((screen.getByRole("button", { name: "Gönder" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("liveTalkSlot verilince kapsülün yerine çizilir", () => {
    mockFetch();
    const { container } = renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD, liveTalkSlot: <div data-testid="sesli">Sesli ders</div> });
    expect(screen.getByTestId("sesli")).toBeTruthy();
    expect(container.querySelector(".cx-v3-capsule")).toBeNull();
  });

  it("+ dosya seçicisini, kamera arka kamerayı açar; mikrofon dikte düğmesi", () => {
    mockFetch();
    const { container } = renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD });
    const inputs = [...container.querySelectorAll<HTMLInputElement>('input[type="file"]')];
    const clicks = inputs.map((input) => vi.spyOn(input, "click").mockImplementation(() => undefined));
    fireEvent.click(screen.getByRole("button", { name: "Dosya ekle" }));
    fireEvent.click(screen.getByRole("button", { name: "Fotoğraf çek" }));
    expect(clicks[0]).toHaveBeenCalledTimes(1);
    expect(clicks[1]).toHaveBeenCalledTimes(1);
    expect(inputs[1]!.getAttribute("capture")).toBe("environment");
    expect(screen.getByRole("button", { name: "Mikrofon" })).toBeTruthy();
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("düşünme satırı ve N sn düşündü", () => {
  it("bekleme: önce 'Bilgileri birleştiriyor', süre geçince 'Verileri analiz ediyor', ilk parçada 'Yanıtı yazıyor'", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    let pushChunk!: (text: string) => void;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        pushChunk = (text) => controller.enqueue(new TextEncoder().encode(text));
      },
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockFetch({ "/api/ai/chat": async () => {
      await gate;
      return new Response(stream, { status: 200, headers: { "X-Message-Id": mid(9) } });
    } });
    renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD });
    const box = screen.getByPlaceholderText("Sor, konuş veya dosya gönder");
    fireEvent.change(box, { target: { value: "Peki ya karanlıkta?" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(screen.getByRole("status", { name: THINKING_PHASES[0] })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(THINKING_SECOND_AT_MS + 50);
    });
    expect(screen.getByRole("status", { name: THINKING_PHASES[1] })).toBeTruthy();
    // Kalan adımlar gerçek saatle (waitFor sahte saatte beklemez).
    vi.useRealTimers();
    await act(async () => {
      release();
      await Promise.resolve();
    });
    await act(async () => {
      pushChunk("Karanlıkta ışığa bağlı evre durur.");
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    });
    await waitFor(() => expect(screen.getByRole("status", { name: THINKING_PHASES[2] })).toBeTruthy());
  });

  it("yanıt bitince satır 'N sn düşündü' olur (N gerçek süre, en az 1); eski mesajda etiket yok", async () => {
    mockFetch({ "/api/ai/chat": () => chatReply("Kuvvet çarpı yoldur.") });
    const { container } = renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD });
    expect(container.querySelector(".cx-v3-thought")).toBeNull();
    const box = screen.getByPlaceholderText("Sor, konuş veya dosya gönder");
    fireEvent.change(box, { target: { value: "İş nedir?" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await waitFor(() => expect(container.querySelector(".cx-v3-thought")?.textContent).toBe("💡 1 sn düşündü"));
    expect(container.querySelectorAll(".cx-v3-thought")).toHaveLength(1);
  });

  it("saf: aşama ve etiket", () => {
    expect(thinkingPhase(0, false)).toBe("Bilgileri birleştiriyor");
    expect(thinkingPhase(THINKING_SECOND_AT_MS, false)).toBe("Verileri analiz ediyor");
    expect(thinkingPhase(200, true)).toBe("Yanıtı yazıyor");
    expect(thoughtLabel(0)).toBe("💡 1 sn düşündü");
    expect(thoughtLabel(4400)).toBe("💡 4 sn düşündü");
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("ders sonu özeti", () => {
  const LESSON = [
    { role: "user" as const, content: "Mitoz ile mayoz farkı?", id: mid(1) },
    {
      role: "assistant" as const,
      id: mid(2),
      content: "Mitozda kromozom sayısı ==korunur==. Mayozda ==yarıya iner==.\n\n> ✅ Akılda kalsın:\n> - Mayoz sonucunda ==dört haploit hücre== oluşur.",
    },
  ];

  it("öğretici yanıt varsa geri basınca pencere açılır; Tekrar desteme ekle desteye yollar, 'Eklendi' der ve çıkış sürer", async () => {
    const calls = mockFetch({ "/api/review/deck": () => new Response(JSON.stringify({ added: 3 }), { status: 200 }) });
    const { container } = renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: LESSON });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Geri" }));
    });
    const sheet = await screen.findByRole("dialog", { name: "Bugün öğrendiklerin" });
    expect(within(sheet).getAllByRole("listitem")).toHaveLength(3);
    // Çıkış pencere kapanana kadar bekler.
    expect(container.querySelector(".cx-v3")).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Tekrar desteme ekle" }));
    });
    const deck = calls.find((call) => call.url.includes("/api/review/deck"))!;
    expect(deck.init?.method).toBe("POST");
    expect(deck.body?.facts).toEqual(lessonRecapItems([LESSON[1]!.content]));
    await waitFor(() => expect(within(sheet).getByRole("button", { name: "Eklendi" })).toBeTruthy());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bugün öğrendiklerin" })).toBeNull(), { timeout: 3000 });
    expect(container.querySelector(".cx-v3")).toBeNull();
  });

  it("Kapat da çıkışı sürdürür; Yeni sohbet'te çıkış karşılamaya gider", async () => {
    mockFetch();
    const { container } = renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: LESSON });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yeni sohbet" }));
    });
    const sheet = await screen.findByRole("dialog", { name: "Bugün öğrendiklerin" });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Kapat" }));
    });
    await waitFor(() => expect(screen.getByRole("region", { name: "Karşılama" })).toBeTruthy());
    expect(container.querySelector(".cx-v3")).toBeTruthy();
  });

  it("madde yoksa pencere açılmaz, çıkış doğrudan olur", async () => {
    mockFetch();
    const { container } = renderPanel({
      teacherV2: true,
      initialConversationId: CONV,
      initialMessages: [{ role: "user", content: "Selam", id: mid(1) }, { role: "assistant", content: "Merhaba, ne çalışalım?", id: mid(2) }],
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Geri" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector(".cx-v3")).toBeNull();
  });

  it("saf: en yeni ve en farklı üç madde, kart kurulabilenler; yoklama ve aynı bilgi atlanır", () => {
    const older = "Işık evresi ==tilakoitte== gerçekleşir. Işık evresi ==tilakoitte== olur.";
    const newer = "> ✅ Akılda kalsın:\n> - Kalvin döngüsü ==stromada== gerçekleşir.\n\nKlorofil ==yeşil ışığı yansıtır==.\n\n> ❓ Yoklama: ==Hangisi== doğru?\n> A) x\n> B) y";
    const items = lessonRecapItems([older, newer]);
    expect(items).toEqual([
      "Kalvin döngüsü ==stromada== gerçekleşir.",
      "Klorofil ==yeşil ışığı yansıtır==.",
      "Işık evresi ==tilakoitte== gerçekleşir.",
    ]);
    expect(items.length).toBeLessThanOrEqual(RECAP_MAX_ITEMS);
    expect(lessonRecapItems(["Kilit bilgi olmayan düz anlatım."])).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("yanıtları sesli oku", () => {
  function mockSpeech() {
    const speak = vi.fn();
    const cancel = vi.fn();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel, getVoices: () => [{ lang: "tr-TR", name: "Türkçe", voiceURI: "tr" }] },
    });
    class Utterance {
      text: string;
      lang = "";
      voice: unknown = null;
      rate = 1;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    return { speak, cancel };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ücretsiz hesapta anahtar Plus rozetli; dokununca yükseltme penceresi açılır, tercih yazılmaz", async () => {
    mockFetch();
    renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD, isPremium: false });
    fireEvent.click(screen.getByRole("button", { name: "Daha fazla" }));
    const toggle = screen.getByRole("menuitemcheckbox", { name: /Yanıtları sesli oku/ });
    expect(within(toggle).getByText("Plus")).toBeTruthy();
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(await screen.findByText(/Yanıtları sesli okuma Plus'ta/)).toBeTruthy();
    expect(window.localStorage.getItem(AUTO_SPEAK_KEY)).toBeNull();
    expect(chatGateProps("premium_required", false, "Yanıtları sesli okuma").message.startsWith("Yanıtları sesli okuma Plus'ta.")).toBe(true);
    expect(chatGateProps("premium_required", false).message.startsWith("Bu iş Plus'ta.")).toBe(true);
  });

  it("Plus: açılınca kalıcı; yanıt bitince 🔊 yoluyla kendiliğinden okunur, yeni mesaj gönderilince durur", async () => {
    const { speak, cancel } = mockSpeech();
    mockFetch({ "/api/ai/chat": () => chatReply("Işık enerjisi ==kimyasal enerjiye== dönüşür.") });
    renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD, isPremium: true });
    fireEvent.click(screen.getByRole("button", { name: "Daha fazla" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Yanıtları sesli oku/ }));
    expect(window.localStorage.getItem(AUTO_SPEAK_KEY)).toBe("1");
    expect(screen.getByRole("menuitemcheckbox", { name: /Yanıtları sesli oku/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    // Açılmadan önceki yanıtlar okunmaz.
    expect(speak).not.toHaveBeenCalled();
    const box = screen.getByPlaceholderText("Sor, konuş veya dosya gönder");
    fireEvent.change(box, { target: { value: "Özetle" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect((speak.mock.calls[0]![0] as { text: string }).text).toBe("Işık enerjisi kimyasal enerjiye dönüşür.");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Okumayı durdur" })).toHaveLength(1));
    cancel.mockClear();
    fireEvent.change(screen.getByPlaceholderText("Sor, konuş veya dosya gönder"), { target: { value: "Devam" } });
    await act(async () => {
      fireEvent.keyDown(screen.getByPlaceholderText("Sor, konuş veya dosya gönder"), { key: "Enter" });
    });
    expect(cancel).toHaveBeenCalled();
  });

  it("varsayılan kapalı: yanıt kendiliğinden okunmaz", async () => {
    const { speak } = mockSpeech();
    mockFetch({ "/api/ai/chat": () => chatReply("Kısa bir yanıt.") });
    renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD, isPremium: true });
    const box = screen.getByPlaceholderText("Sor, konuş veya dosya gönder");
    fireEvent.change(box, { target: { value: "Neden?" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await waitFor(() => expect(screen.getByText("Kısa bir yanıt.")).toBeTruthy());
    expect(speak).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("geçmiş düğmesi", () => {
  it("geçmiş paneli sayfadaysa saat düğmesi çekmecesini açar", async () => {
    mockFetch({ "/api/teacher/conversations": () => new Response(JSON.stringify({ groups: [] }), { status: 200 }) });
    render(
      <>
        <TutorHistoryPanel />
        <ChatPanel variant="parity" composerMode="parity" hasDocuments={false} teacherV2 initialConversationId={CONV} initialMessages={THREAD} />
      </>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sohbet geçmişi" }));
    });
    expect(await screen.findByRole("dialog", { name: "Sohbet geçmişi" })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("panel yoksa Geçmiş konuşmalar sayfasını açar (işlemeyen düğme yok)", () => {
    mockFetch();
    renderPanel({ teacherV2: true, initialConversationId: CONV, initialMessages: THREAD });
    fireEvent.click(screen.getByRole("button", { name: "Sohbet geçmişi" }));
    expect(push).toHaveBeenCalledWith("/sohbetler");
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("saf: yanıt temizliği ve yumuşak akış", () => {
  it("damgalar ayrılır; genel bilgi bölümü işaretle; takip soruları ve stüdyo düğmeleri ayrı", () => {
    const clean = cleanV3Reply(STAMPED);
    expect(clean.questions).toHaveLength(3);
    // Bölüm işareti satırı dışında hiçbir işaret kalmaz.
    expect(clean.body.split("\n").filter((line) => line !== V3_GENERAL_MARK).join("\n")).not.toMatch(/Belgeden|Kaynaklar:|\[1\]|\[\[|Genel bilgiden/);
    expect(v3Segments(clean.body)).toEqual([
      { general: false, text: "Fotosentezde ışık enerjisi **klorofil** tarafından soğurulur ve ==kimyasal enerjiye dönüştürülür==." },
      { general: true, text: "Bitkiler bu enerjiyi glikoz üretmek için kullanır." },
    ]);
  });

  it("satır içi etiketler, Materyal dışı rozeti ve 'belgede yok' satırı da genel bölümü açar; belge bölümü kapatır", () => {
    const body = cleanV3Reply("Belgeden: Mol bir sayı birimidir.\n\nGenel bilgiden: Avogadro sayısı çok büyüktür.\n\nBelgeden: Mol kütlesi gramdır.").body;
    expect(v3Segments(body)).toEqual([
      { general: false, text: "Mol bir sayı birimidir." },
      { general: true, text: "Avogadro sayısı çok büyüktür." },
      { general: false, text: "Mol kütlesi gramdır." },
    ]);
    expect(v3Segments(cleanV3Reply("[[rozet:Materyal dışı]]\n\nTanzimat 1839'da ilan edildi.").body)).toEqual([
      { general: true, text: "Tanzimat 1839'da ilan edildi." },
    ]);
    expect(v3Segments(cleanV3Reply("Bu, belgede yok.\nOsmanlı'da ilk anayasa 1876'dır.").body)[0]).toEqual({ general: true, text: "Osmanlı'da ilk anayasa 1876'dır." });
    // Bölüm işaretleri ekrana yazılmaz.
    expect(V3_GENERAL_MARK).not.toBe(V3_DOC_MARK);
  });

  it("kod bloğundaki köşeli parantez atıf sayılmaz", () => {
    const body = cleanV3Reply("Dizi:\n\n```\nliste[1] = 5\n```\n\nBuna dikkat [2].").body;
    expect(body).toContain("liste[1] = 5");
    expect(body).not.toContain("[2]");
  });

  it("akarken yarım işaret ve kapanmamış adım bloğu gizlenir", () => {
    expect(hidePartialMarkers("Cevap şu. [[sorular:Neden")).toBe("Cevap şu.");
    expect(hidePartialMarkers("Cevap şu. [[kay")).toBe("Cevap şu.");
    expect(hidePartialMarkers("Cevap şu. [")).toBe("Cevap şu.");
    expect(hidePartialMarkers("Önce bu.\n[[adimlar]]\n1. adım")).toBe("Önce bu.");
    expect(hidePartialMarkers("Tamam [[benzetme:Bir köprü gibi]] bitti")).toBe("Tamam [[benzetme:Bir köprü gibi]] bitti");
  });

  it("kopyalanan metin işaretsiz ve atıfsız", () => {
    expect(v3PlainText(STAMPED)).toBe(
      "Fotosentezde ışık enerjisi klorofil tarafından soğurulur ve kimyasal enerjiye dönüştürülür.\n\nBitkiler bu enerjiyi glikoz üretmek için kullanır.",
    );
  });

  it("yumuşak akış: kelime sınırında ilerler, en çok ~1,2 sn geride kalır, akış bitince hızlanır", () => {
    const text = "Kuvvet çarpı yol işe eşittir ve birimi joule olarak ölçülür.";
    expect(wordEnd(text, 2)).toBe(6);
    const first = revealStep({ shown: 0, carry: 0 }, text, 100, true);
    expect(first.shown).toBe(wordEnd(text, first.shown));
    expect(text[first.shown - 1]).not.toBe(" ");
    // Büyük tampon: bir saniyede tamponun en az (1000 / gecikme sınırı) kadarı açılır.
    const big = "kelime ".repeat(400);
    const step = revealStep({ shown: 0, carry: 0 }, big, 1000, true);
    expect(step.shown).toBeGreaterThanOrEqual(Math.floor((big.length * 1000) / REVEAL_MAX_LAG_MS) - 10);
    // Akış bittiyse kalan kısım bitiş süresinde biter.
    const finish = revealStep({ shown: 0, carry: 0 }, big, REVEAL_FINISH_MS, false);
    expect(finish.shown).toBe(big.length);
    expect(revealStep({ shown: text.length, carry: 0 }, text, 16, false).shown).toBe(text.length);
  });
});
