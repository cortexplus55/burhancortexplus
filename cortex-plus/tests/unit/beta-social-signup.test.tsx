// @vitest-environment jsdom
import { readFileSync } from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { googleBlockedWebViewApp } from "@/lib/auth/in-app-browser";

/*
  Kapalı beta duyurusu Instagram ve WhatsApp / Telegram'dan (20 Ekim 2026, ürün sahibinin kararı).
  Instagram'dan gelen öğrencinin iki engeli vardı:
  1. Google, uygulamanın kendi tarayıcısında girişi reddediyor ("disallowed_useragent").
  2. Instagram'ın tarayıcısında kayıt olup onay e-postasını e-posta uygulamasından açınca onay başka
     tarayıcıda açılıyor; bağlantıdaki dönüş adresi (/pay?kod=…) yalnız ilk tarayıcıdaydı, kod kayboluyordu.
*/

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("next=/pay?kod=CORTEXBETA"),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signInWithPassword: vi.fn() } }) }));

import GirisPage from "@/app/giris/giris-inner";

const UA = {
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; tr_TR; tr; scale=3.00; 1170x2532; 615215290)",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 Instagram 337.0.0.35.102 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; tr_TR; 614167393)",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.37.106;FBBV/617001234;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBLC/tr_TR;FBOP/5]",
  tiktokIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_35.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/tr Region/TR",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("uygulamanın tarayıcısı: Google girişi", () => {
  it("Instagram, Facebook ve TikTok tarayıcısını tanır; gerçek tarayıcıya dokunmaz", () => {
    expect(googleBlockedWebViewApp(UA.instagramIos)).toBe("Instagram");
    expect(googleBlockedWebViewApp(UA.instagramAndroid)).toBe("Instagram");
    expect(googleBlockedWebViewApp(UA.facebookIos)).toBe("Facebook");
    expect(googleBlockedWebViewApp(UA.tiktokIos)).toBe("TikTok");
    expect(googleBlockedWebViewApp(UA.chromeAndroid)).toBeNull();
    expect(googleBlockedWebViewApp(UA.safariIos)).toBeNull();
    expect(googleBlockedWebViewApp("")).toBeNull();
    expect(googleBlockedWebViewApp(undefined)).toBeNull();
  });

  it("girişte Instagram tarayıcısında Google düğmesi yerine yol gösterir", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(UA.instagramIos);
    render(<GirisPage />);
    expect(screen.queryByRole("button", { name: "Google ile devam et" })).toBeNull();
    expect(screen.queryByText(/Google ile devam ederek/)).toBeNull();
    expect(screen.getByRole("note").textContent).toMatch(
      /^Instagram uygulamasının tarayıcısındasın; Google burada girişe izin vermiyor\. E-postanla devam et/,
    );
    // E-postayla giriş yerinde.
    expect(screen.getByRole("button", { name: "Giriş yap" })).toBeTruthy();
  });

  it("gerçek tarayıcıda Google düğmesi ve onay satırı durur", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(UA.safariIos);
    render(<GirisPage />);
    expect(screen.getByRole("button", { name: "Google ile devam et" })).toBeTruthy();
    expect(screen.getByText(/Google ile devam ederek/)).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("kayıt sihirbazı da aynı kuralı kullanır", () => {
    const wizard = read("src/app/kayit/signup-wizard.tsx");
    expect(wizard).toContain("const blockedApp = useGoogleBlockedWebViewApp();");
    expect(wizard).toMatch(/\{blockedApp \? \(\s*<GoogleBlockedNote/);
  });
});

describe("başka tarayıcıda onaylanan kayıt: dönüş adresi kaybolmaz", () => {
  it("kayıt dönüş adresini hesaba yazar; kurulum sonunda oraya gider", () => {
    const wizard = read("src/app/kayit/signup-wizard.tsx");
    expect(wizard).toContain('signup_next: safeNextPath(searchParams.get("next"), ""),');
    const onboarding = read("src/app/onboarding/page.tsx");
    expect(onboarding).toContain('typeof user.user_metadata?.signup_next === "string" ? user.user_metadata.signup_next : null');
    expect(onboarding).toMatch(/router\.push\(\s*signupNext \|\|/);
    // Kayıt onayı tarayıcıdan bağımsız açılınca tamamla sayfası yük bulamaz ve kuruluma gönderir.
    expect(read("src/app/kayit/tamamla/finalizer.tsx")).toContain('router.replace("/onboarding");');
  });

  it("kodlu bağlantı oturumsuz öğrenciyi kayda götürür; kayıttaki giriş bağlantısı kodu taşır", () => {
    expect(read("src/lib/supabase/middleware.ts")).toContain(
      'url.pathname = path === "/pay" && request.nextUrl.searchParams.has("kod") ? "/kayit" : "/giris";',
    );
    expect(read("src/components/layout/signup-premium-shell.tsx")).toContain("<Link href={loginHref}");
    expect(read("src/app/kayit/signup-wizard.tsx")).toContain(
      '? `/giris?next=${encodeURIComponent(safeNextPath(searchParams.get("next"), ""))}`',
    );
  });

  it("girişte Instagram tarayıcısında alt başlık Google'dan söz etmez", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(UA.instagramAndroid);
    render(<GirisPage />);
    expect(screen.getByText("E-postanla giriş yap.")).toBeTruthy();
    expect(screen.queryByText(/Google ile saniyeler içinde/)).toBeNull();
  });
});
