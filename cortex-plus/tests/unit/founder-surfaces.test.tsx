// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { StudentAccountContext } from "@/lib/student/account-context";
import { StudentShellProvider } from "@/lib/student/student-shell-context";
import { CreditGate } from "@/components/paywall/credit-gate";
import { CreditLimitToast } from "@/components/paywall/credit-limit-toast";
import { PlusLimitBanner } from "@/components/paywall/plus-limit-banner";
import { PromoBanner } from "@/components/paywall/promo-banner";
import { UpgradeAside } from "@/components/paywall/upgrade-aside";
import { UpgradeSheet } from "@/components/paywall/upgrade-sheet";
import { StudentAccountStrip } from "@/components/student/student-account-strip";
import { FounderBadge, FounderChip } from "@/components/student/founder-chip";
import { FounderCreditsView } from "@/components/student/founder-credits-view";
import { OralTeacherCustomize } from "@/components/parity/oral-exam-flow";
import { GeneratorForm } from "@/components/learning/generator-form";
import { ImageSolver } from "@/components/learning/image-solver";
import { FOUNDER_CREDIT_LABEL } from "@/lib/credits/chip-label";

vi.mock("next/navigation", () => ({
  usePathname: () => "/krediler",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
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
    canSpend: false,
    isAdmin: false,
    resetsAtLabel: "26 Eylül 2026 03:00",
    periodKind: "daily",
    ...over,
  };
}

const founder = account({ isAdmin: true, canSpend: true, showsUpgradeChrome: false });
const student = account();
const plusStudent = account({ audience: "plus", isPremium: true, showsUpgradeChrome: false, subscriptionBadge: "Plus", periodKind: "monthly" });

function inShell(acc: StudentAccountContext, node: ReactNode) {
  return render(<StudentShellProvider account={acc}>{node}</StudentShellProvider>);
}

const future = new Date(Date.now() + 5 * 86400_000).toISOString();
const noop = () => {};

const paywalls: [string, () => ReactNode][] = [
  ["CreditGate (ücretsiz)", () => <CreditGate open onOpenChange={noop} message="Hakkın doldu." isPremium={false} />],
  ["CreditGate (Plus)", () => <CreditGate open onOpenChange={noop} message="Hakkın doldu." isPremium />],
  ["UpgradeSheet", () => <UpgradeSheet open onOpenChange={noop} message="Hakkın doldu." />],
  ["UpgradeAside", () => <UpgradeAside returnPath="/ogretmen" />],
  ["PlusLimitBanner", () => <PlusLimitBanner onDismiss={noop} />],
  ["CreditLimitToast", () => <CreditLimitToast open onOpenChange={noop} message="Hakkın doldu." />],
  ["PromoBanner", () => <PromoBanner campaign={{ title: "Kampanya", description: "İndirim var.", href: "/pay", endsAt: future }} />],
];

describe("satın alma yüzeyleri kurucuda hiç render edilmez", () => {
  for (const [name, make] of paywalls) {
    it(`${name}: kurucuda DOM boş`, () => {
      const { container } = inShell(founder, make());
      expect(container.innerHTML).toBe("");
    });

    it(`${name}: normal kullanıcıda eskisi gibi görünür`, () => {
      const acc = name.includes("Plus") || name.includes("Limit") || name.includes("Toast") ? plusStudent : student;
      const { container } = inShell(acc, make());
      expect(container.innerHTML).not.toBe("");
    });
  }

  it("tarayıcıda yazılan bayraklar ayrıcalık vermez", () => {
    window.localStorage.setItem("isAdmin", "true");
    window.localStorage.setItem("cortex-role", "admin");
    document.cookie = "isAdmin=true";
    const { container } = inShell(student, <UpgradeSheet open onOpenChange={noop} message="Hakkın doldu." />);
    expect(container.textContent).toContain("Plus'a yükselt");
  });

  it("kabuk bağlamı yoksa (misafir sayfası) kurucu sayılmaz", () => {
    const { container } = render(<UpgradeAside />);
    expect(container.textContent).toContain("Plus'a geç");
  });
});

describe("hesap şeridi", () => {
  it("kurucuda çip ve not var; bakiye, paket ve maliyet yok", () => {
    const { container } = render(<StudentAccountStrip account={founder} creditHint="Quiz üretimi: 2 kredi." />);
    const text = container.textContent ?? "";
    expect(text).toContain(FOUNDER_CREDIT_LABEL);
    expect(text).toContain("Kurucu hesabı: işlemler kredinden düşmez.");
    expect(text).not.toMatch(/Ek paket|Kullanımını artır|kredi harcar|2 kredi|ücretsiz hak/);
    expect(container.querySelector("a[href='/paketler']")).toBeNull();
  });

  it("normal kullanıcıda bakiye ve paket bağlantısı değişmedi", () => {
    const { container } = render(<StudentAccountStrip account={student} creditHint="Quiz üretimi: 2 kredi." />);
    const text = container.textContent ?? "";
    expect(text).toContain("0 kredi · 0 ücretsiz hak");
    expect(text).toContain("Quiz üretimi: 2 kredi.");
    expect(container.querySelector("a[href='/paketler']")).not.toBeNull();
  });
});

describe("kurucu çipi", () => {
  it("kredi sayfasına gider, ekran okuyucu etiketi ve ipucu taşır", () => {
    const { container } = render(<FounderChip />);
    const link = container.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/krediler");
    expect(link.getAttribute("aria-label")).toBe("Kurucu hesabı, kredi sınırı yok");
    expect(link.getAttribute("data-tip")).toBe("Bu hesapta hiçbir işlem kredi düşürmez.");
    expect(link.querySelector(".cp-founder-chip__full")?.textContent).toBe("Kurucu · Sınırsız");
    expect(link.querySelector(".cp-founder-chip__short")?.textContent).toBe("Sınırsız");
    expect(link.querySelector("svg")).not.toBeNull();
  });

  it("ayarlar rozeti bağlantı değil", () => {
    const { container } = render(<FounderBadge />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("Kurucu");
  });
});

describe("sözlü kurulum notu", () => {
  const customize = () => (
    <OralTeacherCustomize moodId="helpful" onMood={noop} onBack={noop} onClose={noop} onStart={noop} />
  );

  it("kurucuda kredinin düşmediğini söyler", () => {
    const { container } = inShell(founder, customize());
    expect(container.textContent).toContain("Kurucu hesabı: bu oturum kredinden düşmez.");
    expect(container.textContent).not.toContain("çalışma hakkını kullanır");
  });

  it("normal kullanıcıda not aynı", () => {
    const { container } = inShell(student, customize());
    expect(container.textContent).toContain("Sesli oturum mevcut çalışma hakkını kullanır");
  });
});

describe("maliyet etiketleri kurucuda görünmez", () => {
  const form = () => (
    <GeneratorForm
      endpoint="/api/test"
      fieldLabel="Konu"
      placeholder="Konu"
      submitLabel="Üret"
      creditCost={2}
      returnPath="/quizler"
      buildBody={(value) => ({ value })}
    />
  );

  it("üretim formu", () => {
    expect(inShell(founder, form()).container.textContent).not.toContain("kredi kullanır");
    cleanup();
    expect(inShell(student, form()).container.textContent).toContain("Bu işlem 2 kredi kullanır.");
  });

  it("fotoğraftan çözüm düğmesi", () => {
    const founderButton = inShell(founder, <ImageSolver creditCost={5} />).container.querySelector("button[type='submit']");
    expect(founderButton?.textContent).toBe("Çöz");
    cleanup();
    const studentButton = inShell(student, <ImageSolver creditCost={5} />).container.querySelector("button[type='submit']");
    expect(studentButton?.textContent).toBe("Çöz · 5 kredi");
  });
});

describe("kredi sayfası — kurucu görünümü", () => {
  const rows = [
    { id: "a", action_code: "QUIZ_GENERATE", metadata: { admin_bypass: true, nominal_cost: 2 }, created_at: "2026-09-25T20:14:00Z" },
    { id: "b", action_code: "STUDY_PLAN_GENERATE", metadata: { admin_bypass: true, nominal_cost: 4 }, created_at: "2026-09-25T19:00:00Z" },
  ];

  it("istatistikleri, tabloyu ve mobil kart listesini çizer; satış yok", () => {
    const { container } = render(
      <FounderCreditsView failed={false} summary={{ nominalTotal: 46, count: 23, topAction: "Quiz" }} recent={rows} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Kurucu hesabı");
    expect(text).toContain("46 kredi");
    expect(text).toContain("23");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(container.querySelectorAll(".cp-founder-cards li")).toHaveLength(2);
    expect(container.querySelector("tbody tr td")?.textContent).toBe("25 Eyl 23:14");
    expect([...container.querySelectorAll("tbody .cp-founder-zero")].map((c) => c.textContent)).toEqual(["0", "0"]);
    expect(text).not.toMatch(/Plus'a geç|Ek paket|Satın al|Kullanımını artır/);
  });

  it("boş durum", () => {
    const { container } = render(
      <FounderCreditsView failed={false} summary={{ nominalTotal: 0, count: 0, topAction: null }} recent={[]} />,
    );
    expect(container.textContent).toContain("Henüz işlem yok. Bir ders ya da quiz oluşturduğunda burada görünecek.");
    expect(container.querySelector("table")).toBeNull();
  });

  it("hata durumunda yeniden deneme sayfayı yeniler", () => {
    const { container } = render(<FounderCreditsView failed summary={null} recent={[]} />);
    expect(container.textContent).toContain("Kayıtlar şu anda yüklenemedi.");
    const retry = container.querySelector("a");
    expect(retry?.textContent).toBe("Yeniden dene");
    expect(retry?.getAttribute("href")).toBe("/krediler");
    expect(container.querySelector("[role='alert']")).not.toBeNull();
  });
});
