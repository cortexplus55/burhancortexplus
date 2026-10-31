// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }) }));

const celebrate = vi.fn();
vi.mock("@/lib/ui/confetti", () => ({ celebrate: (...args: unknown[]) => celebrate(...args) }));

import { PaymentActivation, PAYMENT_STATUS_URL } from "@/components/billing/payment-activation";
import {
  ACTIVATION_POLL_INTERVAL_MS,
  ACTIVATION_POLL_WINDOW_MS,
  ACTIVATION_REDIRECT_MS,
  APP_HOME_PATH,
  RECENT_PAYMENT_WINDOW_MS,
  activationLoginHref,
  isPlusActivated,
  recentPaymentStatus,
  type ActivationStatus,
} from "@/lib/payments/activation";

/*
  Ödeme dönüşü bekleme ekranı (31 Ekim 2026). PayTR öğrenciyi hemen geri gönderiyor; Plus'ı açan bildirim
  5-15 sn sonra gelebiliyor. Ekran 20 sn boyunca 1,5 sn'de bir durum sorar: açılınca kutlama ve uygulamaya
  geçiş, açılmazsa sakin "banka onayı uzadı" ekranı. Hiçbir durumda "başarısız" yazmaz.
*/

const pending: ActivationStatus = { plus: false, plan: null, badge: null, payment: { status: "pending" } };
const paid: ActivationStatus = { plus: true, plan: "Plus Aylık", badge: "Plus", payment: { status: "paid" } };

function mockStatus(next: () => { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    expect(String(input)).toBe(PAYMENT_STATUS_URL);
    const { status, body } = next();
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Sahte saati ilerletir ve aradaki yanıtların işlenmesini bekler. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  replace.mockReset();
  celebrate.mockReset();
});

