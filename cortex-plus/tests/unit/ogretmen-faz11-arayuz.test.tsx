// @vitest-environment jsdom
/**
 * Faz 11 · öğretmen sohbeti arayüzü (teacher.v2, ana sohbet, 21 Kasım 2026). Öğretmen v3 (aynı gün, ürün sahibi) ekranı
 * değiştirdi: anlatım seçicisi, düşünme cümlesi, tek sıra tepki çipleri ve karşılama kartları kalktı (yeni çizim
 * `ogretmen-v3-ekran.test.tsx`'te). Burada kalanlar: bayrak kapalıyken bugünkü çizim birebir, anlatımın hep "Adım Adım
 * Öğret" gitmesi, akışta yukarı kaydırma, canlı kara tahta (mini yoklama), fotoğrafla "Soruyu çöz / Çözümümü kontrol et",
 * Durdur ve Kopyala, saf yardımcılar. Model, kredi ve canlı API yok: istekler sahte. Örnekler farklı derslerden.
 */
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ChatPanel } from "@/components/chat/chat-panel";
import { TutorReplyView } from "@/components/chat/tutor-reply-view";
import { dispatchComposerAttach } from "@/lib/student/composer-bridge";
import { requestSolve } from "@/lib/solve/solve-client";
import { parseSolution } from "@/lib/solve/question-solver";
import { parseStudentWork, withStudentCheck } from "@/lib/solve/student-work";
import {
  chosenQuickCheckLetter,
  miniQuizTopic,
  mistakeErrorLine,
  questionBefore,
  replyActions,
} from "@/lib/teacher/reply-actions";
import { parseQuickCheck } from "@/lib/teacher/quick-check";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/ogretmen",
  useRouter: () => ({ replace, push, refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }));
vi.mock("@/lib/solve/solve-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/solve/solve-client")>()),
  requestSolve: vi.fn(async () => undefined),
}));

Element.prototype.scrollIntoView = vi.fn();
Element.prototype.scrollTo = vi.fn(function (this: Element, options?: ScrollToOptions | number) {
  if (typeof options === "object" && options && typeof options.top === "number") (this as HTMLElement).scrollTop = options.top;
}) as unknown as typeof Element.prototype.scrollTo;
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });

const CONV = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const mid = (n: number) => `0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c${String(n).padStart(2, "0")}`;

type Msg = { role: "user" | "assistant"; content: string; id?: string };

const QUESTION_THREAD: Msg[] = [
  { role: "user", content: "Sürtünmeli yüzeyde mekanik enerji neden azalır?", id: mid(1) },
  { role: "assistant", content: "Sürtünme kuvveti iş yapar. Bu iş hangi enerjiye dönüşür?", id: mid(2) },
];

const CHECK_REPLY = [
  "Dik üçgende en uzun kenar hipotenüstür.",
  "",
  "$$c^2 = a^2 + b^2$$",
  "",
  "> ⚠️ Sık hata: Hipotenüsü dik kenarlardan biri sanmak.",
  "",
  "> ❓ Yoklama: Dik kenarları 6 ve 8 olan üçgenin hipotenüsü kaçtır?",
  "> A) 10",
  "> B) 12",
  "> C) 14",
].join("\n");

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
    // Profil okuması ve plan yokmuş gibi: panel bugünkü varsayılanlarla kalır.
    if (url.includes("/api/profile/me") || url.includes("/api/teacher/plan")) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
  return calls;
}

const chatReply = (text = "Doğru, ısıya dönüşür.", messageId = mid(9)) =>
  new Response(text, { status: 200, headers: { "X-Message-Id": messageId, "X-Conversation-Id": CONV } });

