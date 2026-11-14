// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { StudentAccountContext } from "@/lib/student/account-context";

/*
  Faz 2 (13 Kasım 2026, ürün sahibinin tasarım tahtası): "Daha fazla" → Kütüphane; emoji avatar yerine planlı
  halkalı profil kapsülü; kapsülün açtığı 480 px yan panel ve /profil aynı içerik; telefonda beş öğeli alt çubuk.
  Plan renk dışında da okunur (halka + köşe işareti + etiket); Sigma tonları hata kırmızısından ayrı.
*/

let pathname = "/ogretmen";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/parity/gamification", () => ({
  readStreakFromStorage: () => 0,
  GamificationGate: () => null,
}));
vi.mock("@/components/parity/parity-dialog-host", () => ({ ParityDialogHost: () => null, MenuDialogUrlSync: () => null }));
vi.mock("@/components/paywall/plus-limit-banner", () => ({ PlusLimitBanner: () => null }));
vi.mock("@/components/paywall/promo-banner", () => ({ PromoBanner: () => null }));
vi.mock("@/components/parity/exam-chat-menu", () => ({ ExamChatMenu: () => null }));
vi.mock("@/components/parity/journey-dialog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/parity/journey-dialog")>()),
  fetchJourney: () => Promise.resolve(null),
  JourneyDialog: ({ open, tab }: { open: boolean; tab: string }) => (open ? <div data-testid="journey">{tab}</div> : null),
}));

import { ParitySorShell } from "@/components/parity/sor-shell";
import { ProfileCard } from "@/components/parity/profile-identity";
import { isLibraryPath, isProfilePath, studentBottomTabs } from "@/components/parity/student-shell-nav";
import { planDaysLeft, planIdentity } from "@/lib/student/plan-identity";

const read = (path: string) => readFileSync(path, "utf8");

afterEach(() => {
  cleanup();
  pathname = "/ogretmen";
  vi.unstubAllGlobals();
});

function account(over: Partial<StudentAccountContext> = {}): StudentAccountContext {
  return {
    audience: "free",
    balance: 0,
    freeAllowanceRemaining: 0,
    isPremium: false,
    showsUpgradeChrome: true,
    subscriptionBadge: null,
    subscriptionAllowance: null,
    subscriptionPeriodEnd: null,
    canSpend: true,
    isAdmin: false,
    resetsAtLabel: "14 Kasım 2026 00:00",
    periodKind: "monthly",
    usedPercent: 0,
    extraPercent: null,
    ...over,
  } as StudentAccountContext;
}

const NOW = new Date("2026-11-13T12:00:00.000Z");

describe("plan kimliği", () => {
  it("beş plan: etiket, köşe işareti, görünüm ve planı söyleyen ad", () => {
    expect(planIdentity(account(), NOW)).toMatchObject({ kind: "free", look: "free", label: "Ücretsiz", mark: null, aria: "Profil, Ücretsiz plan" });
    expect(planIdentity(account({ isPremium: true, subscriptionBadge: "Plus", planSlug: "plus-aylik" }), NOW)).toMatchObject({
      kind: "plus", look: "plus", label: "Plus", mark: "+", aria: "Profil, Plus plan",
    });
    expect(
      planIdentity(
        account({ isPremium: true, subscriptionBadge: "Plus", planSlug: "plus-haftalik", subscriptionPeriodEnd: "2026-11-18T09:00:00.000Z" }),
        NOW,
      ),
    ).toMatchObject({ kind: "week", look: "plus", label: "Plus · 5 gün", mark: "+", daysLeft: 5, aria: "Profil, Plus, 5 gün kaldı" });
    expect(planIdentity(account({ isPremium: true, subscriptionBadge: "Sigma" }), NOW)).toMatchObject({
      kind: "sigma", look: "sigma", label: "Sigma", mark: "Σ",
    });
    // Kurucu Sigma görünümünde, etiketi KURUCU; önizlemedeki kurucu (isAdmin false) ücretsiz görünür.
    expect(planIdentity(account({ isAdmin: true, isPremium: true }), NOW)).toMatchObject({ kind: "founder", look: "sigma", label: "Kurucu", mark: "Σ" });
  });

  it("Sınav Haftası kalan günü ödeme kaydının dönem sonundan; okunamazsa düz Plus", () => {
    expect(planDaysLeft("2026-11-13T13:00:00.000Z", NOW)).toBe(1);
    expect(planDaysLeft("2026-11-12T13:00:00.000Z", NOW)).toBe(0);
    expect(planDaysLeft(null, NOW)).toBeNull();
    expect(planIdentity(account({ isPremium: true, subscriptionBadge: "Plus", planSlug: "plus-haftalik" }), NOW).kind).toBe("plus");
  });
});

