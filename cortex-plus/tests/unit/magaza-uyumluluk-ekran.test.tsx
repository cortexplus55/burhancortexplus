// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/*
  Mağaza uyumluluğu, ekranlar (26 Kasım 2026): uygulamanın abonelik ekranı, Ayarlar'daki kalıcı hesap silme ve
  öğretmen yanıtının altındaki "Bildir". Karar tabloları ve metinler `magaza-uyumluluk.test.ts`'te.
*/

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
vi.mock("@/app/actions", () => ({ requestDataDeletion: vi.fn(async () => ({ ok: true, status: "completed" })) }));

const read = (path: string) => readFileSync(path, "utf8");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("uygulamanın abonelik ekranı", async () => {
  const { NativeSubscriptionScreen } = await import("@/components/billing/native-subscription-screen");
  const { storeOffersFromPlans, storeRenewalTerms, STORE_PRODUCTS } = await import("@/lib/billing/store-products");
  const { STORE_BILLING_LIVE, restoreAccountPurchases, restoreMessage } = await import("@/lib/billing/store-billing");

  const offers = storeOffersFromPlans([
    { slug: "plus-haftalik", price_try: 34900, active: true },
    { slug: "plus-aylik", price_try: 59900, active: true },
    { slug: "sigma-aylik", price_try: 199900, active: true },
    { slug: "plus-yillik", price_try: 499900, active: true },
  ]);

  it("yalnız mağazada satılan üç abonelik, ürün kimlikleriyle; fiyatsız ürün listeye girmez", () => {
    expect(offers.map((offer) => offer.productId)).toEqual(["sinav_haftasi", "plus_monthly", "sigma_monthly"]);
    expect(STORE_PRODUCTS.map((product) => product.slug)).not.toContain("plus-yillik");
    expect(storeOffersFromPlans([{ slug: "plus-aylik", price_try: null }])).toEqual([]);
  });

  it("plan adı, dönem, fiyat, otomatik yenileme, 24 saat, geri yükleme ve iki hukuki bağlantı var; PayTR ve veli yok", () => {
    render(<NativeSubscriptionScreen platform="ios" offers={offers} currentPlan={null} />);
    const text = document.body.textContent ?? "";
    for (const name of ["Sınav Haftası", "Plus", "Sigma"]) expect(text).toContain(name);
    expect(text).toMatch(/haftalık otomatik yenilenir/);
    expect(text).toMatch(/aylık otomatik yenilenir/);
    expect(text).toMatch(/₺599/);
    expect(text).toMatch(/en az 24 saat önce iptal edilmezse/);
    expect(text).toMatch(/App Store abonelik ayarlarından/);
    expect(screen.getByRole("button", { name: "Satın Alımları Geri Yükle" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Gizlilik Politikası" }).getAttribute("href")).toBe("/gizlilik");
    expect(screen.getByRole("link", { name: "Kullanım Şartları" }).getAttribute("href")).toBe("/kullanim-kosullari");
    expect(screen.getByRole("link", { name: /App Store aboneliklerini yönet/ }).getAttribute("href")).toBe(
      "https://apps.apple.com/account/subscriptions",
    );
    expect(text).not.toMatch(/PayTR|[Vv]eli|kampanya kodu|Kodun var mı/);
    expect(text).not.toMatch(/web('den| sitesinden) (daha )?ucuz/i);
  });

  it("Android'de Google Play'in abonelik sayfası, paket adıyla", () => {
    render(<NativeSubscriptionScreen platform="android" offers={offers} currentPlan="Plus" />);
    expect(screen.getByRole("link", { name: /Google Play aboneliklerini yönet/ }).getAttribute("href")).toBe(
      "https://play.google.com/store/account/subscriptions?package=app.cortexplus.mobile",
    );
    expect(screen.getByTestId("store-current-plan").textContent).toContain("Plus");
    expect(storeRenewalTerms("android").join(" ")).toMatch(/Google Play hesabın üzerinden/);
  });

  it("mağaza bağlantısı canlıda doğrulanmadan satın alma düğmesi kapalı ve nedeni yazılı", () => {
    render(<NativeSubscriptionScreen platform="ios" offers={offers} currentPlan={null} />);
    const buy = screen.getByRole("button", { name: /ile başla/ }) as HTMLButtonElement;
    expect(STORE_BILLING_LIVE).toBe(false);
    expect(buy.disabled).toBe(true);
    expect(document.body.textContent).toMatch(/mağaza bağlantısı tamamlanınca açılır/);
  });

  it("plan seçimi düğmenin yazısını değiştirir", () => {
    render(<NativeSubscriptionScreen platform="ios" offers={offers} currentPlan={null} />);
    fireEvent.click(screen.getByRole("radio", { name: /Sınav Haftası/ }));
    expect(screen.getByRole("button", { name: /Sınav Haftası · ₺349 \/ hafta ile başla/ })).toBeTruthy();
  });

  it("geri yükleme hesabın planını sunucudan okur", async () => {
    const active = await restoreAccountPurchases((async () =>
      new Response(JSON.stringify({ plus: true, badge: "Sigma" }), { status: 200 })) as typeof fetch);
    expect(active).toEqual({ kind: "active", plan: "Sigma" });
    expect(restoreMessage(active)).toMatch(/Sigma açık/);
    const none = await restoreAccountPurchases((async () =>
      new Response(JSON.stringify({ plus: false }), { status: 200 })) as typeof fetch);
    expect(restoreMessage(none)).toMatch(/bulunamadı/);
    const failed = await restoreAccountPurchases((async () => new Response("", { status: 503 })) as typeof fetch);
    expect(failed.kind).toBe("failed");
  });

  it("/pay uygulamada yalnız mağaza ekranını çizer; PayTR kartları, kod ve veli bağlantısı o dalda yok", () => {
    const page = read("src/app/pay/page.tsx");
    const nativeBranch = page.slice(page.indexOf("if (nativePlatform)"), page.indexOf("const [extendedPlans"));
    expect(nativeBranch).toContain("NativeSubscriptionScreen");
    expect(nativeBranch).not.toMatch(/SubscriptionCards|PromoRedeem|PlusMonth|Parent/);
  });
});

describe("Ayarlar'da kalıcı hesap silme", async () => {
  const { AccountDeletionPanel } = await import("@/components/profile/account-deletion-panel");

  it("düğmenin adı, onay penceresi ve mağaza uyarısı", async () => {
    render(<AccountDeletionPanel request={null} requestedAtLabel={null} />);
    expect(screen.getByTestId("account-delete-store-warning").textContent).toMatch(/kendiliğinden iptal olmaz/);
    expect(document.body.textContent).toMatch(/Silinenler/);
    expect(document.body.textContent).toMatch(/Mevzuat gereği kalanlar/);
    fireEvent.click(screen.getByRole("button", { name: "Hesabımı kalıcı olarak sil" }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    const dialog = screen.getByRole("alertdialog").textContent ?? "";
    expect(dialog).toMatch(/geri alınamaz/);
    expect(dialog).toMatch(/App Store ya da Google Play/);
    expect(screen.getByRole("button", { name: "Kalıcı olarak sil" })).toBeTruthy();
  });

  it("talep varsa durumu yazar, düğme görünmez", () => {
    render(<AccountDeletionPanel request={{ status: "pending" }} requestedAtLabel="26 Kasım 2026" />);
    expect(screen.getByRole("status").textContent).toMatch(/işleniyor/);
    expect(screen.queryByRole("button", { name: "Hesabımı kalıcı olarak sil" })).toBeNull();
  });
});

describe("öğretmen yanıtını bildir", async () => {
  const { MessageActions } = await import("@/components/chat/message-actions");

  it("iki görünümde de tek dokunuşla açılır; kaydedilmemiş yanıtta da gönderilir", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    for (const layout of ["default", "v3"] as const) {
      const { unmount } = render(<MessageActions content="Yanıt metni" layout={layout} />);
      fireEvent.click(screen.getByRole("button", { name: "Bildir" }));
      fireEvent.click(screen.getByRole("button", { name: "Uygunsuz ya da zararlı" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Bildirildi" })).toBeTruthy());
      unmount();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/ai/chat/report");
    expect(JSON.parse(String(init.body))).toMatchObject({ messageId: null, reason: "uygunsuz", excerpt: "Yanıt metni" });
  });

  it("kayıtlı yanıtta mesaj kimliği de gider (sunucu kendi kaydını okur; geçici kimlikte ekrandaki metni kullanır)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const id = "11111111-2222-4333-8444-555555555555";
    render(<MessageActions content="Yanıt" messageId={id} layout="v3" />);
    fireEvent.click(screen.getByRole("button", { name: "Bildir" }));
    fireEvent.click(screen.getByRole("button", { name: "Yanlış bilgi" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toEqual({ messageId: id, reason: "yanlis", excerpt: "Yanıt" });
  });
});
