// @vitest-environment jsdom
/**
 * Faz 11 (teacher.v2, 21 Kasım 2026): sohbet geçmişinin ekranları. Geçmiş konuşmalar sayfası bayrak kapalıyken
 * bugünkü listeyi birebir çizer (değişiklikten önce alınmış çıktı); gruplu hâl daralır/açılır, arama, ad değiştirme ve
 * silme gruplarda da çalışır. Öğretmen ekranının geçmiş paneli: çekmece, yan panel, konuşma adresleri.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const routerRefresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerRefresh, push: vi.fn() }) }));

const { SohbetlerList, prepBuckets } = await import("@/components/parity/sohbetler-list");
const { TutorHistoryPanel, HISTORY_COLLAPSED_KEY, HISTORY_ENDPOINT } = await import("@/components/parity/tutor-history-panel");
const { GENERAL_GROUP_KEY, groupConversations } = await import("@/lib/tutor/conversation-groups");

const NOW = "2026-11-21T12:00:00.000Z";
const P_BIO = "11111111-1111-4111-8111-111111111111";
const P_HIST = "22222222-2222-4222-8222-222222222222";

const ROWS = [
  { id: "c1", title: "Krossing over", updatedAt: "2026-11-21T10:00:00.000Z" },
  { id: "c2", title: "Mitoz evreleri", updatedAt: "2026-11-20T10:00:00.000Z" },
  { id: "c3", title: "Tanzimat Fermanı", updatedAt: "2026-11-19T10:00:00.000Z" },
  { id: "c4", title: "Çalışma planı", updatedAt: "2026-11-10T10:00:00.000Z" },
];
const GROUPS = groupConversations({
  conversations: ROWS,
  links: [
    { conversationId: "c1", prepId: P_BIO },
    { conversationId: "c2", prepId: P_BIO },
    { conversationId: "c3", prepId: P_HIST },
  ],
  preps: [
    { id: P_BIO, title: "Hücre Bölünmeleri", examDate: "2026-12-26" },
    { id: P_HIST, title: "Osmanlı Yenileşme Dönemi", examDate: null },
  ],
});

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  routerRefresh.mockReset();
  window.localStorage.clear();
  document.body.innerHTML = "";
});

describe("Geçmiş konuşmalar: bayrak kapalıyken bugünkü liste birebir", () => {
  // Çıktı, değişiklikten önceki bileşenden alındı (tests/fixtures/sohbet-gecmisi/duz-liste.json).
  const golden = JSON.parse(readFileSync("tests/fixtures/sohbet-gecmisi/duz-liste.json", "utf8")) as { full: string; empty: string };
  const items = [
    { id: "c1", title: "Mayoz bölünme", updatedAt: "2026-11-21T10:00:00.000Z" },
    { id: "c2", title: null, updatedAt: "2026-11-20T10:00:00.000Z" },
    { id: "c3", title: "Türev kuralları", updatedAt: "2026-11-10T10:00:00.000Z" },
  ];

  it("dolu ve boş liste aynı çıktı", () => {
    expect(renderToStaticMarkup(<SohbetlerList items={items} now={NOW} />)).toBe(golden.full);
    expect(renderToStaticMarkup(<SohbetlerList items={[]} now={NOW} />)).toBe(golden.empty);
  });
});

describe("Geçmiş konuşmalar: hazırlık grupları", () => {
  it("grup başlığı hazırlığın adı + sınav tarihi + sayı; Genel sonda; gün başlıkları yok", () => {
    render(<SohbetlerList items={ROWS} now={NOW} groups={GROUPS} />);
    const toggles = screen.getAllByRole("button", { expanded: true });
    expect(toggles.map((button) => button.textContent)).toEqual([
      "Hücre BölünmeleriSınav tarihi: 26 Ara2, 2 sohbet",
      "Osmanlı Yenileşme Dönemi1, 1 sohbet",
      "Genel sohbetler1, 1 sohbet",
    ]);
    expect(screen.queryByText("BUGÜN")).toBeNull();
    expect(screen.getByRole("link", { name: "Krossing over" }).getAttribute("href")).toBe("/ogretmen?sohbet=c1");
  });

  it("grup daralır ve açılır; liste gizlenir", () => {
    render(<SohbetlerList items={ROWS} now={NOW} groups={GROUPS} />);
    const toggle = screen.getByRole("button", { name: /Hücre Bölünmeleri/ });
    const list = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(list.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(list.hidden).toBe(false);
  });

  it("arama süzer ve daralmış grubu da açar", () => {
    render(<SohbetlerList items={ROWS} now={NOW} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button", { name: /Hücre Bölünmeleri/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Sohbet ara" }), { target: { value: "mitoz" } });
    expect(screen.getByRole("link", { name: "Mitoz evreleri" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Tanzimat Fermanı" })).toBeNull();
    expect(screen.getByRole("button", { name: /Hücre Bölünmeleri/ }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: "Sohbet ara" }), { target: { value: "yok böyle" } });
    expect(screen.getByText("Aramanla eşleşen sohbet yok.")).toBeTruthy();
  });

  it("silme ve ad değiştirme gruplarda da çalışır; boşalan grup kalkar", async () => {
    fetchMock.mockImplementation(() => json({ ok: true }));
    render(<SohbetlerList items={ROWS} now={NOW} groups={GROUPS} />);
    const history = screen.getByRole("button", { name: /Osmanlı Yenileşme Dönemi/ }).closest("section")!;
    fireEvent.click(within(history).getByRole("button", { name: "Sohbeti sil" }));
    fireEvent.click(within(history).getByRole("button", { name: "Evet" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Osmanlı Yenileşme Dönemi/ })).toBeNull());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ conversationId: "c3", deleted: true });

    const biology = screen.getByRole("button", { name: /Hücre Bölünmeleri/ }).closest("section")!;
    fireEvent.click(within(biology).getAllByRole("button", { name: "Yeniden adlandır" })[0]!);
    const input = screen.getByRole("textbox", { name: "Sohbet adı" });
    fireEvent.change(input, { target: { value: "Profaz I" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await within(biology).findByText("Profaz I")).toBeTruthy();
  });

  it("sunucunun grubunda olmayan satır Genel'e düşer; boş grup çizilmez", () => {
    const buckets = prepBuckets(GROUPS, [...ROWS, { id: "c9", title: "Yeni", updatedAt: NOW }]);
    expect(buckets.map((bucket) => bucket.key)).toEqual([P_BIO, P_HIST, GENERAL_GROUP_KEY]);
    expect(buckets.at(-1)!.rows.map((row) => row.id)).toEqual(["c4", "c9"]);
    expect(prepBuckets(GROUPS, ROWS.filter((row) => row.id !== "c3")).map((bucket) => bucket.key)).toEqual([P_BIO, GENERAL_GROUP_KEY]);
  });
});

/* ---------- Öğretmen ekranının geçmiş paneli ---------- */
function setWide(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe("öğretmen ekranı: geçmiş paneli", () => {
  it("dar ekranda Geçmiş çekmeceyi açar, grupları uçtan alır; konuşma bugünkü adresi açar ve çekmeceyi kapatır", async () => {
    setWide(false);
    fetchMock.mockImplementation(() => json({ groups: GROUPS, grouped: true }));
    render(<TutorHistoryPanel activeConversationId="c2" />);
    // Görünmeyen yan panel istek atmaz; istek ancak açılınca.
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Geçmiş" }));
    const dialog = await screen.findByRole("dialog", { name: "Sohbet geçmişi" });
    expect(fetchMock).toHaveBeenCalledWith(HISTORY_ENDPOINT, { cache: "no-store" });
    const active = await within(dialog).findByRole("link", { name: "Mitoz evreleri" });
    expect(active.getAttribute("href")).toBe("/ogretmen?sohbet=c2");
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(within(dialog).getByRole("link", { name: "Krossing over" }).getAttribute("aria-current")).toBeNull();
    expect(within(dialog).getByText("26 Ara")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Geçmiş konuşmalar" }).getAttribute("href")).toBe("/sohbetler");
    // jsdom sayfa değiştiremez: tıklamanın gezinmesi durdurulur, bağlantının kendi işi (çekmeceyi kapatmak) yine çalışır.
    const stop = (event: Event) => event.preventDefault();
    window.addEventListener("click", stop, true);
    fireEvent.click(within(dialog).getByRole("link", { name: "Krossing over" }));
    window.removeEventListener("click", stop, true);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("okunamazsa nedenini söyler ve yeniden dener", async () => {
    setWide(false);
    fetchMock.mockImplementationOnce(() => json({ error: "x" }, 503)).mockImplementation(() => json({ groups: GROUPS }));
    render(<TutorHistoryPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Geçmiş" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Geçmiş konuşmalar şu an okunamadı.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tekrar dene" }));
    expect(await within(dialog).findByRole("link", { name: "Tanzimat Fermanı" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("geniş ekranda açık sohbette yan panel daralır ve açılır; tercih tarayıcıda saklanır", async () => {
    setWide(true);
    fetchMock.mockImplementation(() => json({ groups: GROUPS }));
    const messages = document.createElement("div");
    messages.className = "cp-sor-messages";
    document.body.appendChild(messages);
    const { container } = render(<TutorHistoryPanel />);
    const root = container.querySelector(".cx-thist")!;
    expect(root.getAttribute("data-collapsed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Geçmişi daralt" }));
    expect(root.getAttribute("data-collapsed")).toBe("true");
    expect(window.localStorage.getItem(HISTORY_COLLAPSED_KEY)).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Geçmiş" }));
    expect(root.getAttribute("data-collapsed")).toBe("false");
    expect(window.localStorage.getItem(HISTORY_COLLAPSED_KEY)).toBeNull();
    // Yan panel açıldı; çekmece açılmadı.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await within(container.querySelector("aside")!).findByRole("link", { name: "Krossing over" })).toBeTruthy();
  });

  it("geniş ekranda sohbet açılmadan (ana ekran) Geçmiş çekmeceyi açar", async () => {
    setWide(true);
    fetchMock.mockImplementation(() => json({ groups: GROUPS }));
    render(<TutorHistoryPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Geçmiş" }));
    expect(await screen.findByRole("dialog", { name: "Sohbet geçmişi" })).toBeTruthy();
  });

  it("daraltma tercihi açılışta okunur; okunamazsa panel açık başlar", () => {
    setWide(true);
    window.localStorage.setItem(HISTORY_COLLAPSED_KEY, "1");
    const { container, unmount } = render(<TutorHistoryPanel />);
    expect(container.querySelector(".cx-thist")!.getAttribute("data-collapsed")).toBe("true");
    unmount();
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("kapalı depolama");
    });
    const second = render(<TutorHistoryPanel />);
    expect(second.container.querySelector(".cx-thist")!.getAttribute("data-collapsed")).toBe("false");
    getItem.mockRestore();
  });
});