describe("gezinme", () => {
  it("Kütüphane dört sayfa; profil sayfaları telefonda Profil sekmesini etkin yapar", () => {
    for (const path of ["/dokumanlar", "/yanlislarim/tur", "/siniflar", "/sohbetler"]) expect(isLibraryPath(path)).toBe(true);
    for (const path of ["/ilerleme", "/takvimim", "/krediler", "/davet", "/ogretmen"]) expect(isLibraryPath(path)).toBe(false);
    for (const path of ["/profil", "/ayarlar", "/krediler", "/ilerleme", "/takvimim", "/davet", "/yardim", "/mobil-uygulama", "/odemeler"]) {
      expect(isProfilePath(path)).toBe(true);
    }
    const profile = studentBottomTabs.find((tab) => tab.id === "profile");
    expect(profile?.match("/davet")).toBe(true);
    expect(profile?.match("/dokumanlar")).toBe(false);
  });
});

describe("kabuk", () => {
  it("emoji avatar yok; kapsül planı söyler, panel açılır, Esc kapatır ve odak kapsüle döner", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))));
    const { container } = render(
      <ParitySorShell userInitial="ö" userName="Öğrenci" avatarEmoji="⭐" streak={3} account={account({ isPremium: true, subscriptionBadge: "Sigma" })}>
        <div>ana</div>
      </ParitySorShell>,
    );
    expect(container.textContent).not.toContain("⭐");
    expect(container.querySelector(".cx-home-avatar")).toBeNull();
    const capsule = screen.getByRole("button", { name: "Profil, Sigma plan" });
    expect(capsule.className).toContain("cx-capsule--sigma");
    expect(capsule.textContent).toContain("Öğrenci");
    expect(capsule.querySelector(".cx-pring-mark")?.textContent).toBe("Σ");
    // Baş harf Türkçe büyük harf.
    expect(capsule.querySelector(".cx-pring i")?.textContent).toBe("Ö");

    capsule.focus();
    fireEvent.click(capsule);
    const panel = screen.getByRole("dialog", { name: "Öğrenci" });
    expect(panel.className).toContain("cx-pp-panel");
    expect(capsule.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Kapat");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Öğrenci" })).toBeNull();
    expect(document.activeElement).toBe(capsule);
  });

  it("Kütüphane: dört satır, Çıkış yap ve eski satırlar yok; yönetim satırı emojisiz simgeli", () => {
    const { container } = render(
      <ParitySorShell userInitial="K" userName="Kurucu" streak={0} account={account({ isAdmin: true, adminPanel: true })}>
        <div>ana</div>
      </ParitySorShell>,
    );
    const trigger = container.querySelector<HTMLButtonElement>("button.cx-home-more");
    expect(trigger?.getAttribute("aria-label")).toBe("Kütüphane");
    fireEvent.click(trigger!);
    const dialog = screen.getByRole("dialog", { name: "Kütüphane" });
    const rows = [...dialog.querySelectorAll(".cx-lib-row")].map((row) => row.textContent?.trim());
    expect(rows).toEqual(["Belgelerim", "Yanlışlarım", "Çalışma grupları", "Geçmiş konuşmalar", "Yönetim Paneli"]);
    for (const gone of ["Çıkış yap", "İlerleme", "Takvimim", "Kullanım limitleri", "Davet et", "Yıldızlar", "🛡️"]) {
      expect(dialog.textContent).not.toContain(gone);
    }
    expect(dialog.querySelector('[data-testid="admin-panel-link"] svg')).not.toBeNull();
  });

  it("telefon alt çubuğu beş öğe; Kütüphane sayfasında Kütüphane etkin, Profil planlı halkayla", () => {
    pathname = "/dokumanlar";
    const { container } = render(
      <ParitySorShell userInitial="A" userName="Ali" streak={0} account={account({ isPremium: true, subscriptionBadge: "Plus", planSlug: "plus-aylik" })}>
        <div>ana</div>
      </ParitySorShell>,
    );
    const items = [...container.querySelectorAll(".cp-sor-bottomnav .cp-sor-bottomnav-link")];
    expect(items.map((el) => el.querySelector(":scope > span:last-child")?.textContent)).toEqual(["Ana Sayfa", "Sınavlar", "Stüdyo", "Kütüphane", "Profil"]);
    expect(items[3].className).toContain("cp-sor-bottomnav-link--active");
    expect(items[0].className).not.toContain("--active");
    expect(items[4].getAttribute("aria-label")).toBe("Profil, Plus plan");
    expect(items[4].querySelector(".cx-pring--s.cx-pring--plus")).not.toBeNull();
    expect(container.querySelector(".cx-home-more")?.className).toContain("is-active");
  });

  it("panelin 'Mevcut seri'si kabuğun seri penceresini açar", () => {
    render(
      <ParitySorShell userInitial="A" userName="Ali" streak={0} account={account()}>
        <ProfileCard
          name="Ali"
          initial="A"
          identity={planIdentity(account(), NOW)}
          data={{ dashboard: null, stars: 12 }}
          heading="h1"
        />
      </ParitySorShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Mevcut seri/ }));
    expect(screen.getByTestId("journey").textContent).toBe("streak");
  });
});

