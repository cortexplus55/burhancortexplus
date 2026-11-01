import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { homePathForRole } from "@/lib/parity/signup";
import { onboardingPathForRole } from "@/lib/auth/onboarding-path";
import { accountActiveOrUnknown } from "@/lib/auth/active-account";
import {
  applyDeviceCookie,
  checkSignedInDevice,
  checkSignedOutDevice,
  otherDeviceRedirect,
  type DeviceCookieUpdate,
} from "@/lib/auth/device-sessions";

/** Legacy veli/öğretmen URL’leri — öğrenci-only ürün. */
const RETIRED_PREFIXES = [
  "/veli",
  "/ogretmen-paneli",
  "/sinifim",
  "/odevlerim",
  "/ogretmenler-ve-profesorler-icin",
];

/**
 * Eski kısa adresler. Sayfa yok; kalıcı ürün de yok.
 * Hedef korumalıysa misafir bir sonraki istekte `/giris?next=` ile düşer.
 */
const LEGACY_ALIASES: Record<string, string> = {
  "/sor": "/soru-coz",
  "/chat": "/ogretmen",
  "/podcast": "/studio/podcast",
  // 2 Kasım 2026: "sık sorulan sorular" için tahmin edilen adres 404 veriyordu; cevaplar Yardım'da.
  "/sss": "/yardim",
};

/**
 * Yeni öğrenciyi taşıyan korumalı adresler: misafir "Tekrar hoş geldin" diyen girişe değil kayda düşer
 * (`next` korunur; kayıttaki "Giriş yap" bağlantısı onu taşır). Sınav kurulumu bağlantıları pazarlama
 * sayfalarından ve Hızlı Tarama sonucundan geliyor.
 */
export function guestEntryPath(path: string, search: URLSearchParams): "/kayit" | "/giris" {
  if (path === "/pay" && search.has("kod")) return "/kayit";
  if (path === "/deneme-sinavlari/resmi/kurulum" || path.startsWith("/deneme-sinavlari/resmi/kurulum/")) return "/kayit";
  return "/giris";
}

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/ogretmen",
  "/sohbetler",
  "/dokumanlar",
  "/soru-coz",
  "/sinav-hazirligi/app",
  "/quizler",
  "/flashcardlar",
  "/studio",
  "/deneme-sinavlari",
  // "/uygulamalar" bilerek yok: o rota artık yalnızca /araclar’a kalıcı
  // yönlendirme. Korumalı sayılsaydı giriş ekranına emekli adresi taşırdık;
  // böylece "next" parametresi doğrudan gerçek hedefi gösteriyor.
  "/araclar",
  "/calisma-plani",
  "/ilerleme",
  "/krediler",
  "/limitler",
  "/siniflar",
  "/davet",
  "/paketler",
  "/pay",
  "/odemeler",
  "/bildirimler",
  "/profil",
  "/ayarlar",
  "/destek",
  "/admin",
  "/tasarim",
];

const ONBOARDING_SKIP = [
  "/onboarding",
  "/kayit",
  "/profil",
  "/ayarlar",
  "/destek",
  "/api",
  "/auth",
];

