import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { homePathForRole } from "@/lib/parity/signup";
import { onboardingPathForRole } from "@/lib/auth/onboarding-path";

/** Legacy veli/öğretmen URL’leri — öğrenci-only ürün. */
const RETIRED_PREFIXES = [
  "/veli",
  "/ogretmen-paneli",
  "/sinifim",
  "/odevlerim",
  "/ogretmenler-ve-profesorler-icin",
];

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
  "/uygulamalar",
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("primary_role, onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

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