describe("profil içeriği", () => {
  it("sıra: halka, ad, plan; seri ve Yıldızlar; İlerleme ve Takvimim; plan şeridi; altı satır; Çıkış yap", () => {
    const { container } = render(
      <ProfileCard
        name="Ali"
        initial="A"
        identity={planIdentity(account(), NOW)}
        data={{
          dashboard: {
            fullName: "Ali", avatarEmoji: null, schoolName: "Atatürk Lisesi", gradeLevel: "11. sınıf",
            currentStreak: 4, longestStreak: 9, upcomingEvents: 2, week: [],
          } as never,
          stars: 37,
        }}
        heading="h1"
      />,
    );
    expect(container.querySelector("h1")?.textContent).toBe("Ali");
    expect(container.querySelector(".cx-pp-meta")?.textContent).toBe("Atatürk Lisesi · 11. sınıf");
    expect(container.querySelector(".cx-pp-chip")?.textContent).toBe("Ücretsiz");
    expect(container.textContent).toContain("En uzun 9");
    expect(container.querySelector(".cx-pp-count")?.textContent).toBe("2");
    expect([...container.querySelectorAll(".cx-pp-list .cx-pp-row")].map((row) => row.textContent)).toEqual([
      "Ayarlar", "Kullanım limitleri", "Abonelik", "Davet et", "Yardım ve destek", "Telefondan kullan",
    ]);
    expect(container.querySelector(".cx-pp-gold")?.getAttribute("href")).toBe("/pay");
    expect(container.querySelector(".cx-pp-signout button")?.textContent).toBe("Çıkış yap");
  });

  it("Plus'ta Abonelik ödemelere, şerit dönem sonunu söyler; kurucuda kırmızı tonlu çip", async () => {
    const plus = render(
      <ProfileCard name="Ali" initial="A" identity={planIdentity(account({ isPremium: true, subscriptionBadge: "Plus" }), NOW)} data={null} periodEndLabel="13 Ara 2026" />,
    );
    expect(plus.container.querySelector('a[href="/odemeler"]')?.textContent).toBe("Abonelik");
    expect(plus.container.textContent).toContain("Plus · 13 Ara 2026 bitiyor");
    plus.unmount();
    const founder = render(<ProfileCard name="K" initial="K" identity={planIdentity(account({ isAdmin: true }), NOW)} data={null} />);
    await act(async () => {});
    expect(founder.container.querySelector(".cx-pp-strip--sigma .cx-pp-founder")).not.toBeNull();
    expect(founder.container.textContent).toContain("Sınırsız · işlemler hakkından düşmez");
    // Silinen eski panel testinin güvenceleri (14 Kasım 2026): kurucu çipi kredi sayfasının kurucu görünümünü açar,
    // Sigma görünümünde (Σ, altın taç değil); kurucuda satın alma yok; tema seçimi profilde değil.
    const chip = founder.container.querySelector(".cx-pp-founder");
    expect(chip?.getAttribute("href")).toBe("/krediler");
    expect(chip?.querySelector(".cp-founder-chip__mark")?.textContent?.trim()).toBe("Σ");
    expect(founder.container.querySelector(".cx-pp-gold")).toBeNull();
    expect(founder.container.querySelector('[role="radiogroup"]')).toBeNull();
  });
});