describe("ödeme dönüşü: Plus tanımlanana kadar yoklama", () => {
  it("açılışta hemen sorar, 1,5 sn'de bir yineler; Plus açılınca durur, kutlar ve uygulamaya geçer", async () => {
    let calls = 0;
    const fetchMock = mockStatus(() => {
      calls += 1;
      return { status: 200, body: calls < 4 ? pending : paid };
    });
    render(<PaymentActivation signedIn />);
    expect(screen.getByText("🎉 Ödemen alındı, Plus paketin tanımlanıyor…")).toBeTruthy();

    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(ACTIVATION_POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(ACTIVATION_POLL_INTERVAL_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    expect(screen.getByText("Plus paketin hazır! 🎉")).toBeTruthy();
    expect(celebrate).toHaveBeenCalledTimes(1);
    const start = screen.getByRole("link", { name: /Hemen başla/ });
    expect(start.getAttribute("href")).toBe(APP_HOME_PATH);
    expect(replace).not.toHaveBeenCalled();

    await advance(ACTIVATION_REDIRECT_MS);
    expect(replace).toHaveBeenCalledWith(APP_HOME_PATH);

    // Açıldıktan sonra yoklama bitti: saat ilerlese de yeni istek yok.
    await advance(ACTIVATION_POLL_WINDOW_MS);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("20 sn'de açılmazsa sakin ekran: başarısız demez, makbuz ve destek bağlantısı verir, yoklama durur", async () => {
    const fetchMock = mockStatus(() => ({ status: 200, body: pending }));
    const { container } = render(<PaymentActivation signedIn />);

    await advance(ACTIVATION_POLL_WINDOW_MS - 1);
    expect(screen.queryByText("Banka onayı biraz uzadı")).toBeNull();
    const before = fetchMock.mock.calls.length;
    expect(before).toBeGreaterThanOrEqual(13);
    expect(before).toBeLessThanOrEqual(14);

    await advance(1);
    expect(screen.getByText("Banka onayı biraz uzadı")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tekrar kontrol et/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Makbuzlarım" }).getAttribute("href")).toBe("/odemeler");
    expect(screen.getByRole("link", { name: "Destek" }).getAttribute("href")).toBe("/destek");
    expect(container.textContent ?? "").not.toMatch(/başarısız|başarılamadı|reddedildi|hata/i);
    expect(celebrate).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    await advance(ACTIVATION_POLL_WINDOW_MS);
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("takılan istek 20 sn'yi uzatmaz; sunucu hatası ve ağ kopması öğrenciye gösterilmez", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn((_input: string, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) return Promise.reject(new TypeError("Failed to fetch"));
      if (calls === 2) return Promise.resolve(new Response("{}", { status: 503 }));
      // Hiç dönmeyen istek: yalnız iptal sinyaliyle biter.
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }));
    render(<PaymentActivation signedIn />);
    await advance(ACTIVATION_POLL_INTERVAL_MS * 2);
    expect(screen.getByText("🎉 Ödemen alındı, Plus paketin tanımlanıyor…")).toBeTruthy();
    await advance(ACTIVATION_POLL_WINDOW_MS);
    expect(screen.getByText("Banka onayı biraz uzadı")).toBeTruthy();
  });

  it("'Tekrar kontrol et' yoklamayı baştan başlatır ve Plus gelince yine kutlar", async () => {
    let activated = false;
    const fetchMock = mockStatus(() => ({ status: 200, body: activated ? paid : pending }));
    render(<PaymentActivation signedIn />);
    await advance(ACTIVATION_POLL_WINDOW_MS);
    expect(screen.getByText("Banka onayı biraz uzadı")).toBeTruthy();
    const afterFirstRound = fetchMock.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /Tekrar kontrol et/ }));
    expect(screen.getByText("🎉 Ödemen alındı, Plus paketin tanımlanıyor…")).toBeTruthy();
    await advance(0);
    expect(fetchMock.mock.calls.length).toBe(afterFirstRound + 1);

    // Yeni tur kendi 20 sn'sini alır: ilk turun süresi saymaz.
    await advance(ACTIVATION_POLL_WINDOW_MS - ACTIVATION_POLL_INTERVAL_MS);
    expect(screen.queryByText("Banka onayı biraz uzadı")).toBeNull();

    activated = true;
    await advance(ACTIVATION_POLL_INTERVAL_MS);
    expect(screen.getByText("Plus paketin hazır! 🎉")).toBeTruthy();
    expect(celebrate).toHaveBeenCalledTimes(1);
    await advance(ACTIVATION_REDIRECT_MS);
    expect(replace).toHaveBeenCalledWith(APP_HOME_PATH);
  });

  it("Sigma alan öğrenciye kendi paketinin adı yazılır", async () => {
    mockStatus(() => ({ status: 200, body: { ...paid, badge: "Sigma", plan: "Sigma Aylık" } }));
    render(<PaymentActivation signedIn />);
    await advance(0);
    expect(screen.getByText("Sigma paketin hazır! 🎉")).toBeTruthy();
  });
});

describe("ödeme dönüşü: oturum yok", () => {
  it("sunucu oturum görmediyse hiç sormaz; giriş bağlantısı aynı ekrana döner", async () => {
    const fetchMock = mockStatus(() => ({ status: 200, body: paid }));
    render(<PaymentActivation signedIn={false} />);
    await advance(ACTIVATION_POLL_WINDOW_MS);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Ödemen alındı")).toBeTruthy();
    const login = screen.getByRole("link", { name: /Giriş yap/ });
    const href = login.getAttribute("href") ?? "";
    expect(href.startsWith("/giris?next=")).toBe(true);
    expect(decodeURIComponent(href.slice("/giris?next=".length))).toBe("/odeme/basarili");
    expect(screen.getByRole("link", { name: "Destek" }).getAttribute("href")).toBe("/iletisim");
  });

  it("yoklama sırasında oturum düşerse (401) giriş ekranına geçer ve durur", async () => {
    const fetchMock = mockStatus(() => ({ status: 401, body: { error: "unauthorized" } }));
    render(<PaymentActivation signedIn returnPath="/odeme/basarili?kaynak=veli" forChild />);
    await advance(0);
    expect(screen.getByRole("link", { name: /Giriş yap/ }).getAttribute("href")).toBe(
      activationLoginHref("/odeme/basarili?kaynak=veli"),
    );
    await advance(ACTIVATION_POLL_WINDOW_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Plus tanımlandı mı (saf karar)", () => {
  const now = Date.parse("2026-10-31T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("son iki saatte biri ödendiyse 'paid'; yalnız eski ödeme varsa bu dönüşün kanıtı sayılmaz", () => {
    expect(recentPaymentStatus([], now)).toBeNull();
    expect(recentPaymentStatus([{ status: "paid", created_at: ago(RECENT_PAYMENT_WINDOW_MS + 1000) }], now)).toBeNull();
    // İki ödeme penceresi açılmış, eskisinde ödenmiş: en yeni satır "pending" olsa da ödendi.
    expect(
      recentPaymentStatus(
        [
          { status: "pending", created_at: ago(60_000) },
          { status: "paid", created_at: ago(5 * 60_000) },
        ],
        now,
      ),
    ).toEqual({ status: "paid" });
    expect(
      recentPaymentStatus(
        [
          { status: "failed", created_at: ago(10 * 60_000) },
          { status: "pending", created_at: ago(30_000) },
        ],
        now,
      ),
    ).toEqual({ status: "pending" });
  });

  it("Plus'ı süren öğrenci erken uzatınca bildirimi bekler; ödeme yoksa plan belirler; çocuk için yalnız ödeme", () => {
    expect(isPlusActivated({ plus: true, payment: { status: "pending" } })).toBe(false);
    expect(isPlusActivated({ plus: true, payment: null })).toBe(true);
    expect(isPlusActivated({ plus: false, payment: null })).toBe(false);
    // Kurucunun "Ücretsiz gibi gör" önizlemesi planı ücretsiz okur; ödeme satırı yine kanıttır.
    expect(isPlusActivated({ plus: false, payment: { status: "paid" } })).toBe(true);
    expect(isPlusActivated({ plus: true, payment: null }, { forChild: true })).toBe(false);
    expect(isPlusActivated({ plus: false, payment: { status: "paid" } }, { forChild: true })).toBe(true);
    expect(isPlusActivated(null)).toBe(false);
  });
});

describe("durum ucu ve sayfa", () => {
  it("uç oturum ister, yalnız okur ve önbelleğe girmez", async () => {
    vi.resetModules();
    const rows = [{ status: "paid", created_at: new Date().toISOString() }];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      gte: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(async () => ({ data: rows, error: null })),
    };
    const service = { from: vi.fn(() => query) };
    const withUser = vi.fn(async () => ({ ok: true, ctx: { userId: "u1", service } }));
    vi.doMock("@/lib/api/guards", () => ({ withUser }));
    vi.doMock("@/lib/billing/entitlements", () => ({
      getUserEntitlements: vi.fn(async () => ({ isPremium: true, planName: "Plus Aylık", badge: "Plus" })),
    }));
    const { GET } = await import("@/app/api/payments/status/route");
    const res = await GET(new Request("https://cortexplus.app/api/payments/status"));
    expect(withUser).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ scope: "payment-status" }));
    expect(service.from).toHaveBeenCalledWith("payments");
    expect(query.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ plus: true, plan: "Plus Aylık", badge: "Plus", payment: { status: "paid" } });
    vi.doUnmock("@/lib/api/guards");
    vi.doUnmock("@/lib/billing/entitlements");
  });

  it("sayfa Suspense sınırı kurmaz, her istekte çizilir; kredi sayısı yazılmaz", () => {
    const page = readFileSync("src/app/odeme/basarili/page.tsx", "utf8");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).not.toMatch(/<Suspense/);
    expect(existsSync("src/app/odeme/basarili/loading.tsx")).toBe(false);
    const component = readFileSync("src/components/billing/payment-activation.tsx", "utf8");
    expect(component).not.toMatch(/kredi/i);
    const css = readFileSync("src/styles/payment-activation.css", "utf8");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
