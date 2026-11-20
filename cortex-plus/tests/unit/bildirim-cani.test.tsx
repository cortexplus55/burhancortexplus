// @vitest-environment jsdom
/**
 * Faz 6 (20 Kasım 2026): bildirim çanı. Rozet uçtan gelen okunmamış sayısıdır (9'dan fazlası "9+"); "Tümünü okundu
 * işaretle" okundu ucunu çağırıp rozeti siler; bildirime basınca okundu işaretlenir ve yalnız sitenin kendi yoluna
 * gidilir. Kabukta çan profil kapsülünün solunda, pazarlama başlığında yok. Tercih paneli kaydı düşünce geri döner.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { InAppNotification } from "@/lib/notifications/in-app";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/ogretmen",
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const ITEMS: InAppNotification[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "podcast_ready",
    title: "Podcast'in hazır",
    body: "Hücre bölünmesi bölümü dinlenmeye hazır.",
    actionUrl: "/deneme-sinavlari/p1",
    isRead: false,
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    kind: "legacy",
    title: "Dışarıya giden bağlantı",
    body: "",
    actionUrl: "https://kotu.example/oltalama",
    isRead: false,
    createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    kind: "payment",
    title: "Ödemen alındı",
    body: "Plus aktif.",
    actionUrl: null,
    isRead: true,
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  },
];

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let unread = 2;

function installFetch(options: { failRead?: boolean } = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method, body });
      if (url.startsWith("/api/notifications/read")) {
        if (options.failRead) return new Response("{}", { status: 503 });
        if ((body as { all?: boolean }).all) unread = 0;
        else unread = Math.max(0, unread - ((body as { ids: string[] }).ids?.length ?? 0));
        return Response.json({ ok: true, unread });
      }
      if (url.startsWith("/api/notifications")) {
        const limit = new URL(url, "http://localhost").searchParams.get("limit");
        return Response.json({ items: limit === "0" ? [] : ITEMS, unread });
      }
      return Response.json({ ok: true });
    }),
  );
}

beforeEach(async () => {
  unread = 2;
  push.mockClear();
  const { resetBellCountForTests } = await import("@/components/notifications/notification-bell");
  resetBellCountForTests();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderBell() {
  const { NotificationBell } = await import("@/components/notifications/notification-bell");
  render(<NotificationBell />);
  const bell = screen.getByRole("button", { name: /^Bildirimler/ });
  await waitFor(() => expect(bell.getAttribute("aria-label")).toBe("Bildirimler, 2 okunmamış"));
  return bell;
}

async function openBell(bell: HTMLElement) {
  await act(async () => {
    fireEvent.click(bell);
  });
  await screen.findByRole("button", { name: /Podcast'in hazır/ });
}

describe("bildirim çanı", () => {
  it("rozet uçtan gelen okunmamış sayısını yazar; 9'dan fazlası 9+", async () => {
    installFetch();
    const bell = await renderBell();
    expect(screen.getByTestId("bell-badge").textContent).toBe("2");
    expect(calls[0]).toMatchObject({ url: "/api/notifications?limit=0", method: "GET" });
    const { badgeText, bellLabel } = await import("@/components/notifications/notification-bell");
    expect(badgeText(12)).toBe("9+");
    expect(badgeText(9)).toBe("9");
    expect(bellLabel(0)).toBe("Bildirimler");
    expect(bell.getAttribute("aria-expanded")).toBe("false");
  });

  it("sayfa geçişinde (kabuk yeniden kurulur) sayı 60 sn içinde ikinci kez sorulmaz, rozet hemen görünür", async () => {
    installFetch();
    await renderBell();
    cleanup();
    const before = calls.length;
    const { NotificationBell } = await import("@/components/notifications/notification-bell");
    render(<NotificationBell />);
    expect(screen.getByTestId("bell-badge").textContent).toBe("2");
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(calls.length).toBe(before);
  });

  it("/bildirimler'de okundu işaretlenince çan rozeti de güncellenir", async () => {
    installFetch();
    await renderBell();
    const { NotificationsList } = await import("@/components/notifications/notifications-list");
    render(<NotificationsList initialItems={ITEMS} initialUnread={2} now={Date.now()} />);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Tümünü okundu işaretle" })[0]!);
    });
    expect(calls).toContainEqual({ url: "/api/notifications/read", method: "POST", body: { all: true } });
    await waitFor(() => expect(screen.queryByTestId("bell-badge")).toBeNull());
  });

  it("açılınca listeyi ister; boşsa 'Bildirimin yok'", async () => {
    installFetch();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [], unread: 0 })),
    );
    const { NotificationBell } = await import("@/components/notifications/notification-bell");
    render(<NotificationBell />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bildirimler" }));
    });
    expect(await screen.findByText("Bildirimin yok")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Bütün bildirimleri gör" }).getAttribute("href")).toBe("/bildirimler");
  });

  it("'Tümünü okundu işaretle' okundu ucunu çağırır ve rozeti siler", async () => {
    installFetch();
    const bell = await renderBell();
    await openBell(bell);
    expect(calls.some((call) => call.url === "/api/notifications?limit=20")).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tümünü okundu işaretle" }));
    });
    expect(calls).toContainEqual({ url: "/api/notifications/read", method: "POST", body: { all: true } });
    await waitFor(() => expect(screen.queryByTestId("bell-badge")).toBeNull());
    expect(bell.getAttribute("aria-label")).toBe("Bildirimler");
  });

  it("okundu işareti düşerse rozet geri gelir ve hata yazılır", async () => {
    installFetch({ failRead: true });
    const bell = await renderBell();
    await openBell(bell);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tümünü okundu işaretle" }));
    });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("bell-badge").textContent).toBe("2");
  });

  it("bildirime basınca okundu işaretlenir ve yalnız sitenin kendi yoluna gidilir", async () => {
    installFetch();
    const bell = await renderBell();
    await openBell(bell);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Dışarıya giden bağlantı/ }));
    });
    expect(calls).toContainEqual({ url: "/api/notifications/read", method: "POST", body: { ids: [ITEMS[1]!.id] } });
    expect(push).not.toHaveBeenCalled();
    // Dış bağlantılı bildirim pencereyi kapatmaz.
    expect(screen.getByRole("dialog", { name: "Bildirimler" })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Podcast'in hazır/ }));
    });
    expect(calls).toContainEqual({ url: "/api/notifications/read", method: "POST", body: { ids: [ITEMS[0]!.id] } });
    expect(push).toHaveBeenCalledWith("/deneme-sinavlari/p1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc kapatır ve odak çana döner; dışarıya dokunuş kapatır", async () => {
    installFetch();
    const bell = await renderBell();
    await openBell(bell);
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(bell);

    await openBell(bell);
    await act(async () => {
      fireEvent.pointerDown(document.body);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sitenin kendi yolu dışındaki adres süzülür", async () => {
    const { sameOriginPath } = await import("@/lib/notifications/relative-time");
    const origin = "https://cortexplus.app";
    expect(sameOriginPath("/ilerleme?sekme=1", origin)).toBe("/ilerleme?sekme=1");
    expect(sameOriginPath("https://kotu.example/x", origin)).toBeNull();
    expect(sameOriginPath("//kotu.example/x", origin)).toBeNull();
    expect(sameOriginPath("/\\kotu.example", origin)).toBeNull();
    expect(sameOriginPath("javascript:alert(1)", origin)).toBeNull();
    expect(sameOriginPath(null, origin)).toBeNull();
  });

  it("zaman metni Türkçe", async () => {
    const { relativeTimeTr } = await import("@/lib/notifications/relative-time");
    const now = Date.parse("2026-11-20T12:00:00Z");
    expect(relativeTimeTr("2026-11-20T11:59:40Z", now)).toBe("az önce");
    expect(relativeTimeTr("2026-11-20T11:48:00Z", now)).toBe("12 dakika önce");
    expect(relativeTimeTr("2026-11-20T09:00:00Z", now)).toBe("3 saat önce");
    expect(relativeTimeTr("2026-11-18T12:00:00Z", now)).toBe("2 gün önce");
  });

  it("kabukta çan profil kapsülünün solunda; pazarlama başlığına ve logoya dokunulmadı", () => {
    const shell = read("src/components/parity/sor-shell.tsx");
    const bellAt = shell.indexOf("<NotificationBell />");
    expect(bellAt).toBeGreaterThan(0);
    expect(bellAt).toBeLessThan(shell.indexOf("<AccountCapsule"));
    expect(read("src/components/marketing/parity-site-header.tsx")).not.toContain("NotificationBell");
    const css = read("src/styles/notification-bell.css");
    expect(css).toMatch(/max-width: 767px[\s\S]*\.cx-bell-btn \{[^}]*var\(--cx-tap-min\)/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.cx-bell-panel \{\s*animation: none/);
    // Tarayıcı bildirim tablolarına dokunmaz: bileşenler yalnız sunucu uçlarını çağırır.
    for (const file of [
      "src/components/notifications/notification-bell.tsx",
      "src/components/notifications/notifications-list.tsx",
      "src/components/notifications/notification-preferences-panel.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toMatch(/from\(["'](in_app_notifications|notifications|user_notification_preferences)["']\)/);
      expect(source).not.toContain("@/lib/supabase/client");
    }
  });
});

describe("tercih paneli", () => {
  const initial = {
    studyRemindersEmail: true,
    examCountdownEmail: true,
    weeklyDigestEmail: true,
    inAppNotifications: true,
    preferredStudyHour: 19 as const,
  };

  it("saat seçenekleri 18:30, 19:00, 20:00, 21:00; gece sessizliği notu yazılı", async () => {
    installFetch();
    const { NotificationPreferencesPanel } = await import("@/components/notifications/notification-preferences-panel");
    render(<NotificationPreferencesPanel initial={initial} mode={{ kind: "session" }} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.textContent)).toEqual(["18:30", "19:00", "20:00", "21:00"]);
    expect(radios[1]!.getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByText(
        "Gece 22:00–08:00 arası hatırlatma e-postası göndermeyiz; ödeme ve hesap e-postaları bu kurala tabi değildir.",
      ),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(radios[3]!);
    });
    expect(calls).toContainEqual({ url: "/api/notification-preferences", method: "POST", body: { preferredStudyHour: 21 } });
    expect(radios[3]!.getAttribute("aria-checked")).toBe("true");
  });

  it("kayıt düşerse anahtar eski hâline döner ve hata yazılır", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const { NotificationPreferencesPanel } = await import("@/components/notifications/notification-preferences-panel");
    render(<NotificationPreferencesPanel initial={initial} mode={{ kind: "session" }} />);
    const toggle = screen.getByRole("switch", { name: "Haftalık karne" });
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Tercihin kaydedilemedi");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("e-postadaki sayfa: anahtarla gönderir; 'Hepsini kapat' dört anahtarı birden kapatır", async () => {
    installFetch();
    const { NotificationPreferencesPanel } = await import("@/components/notifications/notification-preferences-panel");
    render(<NotificationPreferencesPanel initial={initial} mode={{ kind: "token", token: "t".repeat(64) }} showAllOff />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Hepsini kapat" }));
    });
    expect(calls).toContainEqual({
      url: "/api/bildirim-tercihleri",
      method: "POST",
      body: {
        token: "t".repeat(64),
        patch: { studyRemindersEmail: false, examCountdownEmail: false, weeklyDigestEmail: false, inAppNotifications: false },
      },
    });
    for (const toggle of screen.getAllByRole("switch")) expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("sayfa ve kapı: tercih sayfası onay kapısından muaf, GET yalnız okur", () => {
    const gate = read("src/components/legal/consent-gate.tsx");
    expect(gate).toContain('"/bildirim-tercihleri",');
    const page = read("src/app/bildirim-tercihleri/page.tsx");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).not.toMatch(/saveNotificationPreferences|applyPreferencePatch|setMarketingPreference/);
    expect(page).not.toMatch(/Suspense/);
    const settings = read("src/app/ayarlar/page.tsx");
    expect(settings).toContain("<NotificationPreferencesPanel");
    expect(read("src/components/profile/email-preferences-card.tsx")).not.toContain("Çalışma hatırlatması");
  });
});