describe("kaynak sözleşmesi", () => {
  it("Sigma tonları hata kırmızısını kullanmaz; hareket azaltmada kapsül büyümez, panel kaymaz", () => {
    const css = read("src/styles/cx-profile.css");
    expect(css).not.toContain("var(--cx-danger");
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.cx-capsule:hover \{\s*scale: none;/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.cx-pp-panel \{\s*animation: none;/);
    expect(css).toMatch(/\.cx-pp-panel \{[^}]*width: min\(480px, calc\(100vw - 16px\)\);/);
  });

  it("/profil kartla, panel yalnız okuyan uçla; /yardim ve /mobil-uygulama öğrenciye uygulama kabuğu", () => {
    const profil = read("src/app/profil/page.tsx");
    expect(profil).toContain("<ProfileCard");
    expect(profil).not.toContain("ReferralRewardCard");
    const route = read("src/app/api/student/profile-panel/route.ts");
    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    for (const page of ["src/app/yardim/page.tsx", "src/app/mobil-uygulama/page.tsx"]) {
      const source = read(page);
      expect(source).toContain("loadOptionalStudentShell()");
      expect(source).toContain("<ParitySorShell {...shell}>");
      expect(source).toContain("<MarketingPage");
    }
  });
});

describe("kapsüldeki ad", () => {
  it("kabuğu kendisi kuran sayfalar da adı verir (canlıda ana ekranda 'Öğrenci' yazıyordu, 13 Kasım 2026)", async () => {
    const { parityShellName } = await import("@/components/parity/app-utils");
    expect(parityShellName("burhan önder", "x@ornek.com")).toBe("Burhan");
    expect(parityShellName(null, "kullanici@ornek.com")).toBe("kullanici");
    expect(parityShellName("", null)).toBe("Öğrenci");
    // Panel ve /profil tam adı her sözcüğün baş harfi büyük gösterir (canlıda "burhan" yazıyordu).
    const { parityFullName } = await import("@/components/parity/app-utils");
    expect(parityFullName("burhan önder", null)).toBe("Burhan Önder");
    expect(parityFullName("  ilkay   ışık ", null)).toBe("İlkay Işık");
    expect(parityFullName(null, "kullanici@ornek.com")).toBe("kullanici");
    // Kütüphane'de parçalar küçülmez (kısa pencerede son satır kırpılıyordu).
    expect(read("src/styles/cx-shell.css")).toMatch(/\.cx-lib-panel > \* \{\s*flex-shrink: 0;/);
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : /\.tsx$/.test(name) ? [path] : [];
      });
    const missing = walk("src/app")
      .filter((path) => !path.includes(`${join("src", "app", "e2e")}`))
      .filter((path) => read(path).includes("<ParitySorShell"))
      .filter((path) => !/\{\.\.\.shell\}|userName=/.test(read(path)));
    expect(missing).toEqual([]);
  });
});

describe("Prompt 1 kararları (14 Kasım 2026)", () => {
  it("Kurucu her yerde Sigma görünümünde: çip, rozet ve kredi kartında altın ve taç yok", () => {
    const founderCss = read("src/styles/founder.css");
    expect(founderCss).not.toMatch(/--cp-gold|pm-glow-amber|244, 174, 11|#f4ae0b/i);
    expect(founderCss).toMatch(/\.cp-founder-chip \{[^}]*background: var\(--cx-plan-sigma-chip-bg\);/);
    expect(founderCss).toMatch(/\.cp-founder-card__badge \{[^}]*var\(--cx-plan-sigma-ring\)/);
    for (const file of ["src/components/student/founder-chip.tsx", "src/components/student/founder-credits-view.tsx"]) {
      expect(read(file)).not.toContain("Crown");
      expect(read(file)).toContain("Σ");
    }
    // Plan tonları tek kaynakta (tokens.css), koyu ve açık temada.
    const tokens = read("src/styles/tokens.css");
    expect(tokens.match(/--cx-plan-sigma-chip-bg:/g)?.length).toBe(2);
    expect(read("src/styles/cx-profile.css")).not.toMatch(/--cx-plan-[a-z-]+:/);
  });

  it("eski profil paneli ve avatar seçici yok; avatar alanı ve API'si yerinde", () => {
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    expect(existsSync("src/components/parity/profile-panel.tsx")).toBe(false);
    expect(existsSync("src/components/parity/avatar-picker.tsx")).toBe(false);
    expect(read("src/components/parity/profile-dialog.tsx")).not.toMatch(/AvatarPicker|avatarEmoji|cp-settings-avatar/);
    expect(read("src/app/api/profile/me/route.ts")).toContain("avatar_url");
  });
});