function matches(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "placeholder-key";

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const path = request.nextUrl.pathname;

  if (matches(path, RETIRED_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/ogretmen";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const barePath = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const alias = LEGACY_ALIASES[barePath];
  if (alias) {
    const url = request.nextUrl.clone();
    url.pathname = alias;
    return NextResponse.redirect(url);
  }

  if (
    path === "/onboarding/veli" ||
    path.startsWith("/onboarding/veli/") ||
    path === "/onboarding/ogretmen" ||
    path.startsWith("/onboarding/ogretmen/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = matches(path, PROTECTED_PREFIXES);

  // Hesap paylaşımı koruması (31 Ekim 2026): en çok 2 açık cihaz. Yalnız uygulama sayfaları (ve oturumsuzken ana
  // sayfa) sorulur; API, cron, auth dönüşü, pazarlama ve statik dosya sorulmaz. Ayrıntı: device-sessions.ts.
  let device: DeviceCookieUpdate = null;
  const withDevice = (response: NextResponse) => applyDeviceCookie(response, device, request);

  // Cihaz sınırıyla düşen oturumun getUser'ı "kullanıcı yok" der; çerezde o oturum varsa nedenini söyleriz.
  if (!user && (isProtected || path === "/")) {
    const gate = await checkSignedOutDevice(request);
    if (gate.revoked) return otherDeviceRedirect(request, supabaseResponse, isProtected);
    device = gate.cookie;
  }

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    // Kodlu bağlantı (/pay?kod=…) sosyal medyadan yeni öğrenciye gidiyor (20 Ekim 2026): "Tekrar hoş
    // geldin" diyen giriş yerine kayıt açılır; kayıttaki "Giriş yap" bağlantısı `next`i taşır.
    url.pathname = guestEntryPath(path, request.nextUrl.searchParams);
    // Sorgu `next`in içinde kalır: beta kodu bağlantısı (/pay?kod=…) girişten ve kayıttan
    // sonra kutusu dolu açılır (19 Ekim 2026). Sorgusuz yolda adres eskisi gibi.
    url.search = "";
    url.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return withDevice(NextResponse.redirect(url));
  }

  if (!user) return withDevice(supabaseResponse);

  const needsRole =
    isProtected || path === "/" || path === "/giris" || path === "/kayit";
  if (!needsRole) return supabaseResponse;

  // Durum iki okumada da gelmezse 503 yerine geçir (29 Ekim 2026): canlıda tek RPC hatası `_rsc`
  // isteğini düşürüp sayfayı boş bırakıyordu. Askı ve silinme `false` ile kesindir, aynen engellenir;
  // okunamayan durum sayfa kapısında (`requireUser`) ve RLS'te bir kez daha denetlenir.
  const active = await accountActiveOrUnknown(supabase);
  const accountCheckSkipped = active === null;
  if (accountCheckSkipped) {
    console.warn("account_status_unavailable", { path, rsc: request.nextUrl.searchParams.has("_rsc") });
  }
  const finish = (response: NextResponse) => {
    if (accountCheckSkipped) response.headers.set("x-account-check", "skipped");
    return withDevice(response);
  };
  if (active === false) {
    // Askıdaki hesap nedenini görsün (plan 4.1); silinmiş hesap eskisi gibi sessiz çıkar.
    let status: string | null = null;
    try {
      const { data } = await supabase.rpc("current_account_status");
      status = typeof data === "string" ? data : null;
    } catch {
      status = null;
    }
    await supabase.auth.signOut({ scope: "local" });
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.search = status === "suspended" ? "?durum=askida" : "";
    const response = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie);
    return response;
  }

  // Askı ve silinmeden sonra: kapalı hesabın cihazı sayılmaz. Sınırı aşan bir cihaz SQL'de düşer; bu tarayıcının
  // oturumu daha önce düşürüldüyse (auth.sessions silinemediyse) burada çıkış yapılır.
  if (isProtected) {
    const gate = await checkSignedInDevice({ request, auth: supabase.auth, userId: user.id });
    if (gate.revoked) {
      await supabase.auth.signOut({ scope: "local" });
      return otherDeviceRedirect(request, supabaseResponse, true);
    }
    device = gate.cookie;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("primary_role, onboarding_completed_at, deleted_at")
    .eq("id", user.id)
    .maybeSingle();

  // Profil okunamadıysa "profil yok" değildir: kuruluma göndermek yerine geçirilir (aynı gerekçe).
  if (profileError) {
    console.warn("profile_unavailable", { path });
    return finish(supabaseResponse);
  }

  if (profile?.deleted_at) {
    await supabase.auth.signOut({ scope: "local" });
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.search = "";
    const response = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie);
    return response;
  }

  const role = (profile?.primary_role as string | undefined) ?? "student";
  const home = homePathForRole(role);

  if (path === "/" || path === "/giris" || path === "/kayit") {
    const url = request.nextUrl.clone();
    url.pathname = home;
    url.search = "";
    return finish(NextResponse.redirect(url));
  }

  if (!profile?.onboarding_completed_at && !matches(path, ONBOARDING_SKIP)) {
    const url = request.nextUrl.clone();
    url.pathname = onboardingPathForRole(role);
    return finish(NextResponse.redirect(url));
  }

  return finish(supabaseResponse);
}
