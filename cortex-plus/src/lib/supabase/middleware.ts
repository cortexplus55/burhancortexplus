import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { homePathForRole } from "@/lib/parity/signup";
import { onboardingPathForRole } from "@/lib/auth/onboarding-path";

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
  "/deneme-sinavlari",
  "/uygulamalar",
  "/calisma-plani",
  "/ilerleme",
  "/krediler",
  "/paketler",
  "/odemeler",
  "/bildirimler",
  "/profil",
  "/ayarlar",
  "/destek",
  "/veli",
  "/ogretmen-paneli",
  "/sinifim",
  "/odevlerim",
  "/admin",
];

/** Yalnızca öğrenci (veya admin) girebilir; veli ve okul öğretmeni yönlendirilir. */
const STUDENT_ONLY_PREFIXES = [
  "/ogretmen",
  "/dashboard",
  "/sohbetler",
  "/dokumanlar",
  "/soru-coz",
  "/quizler",
  "/flashcardlar",
  "/deneme-sinavlari",
  "/uygulamalar",
  "/calisma-plani",
  "/ilerleme",
  "/krediler",
  "/paketler",
  "/sinifim",
  "/odevlerim",
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

/** Bağlantısız veli yalnızca bu yollarda kalabilir. */
const PARENT_UNLINKED_ALLOWED = [
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
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

  let parentNeedsLink = false;
  if (role === "parent") {
    const { count } = await supabase
      .from("parent_student_links")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", user.id)
      .in("status", ["pending", "active"]);
    parentNeedsLink = !count;
  }

  const parentHome = parentNeedsLink ? "/onboarding/veli" : home;

  if (path === "/" || path === "/giris" || path === "/kayit") {
    const url = request.nextUrl.clone();
    url.pathname = parentHome;
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!profile?.onboarding_completed_at && !matches(path, ONBOARDING_SKIP)) {
    const url = request.nextUrl.clone();
    url.pathname = onboardingPathForRole(role);
    return NextResponse.redirect(url);
  }

  if (
    parentNeedsLink &&
    !matches(path, PARENT_UNLINKED_ALLOWED)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding/veli";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (role !== "admin") {
    if (role === "parent" && matches(path, STUDENT_ONLY_PREFIXES)) {
      const url = request.nextUrl.clone();
      url.pathname = "/veli";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (
      (role === "teacher" || role === "verified_teacher") &&
      matches(path, STUDENT_ONLY_PREFIXES)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/ogretmen-paneli";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (role !== "parent" && matches(path, ["/veli"])) {
      const url = request.nextUrl.clone();
      url.pathname = home;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
