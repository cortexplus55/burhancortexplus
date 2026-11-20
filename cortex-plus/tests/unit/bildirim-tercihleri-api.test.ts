/**
 * Faz 6 (20 Kasım 2026): bildirim ve tercih uçları. Oturumlu tercih ucu saati yalnız 18/19/20/21 kabul eder; anahtarlı
 * uçlar (sayfa düğmesi ve RFC 8058 tek tık) yalnız istenen kategoriyi kapatır, GET hiçbir şeyi değiştirmez, geçersiz
 * anahtar 404 döner; gönderilmiş e-postalardaki eski imzalı bağlantı yeni depoya yazar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID_TOKEN = "a".repeat(64);
const TOKEN_USER = "11111111-2222-4333-8444-555555555555";
const SESSION_USER = "99999999-8888-4777-8666-555555555555";

const profileUpdates: { values: Record<string, unknown>; id: unknown }[] = [];

function fakeService() {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      let values: Record<string, unknown> = {};
      builder.update = (next: Record<string, unknown>) => {
        values = next;
        return builder;
      };
      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        if (table === "profiles" && column === "id") profileUpdates.push({ values, id: value });
        return builder;
      };
      builder.maybeSingle = async () => ({ data: null, error: null });
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve);
      return builder;
    },
  };
}

const service = fakeService();

const saveNotificationPreferences = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
const setMarketingPreference = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
const markNotificationsRead = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
const listInAppNotifications = vi.fn<(...args: unknown[]) => Promise<{ items: never[]; unread: number }>>(async () => ({ items: [], unread: 2 }));
const unreadCount = vi.fn<(...args: unknown[]) => Promise<number>>(async () => 2);

vi.mock("@/lib/api/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/guards")>()),
  withUser: vi.fn(async () => ({ ok: true, ctx: { userId: SESSION_USER, service } })),
  guestLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => service, createClient: async () => service }));
vi.mock("@/lib/notifications/preferences", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/preferences")>();
  return {
    ...actual,
    saveNotificationPreferences,
    loadNotificationPreferences: vi.fn(async () => ({ ...actual.DEFAULT_NOTIFICATION_PREFERENCES })),
    preferencesByToken: vi.fn(async (_service: unknown, token: string | null | undefined) =>
      token === VALID_TOKEN ? { userId: TOKEN_USER, preferences: { ...actual.DEFAULT_NOTIFICATION_PREFERENCES } } : null,
    ),
  };
});
vi.mock("@/lib/email/preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/preferences")>()),
  setMarketingPreference,
}));
vi.mock("@/lib/notifications/in-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications/in-app")>()),
  listInAppNotifications,
  unreadCount,
  markNotificationsRead,
}));

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  saveNotificationPreferences.mockClear();
  setMarketingPreference.mockClear();
  markNotificationsRead.mockClear();
  listInAppNotifications.mockClear();
  unreadCount.mockClear();
  profileUpdates.length = 0;
});

describe("oturumlu tercih ucu", () => {
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/notification-preferences/route");
    return POST(new Request("http://localhost/api/notification-preferences", json(body)));
  };

  it("saat yalnız 18, 19, 20, 21 olabilir: 17 ve 22 reddedilir, hiçbir şey yazılmaz", async () => {
    expect((await post({ preferredStudyHour: 17 })).status).toBe(400);
    expect((await post({ preferredStudyHour: 22 })).status).toBe(400);
    expect((await post({ preferredStudyHour: "19" })).status).toBe(400);
    expect(saveNotificationPreferences).not.toHaveBeenCalled();
    const ok = await post({ preferredStudyHour: 21 });
    expect(ok.status).toBe(200);
    expect(saveNotificationPreferences).toHaveBeenCalledWith(service, SESSION_USER, { preferredStudyHour: 21 });
    const body = (await ok.json()) as { preferences: Record<string, unknown> };
    expect(body.preferences).not.toHaveProperty("unsubscribeToken");
  });

  it("boş ya da bilinmeyen alanlı değişiklik reddedilir", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ marketing: true })).status).toBe(400);
    expect((await post({ weeklyDigestEmail: "hayır" })).status).toBe(400);
    expect(saveNotificationPreferences).not.toHaveBeenCalled();
  });

  it("hatırlatma anahtarı eski sütuna da yansır (eski gönderim yolu kapalı tercihi görsün)", async () => {
    expect((await post({ studyRemindersEmail: false })).status).toBe(200);
    expect(saveNotificationPreferences).toHaveBeenCalledWith(service, SESSION_USER, { studyRemindersEmail: false });
    expect(profileUpdates).toContainEqual({ values: { study_reminder_email: false }, id: SESSION_USER });
  });

  it("kayıt düşerse 503 ve eski sütuna dokunulmaz", async () => {
    saveNotificationPreferences.mockResolvedValueOnce(false);
    expect((await post({ studyRemindersEmail: false })).status).toBe(503);
    expect(profileUpdates).toEqual([]);
  });
});

describe("anahtarlı tercih ucu (e-postadaki sayfa)", () => {
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/bildirim-tercihleri/route");
    return POST(new Request("http://localhost/api/bildirim-tercihleri", json(body)));
  };

  it("geçersiz anahtar 404 döner ve hiçbir şey yazmaz", async () => {
    const response = await post({ token: "b".repeat(64), patch: { weeklyDigestEmail: false } });
    expect(response.status).toBe(404);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["error", "ok"]);
    expect(saveNotificationPreferences).not.toHaveBeenCalled();
  });

  it("geçerli anahtar yalnız o hesabın tercihini yazar; saat kuralı aynı", async () => {
    expect((await post({ token: VALID_TOKEN, patch: { preferredStudyHour: 17 } })).status).toBe(400);
    const response = await post({ token: VALID_TOKEN, patch: { weeklyDigestEmail: false, preferredStudyHour: 20 } });
    expect(response.status).toBe(200);
    expect(saveNotificationPreferences).toHaveBeenCalledTimes(1);
    expect(saveNotificationPreferences).toHaveBeenCalledWith(service, TOKEN_USER, { weeklyDigestEmail: false, preferredStudyHour: 20 });
  });
});

describe("tek tıkla çıkış (RFC 8058)", () => {
  const url = (token: string, category: string) =>
    `http://localhost/api/bildirim-tercihleri/abonelik?token=${token}&c=${category}`;
  const oneClick = async (token: string, category: string, body?: string) => {
    const { POST } = await import("@/app/api/bildirim-tercihleri/abonelik/route");
    return POST(
      new Request(url(token, category), {
        method: "POST",
        headers: body ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
        body,
      }),
    );
  };

  it("yalnız istenen kategori kapanır; form gövdesi ve boş gövde kabul edilir", async () => {
    const response = await oneClick(VALID_TOKEN, "weeklyDigestEmail", "List-Unsubscribe=One-Click");
    expect(response.status).toBe(200);
    expect(saveNotificationPreferences).toHaveBeenCalledTimes(1);
    expect(saveNotificationPreferences).toHaveBeenCalledWith(service, TOKEN_USER, { weeklyDigestEmail: false });
    expect(setMarketingPreference).not.toHaveBeenCalled();

    saveNotificationPreferences.mockClear();
    expect((await oneClick(VALID_TOKEN, "examCountdownEmail")).status).toBe(200);
    expect(saveNotificationPreferences).toHaveBeenCalledWith(service, TOKEN_USER, { examCountdownEmail: false });
  });

  it("kampanya kategorisi yasal kanıtıyla kendi tablosunda kapanır, öbür tercihler değişmez", async () => {
    const response = await oneClick(VALID_TOKEN, "marketing", "List-Unsubscribe=One-Click");
    expect(response.status).toBe(200);
    expect(setMarketingPreference).toHaveBeenCalledWith(service, TOKEN_USER, false, expect.objectContaining({ source: "unsubscribe_link" }));
    expect(saveNotificationPreferences).not.toHaveBeenCalled();
  });

  it("geçersiz anahtar 404, bilinmeyen kategori 400; ikisi de hiçbir şey yazmaz", async () => {
    expect((await oneClick("c".repeat(64), "weeklyDigestEmail")).status).toBe(404);
    expect((await oneClick(VALID_TOKEN, "hepsi")).status).toBe(400);
    expect(saveNotificationPreferences).not.toHaveBeenCalled();
    expect(setMarketingPreference).not.toHaveBeenCalled();
  });

  it("GET hiçbir şeyi değiştirmez, tercih sayfasına yönlendirir", async () => {
    const { GET } = await import("@/app/api/bildirim-tercihleri/abonelik/route");
    const response = await GET(new Request(url(VALID_TOKEN, "weeklyDigestEmail")));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`http://localhost/bildirim-tercihleri?token=${VALID_TOKEN}`);
    expect(saveNotificationPreferences).not.toHaveBeenCalled();
    expect(setMarketingPreference).not.toHaveBeenCalled();
  });
});

describe("eski imzalı bağlantılar ve eski uçlar yeni depoya yazar", () => {
  it("/api/email/abonelik 'hatırlatma' kategorisi saveNotificationPreferences'tan geçer", async () => {
    vi.stubEnv("APP_SECRET", "test-secret-with-enough-length-0123456789");
    try {
      const { signUnsubscribeToken } = await import("@/lib/email/unsubscribe");
      const token = signUnsubscribeToken(TOKEN_USER, "reminder")!;
      const { POST } = await import("@/app/api/email/abonelik/route");
      const response = await POST(new Request(`http://localhost/api/email/abonelik?t=${encodeURIComponent(token)}`, { method: "POST" }));
      expect(response.status).toBe(200);
      expect(saveNotificationPreferences).toHaveBeenCalledWith(service, TOKEN_USER, { studyRemindersEmail: false });
      expect(setMarketingPreference).not.toHaveBeenCalled();

      const marketing = signUnsubscribeToken(TOKEN_USER, "marketing")!;
      saveNotificationPreferences.mockClear();
      await POST(new Request(`http://localhost/api/email/abonelik?t=${encodeURIComponent(marketing)}`, { method: "POST" }));
      expect(setMarketingPreference).toHaveBeenCalledWith(service, TOKEN_USER, false, expect.objectContaining({ source: "unsubscribe_link" }));
      expect(saveNotificationPreferences).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("Ayarlar'ın eski hatırlatma ucu da yeni depodan geçer", async () => {
    const { PATCH } = await import("@/app/api/profile/study-reminder/route");
    const response = await PATCH(
      new Request("http://localhost/api/profile/study-reminder", { ...json({ enabled: false }), method: "PATCH" }),
    );
    expect(response.status).toBe(200);
    expect(saveNotificationPreferences).toHaveBeenCalledWith(service, SESSION_USER, { studyRemindersEmail: false });
  });
});

describe("bildirim uçları", () => {
  it("liste en çok 50; ?limit=0 yalnız sayıyı döndürür", async () => {
    const { GET } = await import("@/app/api/notifications/route");
    await GET(new Request("http://localhost/api/notifications?limit=500"));
    expect(listInAppNotifications).toHaveBeenCalledWith(service, SESSION_USER, { limit: 50 });
    const count = await GET(new Request("http://localhost/api/notifications?limit=0"));
    expect(await count.json()).toEqual({ items: [], unread: 2 });
    expect(listInAppNotifications).toHaveBeenCalledTimes(1);
  });

  it("okundu işareti: kimlik ya da hepsi; bozuk kimlik ve boş gövde reddedilir", async () => {
    const { POST } = await import("@/app/api/notifications/read/route");
    const read = (body: unknown) => POST(new Request("http://localhost/api/notifications/read", json(body)));
    expect((await read({ ids: ["bir-kimlik"] })).status).toBe(400);
    expect((await read({})).status).toBe(400);
    expect(markNotificationsRead).not.toHaveBeenCalled();
    const id = "12345678-1234-4234-8234-123456789abc";
    const one = await read({ ids: [id] });
    expect(one.status).toBe(200);
    expect(markNotificationsRead).toHaveBeenCalledWith(service, SESSION_USER, [id]);
    expect(await one.json()).toEqual({ ok: true, unread: 2 });
    await read({ all: true });
    expect(markNotificationsRead).toHaveBeenLastCalledWith(service, SESSION_USER, "all");
  });
});
