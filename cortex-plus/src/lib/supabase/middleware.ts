import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { homePathForRole } from "@/lib/parity/signup";
import { onboardingPathForRole } from "@/lib/auth/onboarding-path";
import { isAccountActive } from "@/lib/auth/active-account";

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
};

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

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (!user) return supabaseResponse;

  const needsRole =
    isProtected || path === "/" || path === "/giris" || path === "/kayit";
  if (!needsRole) return supabaseResponse;

  let active: boolean;
  try {
    active = await isAccountActive(supabase);
  } catch {
    return new NextResponse("Hesabına şu an erişilemiyor. Lütfen biraz sonra yeniden dene.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30", "Cache-Control": "no-store" },
    });
  }
  if (!active) {
    await supabase.auth.signOut({ scope: "local" });
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.search = "";
    const response = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie);
    return response;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("primary_role, onboarding_completed_at, deleted_at")
    .eq("id", user.id)
    .maybeSingle();

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
    return NextResponse.redirect(url);
  }

  if (!profile?.onboarding_completed_at && !matches(path, ONBOARDING_SKIP)) {
    const url = request.nextUrl.clone();
    url.pathname = onboardingPathForRole(role);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