function renderPanel(props: Partial<ComponentProps<typeof ChatPanel>> = {}) {
  return render(
    <ChatPanel
      variant="parity"
      composerMode="parity"
      hasDocuments={false}
      showSubjectPicker={false}
      placeholder="Sor, konuş veya dosya gönder"
      initialTutorStyle="step_by_step"
      {...props}
    />,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:fotograf"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  replace.mockClear();
  push.mockClear();
  vi.mocked(requestSolve).mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("bayrak kapalıyken bugünkü çizim", () => {
  it("üç düğmeli anahtar, devam önerileri; Faz 11 parçalarının hiçbiri yok", async () => {
    mockFetch();
    const { container } = renderPanel({ initialConversationId: CONV, initialMessages: QUESTION_THREAD });
    const group = screen.getByRole("radiogroup", { name: "Anlatım modu" });
    expect(within(group).getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual([
      "Sokratik (Önce İpucu)",
      "Adım Adım",
      "Doğrudan Çöz",
    ]);
    expect(screen.getByRole("button", { name: /Daha basit anlat/ })).toBeTruthy();
    expect(container.querySelector(".cx-teacher-v2, .cx-v2-reply, .cx-v2-chips, .cx-v2-check, .cx-v2-thinking")).toBeNull();
    expect(screen.queryByRole("button", { name: /Yanlışlar Defterime ekle/ })).toBeNull();
    expect(screen.queryByText("Sıra sende")).toBeNull();
  });

  it("yoklama bloğu kart olmaz; fotoğraf eklenince seçim yok, istek intent taşımaz", async () => {
    mockFetch();
    const { container } = renderPanel({
      initialConversationId: CONV,
      initialMessages: [{ role: "user", content: "Pisagor nedir?" }, { role: "assistant", content: CHECK_REPLY, id: mid(4) }],
    });
    expect(container.querySelector(".cx-v2-check")).toBeNull();
    act(() => dispatchComposerAttach({ type: "file", file: new File(["x"], "soru.png", { type: "image/png" }) }));
    await waitFor(() => expect(container.querySelector(".cp-composer-thumb")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Çözümümü kontrol et" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
    });
    expect(vi.mocked(requestSolve)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestSolve).mock.calls[0]![0]).not.toHaveProperty("intent");
  });

  it("karşılama kartları istenmez", async () => {
    const calls = mockFetch();
    renderPanel({ startGreeting: "Merhaba! Bugün ne çalışalım?" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Başla" }));
    });
    expect(calls.some((call) => call.url.includes("/api/teacher/start-cards"))).toBe(false);
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("anlatım: öğretmen v3'te seçici yok, hep Adım Adım Öğret", () => {
  it("bayrak açıkken ana sohbette anlatım anahtarı çizilmez; profil direct_solve olsa da istek tutor_steps gider, profil yazılmaz", async () => {
    const calls = mockFetch({ "/api/ai/chat": () => chatReply() });
    renderPanel({ teacherV2: true, initialTutorStyle: "direct_solve" });
    expect(screen.queryByRole("radiogroup", { name: "Anlatım modu" })).toBeNull();
    const box = screen.getByPlaceholderText("Sor, konuş veya dosya gönder");
    fireEvent.change(box, { target: { value: "Fotosentez neden ışığa ihtiyaç duyar?" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(calls.find((call) => call.url.includes("/api/ai/chat"))?.body?.tutorStyle).toBe("tutor_steps");
    expect(calls.some((call) => call.url.includes("/api/profile/me") && call.init?.method === "PATCH")).toBe(false);
    // Açık sohbette de seçici yok.
    expect(screen.queryByRole("radiogroup", { name: "Anlatım modu" })).toBeNull();
  });

  it("hazırlık sohbetinde (prepId) bugünkü anahtar kalır", () => {
    mockFetch();
    renderPanel({ teacherV2: true, prepId: "11111111-1111-4111-8111-111111111111" });
    expect(screen.getByRole("radio", { name: "Doğrudan Çöz" })).toBeTruthy();
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("akış: öğrenci yukarı kaydırınca", () => {
  it.each([
    ["teacher.v2", { teacherV2: true }],
    ["bayrak kapalı, ui.v2.ogretmen", { followUser: true }],
  ] as const)("öğrenci akış sırasında yukarı kaydırınca ekran zorla sona inmez (%s)", async (_label, mode) => {
    let pushChunk!: (text: string) => void;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        pushChunk = (text) => controller.enqueue(new TextEncoder().encode(text));
      },
    });
    mockFetch({ "/api/ai/chat": () => new Response(stream, { status: 200, headers: { "X-Message-Id": mid(9) } }) });
    const { container } = renderPanel({ ...mode, initialConversationId: CONV, initialMessages: QUESTION_THREAD });
    const scroller = container.querySelector<HTMLDivElement>(".cp-sor-messages, .cx-v3-thread")!;
    let height = 2000;
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, get: () => height });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => 400 });
    const box = screen.getByPlaceholderText(/Cevabını yaz|Sor, konuş/);
    fireEvent.change(box, { target: { value: "Peki ısı nereye gider?" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await act(async () => {
      pushChunk("Isı çevreye ");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // Öğrenci hemen (programın kaydırma penceresi açıkken) yukarı kaydırır.
    await act(async () => {
      scroller.scrollTop = 100;
      fireEvent.scroll(scroller);
    });
    await act(async () => {
      height = 2600;
      pushChunk("yayılır; sürtünen yüzeyler ısınır.");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(scroller.scrollTop).toBe(100);
    expect(screen.getByRole("button", { name: "Yeni mesaja git" })).toBeTruthy();
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("canlı kara tahta: mini yoklama", () => {
  it("yoklama kart olur; formül kartı ve Sık hata kutusu da çizilir; şık seçimi öğrencinin mesajı olur ve kart kilitlenir", async () => {
    const calls = mockFetch({ "/api/ai/chat": () => chatReply("Evet, 10. Çünkü 6² + 8² = 100.") });
    const { container } = renderPanel({
      teacherV2: true,
      initialConversationId: CONV,
      initialMessages: [{ role: "user", content: "Hipotenüs nasıl bulunur?", id: mid(3) }, { role: "assistant", content: CHECK_REPLY, id: mid(4) }],
    });
    const card = screen.getByRole("region", { name: "Mini yoklama" });
    expect(card.textContent).toContain("Dik kenarları 6 ve 8 olan üçgenin hipotenüsü kaçtır?");
    expect(container.querySelector(".cp-md-formula")).toBeTruthy();
    expect(container.querySelector('.cp-callout[data-callout="mistake"]')).toBeTruthy();
    // Yoklamanın kendisi alıntı kutusu olarak ikinci kez çizilmez; "Sıra sende" kartı da yok.
    expect(container.querySelectorAll(".cp-md-quote")).toHaveLength(0);
    expect(screen.queryByText("Sıra sende")).toBeNull();
    const options = within(card).getAllByRole("button");
    expect(options).toHaveLength(3);
    await act(async () => {
      fireEvent.click(options[1]!);
    });
    expect(calls.find((call) => call.url.includes("/api/ai/chat"))?.body?.message).toBe("Cevabım: B) 12");
    await waitFor(() => {
      const locked = within(screen.getAllByRole("region", { name: "Mini yoklama" })[0]!).getAllByRole("button");
      expect(locked.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
      expect(locked[1]!.getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("eski mesajın kartı etkileşimsiz; seçim sonraki öğrenci mesajından okunur", () => {
    mockFetch();
    renderPanel({
      teacherV2: true,
      initialConversationId: CONV,
      initialMessages: [
        { role: "assistant", content: CHECK_REPLY, id: mid(4) },
        { role: "user", content: "Cevabım: A) 10", id: mid(5) },
        { role: "assistant", content: "Doğru. Peki 5 ve 12 olsaydı?", id: mid(6) },
      ],
    });
    const buttons = within(screen.getByRole("region", { name: "Mini yoklama" })).getAllByRole("button");
    expect(buttons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("kurala uymayan blok kart olmaz (düz metin kalır)", () => {
    render(
      <TutorReplyView
        content={"Anlatım.\n\n> ❓ Yoklama: Hangisi?\n> B) yanlış sıra\n> A) ilk"}
        onPrompt={() => undefined}
        v2={{ actions: null, askCard: true, interactiveCheck: true }}
      />,
    );
    expect(screen.queryByRole("region", { name: "Mini yoklama" })).toBeNull();
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

const CHECK_JSON = {
  readable: true,
  subject: "Örnek",
  question: "3x + 4 = 19 ise x kaçtır?",
  options: [
    { letter: "A", text: "3" },
    { letter: "B", text: "5" },
    { letter: "C", text: "7" },
  ],
  kind: "mcq",
  intro: "Bilinmeyeni yalnız bırakıyoruz.",
  given: ["3x + 4 = 19"],
  asked: "x",
  steps: [
    { title: "Sabiti karşıya geçir", math: "3x = 19 - 4 = 15", say: "4 karşıya eksi olarak geçer." },
    { title: "Katsayıya böl", math: "x = 15 / 3 = 5", say: "İki tarafı 3'e böldük." },
  ],
  answer: { letter: "B", value: "5", text: "x = 5" },
  optionsWhy: [],
  trap: "Sabit karşıya geçerken işareti değişir.",
  tip: "Önce sabiti, sonra katsayıyı at.",
  check: "Kontrol: 3·5 + 4 = 19",
  studentWork: {
    present: true,
    lines: ["3x + 4 = 19", "3x = 19 + 4", "3x = 23"],
    answer: { value: "23/3" },
    steps: [{ n: 1, ok: true }, { n: 2, ok: false, kind: "isaret" }],
  },
};

describe("fotoğraf: kendiliğinden + düğme", () => {
  it("fotoğraf eklenince iki seçim; 'Çözümümü kontrol et' intent=check gönderir, sonuçta kontrol kartı", async () => {
    mockFetch();
    const solution = withStudentCheck(parseSolution(CHECK_JSON)!, parseStudentWork(CHECK_JSON));
    expect(solution.studentCheck).toBeTruthy();
    vi.mocked(requestSolve).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: "solution", solution, status: "checked", ms: 3100, agreed: true });
    });
    const { container } = renderPanel({ teacherV2: true });
    act(() => dispatchComposerAttach({ type: "file", file: new File(["x"], "defter.jpg", { type: "image/jpeg" }) }));
    const group = await screen.findByRole("group", { name: "Fotoğrafla ne yapalım?" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(["Soruyu çöz", "Çözümümü kontrol et"]);
    await act(async () => {
      fireEvent.click(within(group).getByRole("button", { name: "Çözümümü kontrol et" }));
    });
    expect(vi.mocked(requestSolve).mock.calls[0]![0]).toMatchObject({ intent: "check", toChat: true });
    await waitFor(() => expect(container.querySelector(".cp-solver-check")).toBeTruthy());
    expect(screen.getByText("📷 Çözümümü kontrol et")).toBeTruthy();
    expect(container.querySelector(".cp-solver-check .cp-solver-thumb img")?.getAttribute("src")).toBe("blob:fotograf");
  });

  it("'Soruyu çöz' intent=solve; düz Gönder sunucunun kararına bırakır (intent yok)", async () => {
    mockFetch();
    renderPanel({ teacherV2: true });
    act(() => dispatchComposerAttach({ type: "file", file: new File(["x"], "soru.png", { type: "image/png" }) }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Soruyu çöz" }));
    });
    expect(vi.mocked(requestSolve).mock.calls[0]![0]).toMatchObject({ intent: "solve" });
    act(() => dispatchComposerAttach({ type: "file", file: new File(["y"], "soru2.png", { type: "image/png" }) }));
    await screen.findByRole("button", { name: "Çözümümü kontrol et" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
    });
    expect(vi.mocked(requestSolve).mock.calls[1]![0]).not.toHaveProperty("intent");
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("Durdur ve Kopyala (öğretmen v3)", () => {
  it("Durdur akışı keser, Tekrar dene ders etiketini ikinci kez eklemez; Yeniden üret yok; Kopyala işaretsiz metni yazar", async () => {
    const sent: string[] = [];
    mockFetch({
      "/api/ai/chat": (init) => {
        const signal = init?.signal;
        sent.push(JSON.parse(String(init?.body)).message);
        if (sent.length > 1) return chatReply("Kuvvet ==çarpı yol== [1].");
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Durduruldu", "AbortError")));
        });
      },
    });
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPanel({ teacherV2: true, showSubjectPicker: true });
    // Ana ekranın yazma alanında ders seçimi: etiket "[Fizik]" mesajın başına eklenir.
    fireEvent.click(screen.getByRole("button", { name: "Ders seç" }));
    fireEvent.click(await screen.findByRole("button", { name: /Fizik/ }));
    const box = screen.getByPlaceholderText("Sor, konuş veya dosya gönder");
    fireEvent.change(box, { target: { value: "İş nasıl hesaplanır?" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yanıtı durdur" }));
    });
    await waitFor(() => expect(screen.getByText("Yanıt durduruldu.")).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    });
    expect(sent).toEqual(["[Fizik] İş nasıl hesaplanır?", "[Fizik] İş nasıl hesaplanır?"]);
    await waitFor(() => expect(screen.getByText(/çarpı yol/)).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Kopyala" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Yeniden üret" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kopyala" }));
    });
    expect(writeText).toHaveBeenCalledWith("Kuvvet çarpı yol.");
  });

  it("bayrak kapalıyken de Yeniden üret ders etiketini ikinci kez eklemez", async () => {
    const sent: string[] = [];
    mockFetch({
      "/api/ai/chat": (init) => {
        sent.push(JSON.parse(String(init?.body)).message);
        return chatReply("Kuvvet çarpı yol.");
      },
    });
    renderPanel({ teacherV2: false, showSubjectPicker: true });
    fireEvent.click(screen.getByRole("button", { name: "Ders seç" }));
    fireEvent.click(await screen.findByRole("button", { name: /Fizik/ }));
    const box = screen.getByPlaceholderText("Sor, konuş veya dosya gönder");
    fireEvent.change(box, { target: { value: "İş nasıl hesaplanır?" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await waitFor(() => expect(screen.getByText("Kuvvet çarpı yol.")).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Yeniden üret" }).at(-1)!);
    });
    expect(sent).toEqual(["[Fizik] İş nasıl hesaplanır?", "[Fizik] İş nasıl hesaplanır?"]);
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */

describe("saf yardımcılar", () => {
  it("mini test konusu: başlık > seçili konu; varsayılan başlık sayılmaz", () => {
    expect(miniQuizTopic({ conversationTitle: "Mol kavramı", cockpitTopic: "Kimyasal tepkimeler" })).toBe("Mol kavramı");
    expect(miniQuizTopic({ conversationTitle: "Yeni sohbet", cockpitTopic: "Kimyasal tepkimeler" })).toBe("Kimyasal tepkimeler");
    expect(miniQuizTopic({})).toBeNull();
  });

  it("yanıtın sorusu: önceki en yakın öğrenci mesajı, ders etiketi atılır", () => {
    const thread = [
      { role: "user" as const, content: "[Tarih] Kanun-i Esasi ne zaman ilan edildi?" },
      { role: "assistant" as const, content: "Sence hangi yüzyıl?" },
    ];
    expect(questionBefore(thread, 1)).toBe("Kanun-i Esasi ne zaman ilan edildi?");
    expect(questionBefore(thread, 0)).toBeNull();
  });

  it("seçilen şık sonraki öğrenci mesajından; başka metin seçim sayılmaz", () => {
    const check = parseQuickCheck(CHECK_REPLY)!;
    expect(chosenQuickCheckLetter(check, "Cevabım: C) 14")).toBe("C");
    expect(chosenQuickCheckLetter(check, "[Matematik] Cevabım: A) 10")).toBe("A");
    expect(chosenQuickCheckLetter(check, "bence 10")).toBeNull();
    expect(chosenQuickCheckLetter(check, null)).toBeNull();
  });

  it("deftere ekle yalnız kayıtlı kimliklerle; durum kilidi", () => {
    const base = { content: "Bu iş hangi enerjiye dönüşür?", mode: "tutor_steps" as const };
    expect(replyActions({ ...base }).map((action) => action.id)).toEqual(["hint", "quiz"]);
    const saving = replyActions({ ...base, messageId: mid(2), conversationId: CONV, mistake: "saving" });
    expect(saving.find((action) => action.id === "mistake")).toMatchObject({ disabled: true, busy: true });
    expect(replyActions({ ...base, messageId: mid(2), conversationId: CONV }).find((action) => action.id === "mistake")?.disabled).toBe(false);
  });

  it("hata iletileri sade", () => {
    expect(mistakeErrorLine(404)).toBe("Bu yanıt deftere eklenemedi.");
    expect(mistakeErrorLine(0)).toContain("yeniden dene");
  });
});
