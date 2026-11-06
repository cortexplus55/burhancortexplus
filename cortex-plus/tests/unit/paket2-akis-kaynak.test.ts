/*
  Paket 2 akış bekçileri (6 Kasım 2026), kaynak düzeyinde:
  - `/dashboard` yalnız `/ogretmen`'e, `/paketler` yalnız `/pay`'e yönlenen eski rotalar. Uygulama içi bağlantı,
    yönlendirme ve `router.push` doğrudan hedefe gider (bir yönlendirme turu kazanılır; `/dashboard` sorguyu
    düşürdüğü için e-posta doğrulama notu ana sayfaya hiç ulaşmıyordu). Eski rotalar silinmez.
  - Genel başlık gösteren sayfaların kendi başlığı var.
  - "Belge yükle" rozeti yükleme formu olan yere gider.
  - Ortak `useDismiss` on bir pencerede kullanılır.
*/
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** Eski rotanın kendi sayfası ve yolu yalnız tanıyan listeler (korumalı yol, sekme eşleşmesi) hariç. */
const ALLOWED = new Set(
  [
    "src/app/dashboard/page.tsx",
    "src/app/paketler/page.tsx",
    "src/lib/supabase/middleware.ts",
  ].map((p) => path.join(ROOT, p)),
);

// Bağlantı hedefi olarak kullanılan biçimler: href="…", href: "…", push("…"), redirect("…"), `${origin}/…`.
const TARGET = /(href\s*[=:]\s*\{?\s*["'`]|push\(\s*["'`]|replace\(\s*["'`]|redirect\(\s*["'`]|fallback\s*=\s*["'`]|return\s+["'`]|\}\/)(\/(?:dashboard|paketler))(?=["'`?#/])/g;

describe("eski rota yönlendirme turları", () => {
  it("src içinde /dashboard ve /paketler bağlantı hedefi kalmadı", () => {
    const hits: string[] = [];
    for (const file of walk(path.join(ROOT, "src"))) {
      if (ALLOWED.has(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(TARGET)) {
        hits.push(`${path.relative(ROOT, file)}: ${match[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  // 6 Kasım 2026 (Paket 3): eski rotalar sayfa dosyası değil, `next.config.ts` kalıcı yönlendirmesi.
  it("eski rotalar yönlendirme olarak duruyor", () => {
    const config = read("next.config.ts");
    expect(config).toContain('{ source: "/dashboard", destination: "/ogretmen", permanent: true }');
    expect(config).toContain('{ source: "/paketler", destination: "/pay", permanent: true }');
    expect(existsSync(path.join(ROOT, "src/app/dashboard/page.tsx"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/app/paketler/page.tsx"))).toBe(false);
  });

  it("e-posta doğrulama dönüşü sorguyu taşıyan /ogretmen'e", () => {
    const route = read("src/app/api/auth/eposta-dogrula/route.ts");
    expect(route).toContain("/ogretmen?eposta=");
    expect(route).not.toContain("/dashboard");
  });

  it("test aracında 'Çalışmaya devam et' Araçlar'a", () => {
    const studio = read("src/components/learning/studio/quiz-studio.tsx");
    expect(studio).toMatch(/href="\/araclar"[\s\S]{0,400}Çalışmaya devam et/);
  });
});

describe("sayfa başlıkları", () => {
  const PAGES: [string, string][] = [
    ["src/app/sifremi-unuttum", "Şifremi unuttum"],
    ["src/app/sifre-yenile", "Yeni şifre belirle"],
    ["src/app/email-dogrula", "E-postanı doğrula"],
    ["src/app/onboarding", "Hesabını kur"],
    ["src/app/odeme/basarisiz", "Ödeme tamamlanamadı"],
    ["src/app/auth/auth-code-error", "Giriş bağlantısı açılamadı"],
  ];

  it.each(PAGES)("%s kendi başlığını verir", (dir, title) => {
    const page = read(`${dir}/page.tsx`);
    const layoutPath = `${dir}/layout.tsx`;
    const source = page.startsWith('"use client"')
      ? (expect(existsSync(path.join(ROOT, layoutPath))).toBe(true), read(layoutPath))
      : page;
    expect(source).toContain(`export const metadata = { title: "${title}" }`);
    // Suspense sınırı eklenmez (AGENTS.md).
    expect(existsSync(path.join(ROOT, `${dir}/loading.tsx`))).toBe(false);
    expect(source).not.toMatch(/Suspense/);
  });
});

describe("rozet ve soru çöz", () => {
  it("'Belge yükle' rozeti hazırlık kurulumuna gider (Belgelerim'de yükleme formu yok)", () => {
    const badges = read("src/lib/gamification/badges.ts");
    expect(badges).toContain('{ label: "Belge yükle", href: "/deneme-sinavlari/olustur" }');
  });

  it("/soru-coz başlığı bir kez (kabuğun h1'i), açıklama kalır", () => {
    const page = read("src/app/soru-coz/page.tsx");
    expect(page).toContain('<AppShell title="Soru çöz">');
    expect(page).not.toContain("<h1>Soru çöz</h1>");
    expect(page).toContain("Sorunun fotoğrafını çek ya da soruyu yaz.");
  });
});

describe("pencereler ortak kapanış kancasını kullanır", () => {
  const MODALS = [
    "src/components/parity/calendar-view.tsx",
    "src/components/parity/exam-prep.tsx",
    "src/components/parity/paper-exam-runner.tsx",
    "src/components/parity/exam-chat-menu.tsx",
    "src/components/parity/exam-node/chrome.tsx",
    "src/components/parity/free-activity-picker.tsx",
    "src/components/parity/oral-exam-flow.tsx",
    "src/components/parity/start-hub.tsx",
    "src/components/parity/study-tools-hub.tsx",
    "src/components/parity/subject-modal.tsx",
    "src/components/parity/upload-modal.tsx",
  ];
  it.each(MODALS)("%s", (file) => {
    const text = read(file);
    expect(text).toContain('import { useDismiss } from "@/lib/ui/use-dismiss";');
    expect(text).toMatch(/useDismiss\(/);
  });

  it("tanışma testinin model istekleri süre sınırıyla", () => {
    const intro = read("src/components/parity/exam-intro-quiz.tsx");
    expect(intro).toContain("INTRO_TIMEOUT_MS = 60_000");
    expect(intro.match(/signal: deadline\.signal/g)?.length).toBe(3);
  });
});
