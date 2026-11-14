// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/*
  Faz 7 (giriş + kayıt, kurulum, /pay): yeni görünüm yalnız bayrak açıkken sarmalayıcının altında CSS ile gelir; kimlik
  doğrulama, yönlendirme, yükleme, oluşturma ve ödeme kodu aynen. Bu dosya: kapsam kuralları, sarmalayıcı, şifre
  göster / gizle, `?plan=` beyaz listesi ve tek brand düğme.
*/

let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signInWithPassword: vi.fn() } }) }));

import { UiScope } from "@/lib/ui-v2/scope";
import { PasswordToggle } from "@/components/auth/password-toggle";
import GirisPage from "@/app/giris/giris-inner";
import { SubscriptionCards, pickedPlanFrom } from "@/components/parity/subscription-cards";

afterEach(() => {
  cleanup();
  search = "";
});

const read = (path: string) => readFileSync(path, "utf8");
const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function selectors(css: string): string[] {
  const out: string[] = [];
  for (const rule of uncomment(css).match(/[^{}]+\{/g) ?? []) {
    const selector = rule.replace("{", "").trim();
    if (!selector || selector.startsWith("@")) continue;
    // Yalnız üst düzey virgüllerden böl (`:has(a, b)` içindeki virgül seçici ayırmaz).
    let depth = 0;
    let current = "";
    for (const char of selector) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === "," && depth === 0) {
        out.push(current.trim());
        current = "";
      } else current += char;
    }
    out.push(current.trim());
  }
  return out;
}

describe("kapsam: kurallar yalnız [data-ui~=anahtar] altında", () => {
  for (const [key, file, allowed] of [
    ["giris", "src/styles/ui-v2-giris.css", [".cx-pw", ".cx-pw-toggle"]],
    ["kurulum", "src/styles/ui-v2-kurulum.css", []],
    ["pay", "src/styles/ui-v2-pay.css", []],
  ] as const) {
    it(`${key}: seçiciler kapsamlı, ham renk yok, odak halkası var`, () => {
      const css = read(file);
      for (const part of selectors(css)) {
        if ((allowed as readonly string[]).includes(part)) continue;
        expect(part, part).toMatch(new RegExp(`^\\[data-ui~="${key}"\\]`));
      }
      expect(uncomment(css)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(css).not.toMatch(/outline:\s*none/);
      expect(css).not.toMatch(/backdrop-filter:\s*blur/);
      expect(css).toMatch(/:focus-visible[\s\S]*var\(--cx-focus\)/);
    });
  }

  it("kapsamsız iki kural görünüşü değiştirmez: kapsayıcı yalnız konum, düğme gizli", () => {
    const css = uncomment(read("src/styles/ui-v2-giris.css"));
    expect(css).toMatch(/\n\.cx-pw \{\s*position: relative;\s*\}/);
    expect(css).toMatch(/\n\.cx-pw-toggle \{\s*display: none;\s*\}/);
  });
});

describe("sayfalar bayrağı okur, kapalıyken sarmalayıcı yok", () => {
  it("giriş, kayıt ve şifre sıfırlama düzeni ui.v2.giris; kurulum ui.v2.kurulum; /pay ui.v2.pay", () => {
    for (const route of ["giris", "kayit", "sifremi-unuttum"]) {
      const layout = read(`src/app/${route}/layout.tsx`);
      expect(layout).toContain('uiV2("giris")');
      expect(layout).toContain('(await uiV2("giris")) ? ["giris"] : []');
      expect(layout).toContain('export const dynamic = "force-dynamic"');
    }
    expect(read("src/app/sifremi-unuttum/layout.tsx")).toContain('title: "Şifremi unuttum"');
    expect(read("src/app/deneme-sinavlari/olustur/page.tsx")).toContain('uiV2("kurulum", user.id)');
    expect(read("src/app/pay/page.tsx")).toContain('uiV2("pay", user.id)');
  });

  it("UiScope: anahtar yoksa çocuklar olduğu gibi, varsa display: contents sarmalayıcı", () => {
    const off = render(
      <UiScope keys={[]}>
        <p>içerik</p>
      </UiScope>,
    );
    expect(off.container.innerHTML).toBe("<p>içerik</p>");
    cleanup();
    const on = render(
      <UiScope keys={["giris"]}>
        <p>içerik</p>
      </UiScope>,
    );
    const scope = on.container.firstElementChild as HTMLElement;
    expect(scope.className).toBe("cx-ui-scope");
    expect(scope.getAttribute("data-ui")).toBe("giris");
    expect(scope.style.display).toBe("contents");
  });
});

describe("giriş: alanlar ve şifre göster / gizle", () => {
  it("autocomplete ve inputmode doğru, autocomplete=off yok", () => {
    render(<GirisPage />);
    const email = screen.getByLabelText("E-posta");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(email.getAttribute("inputmode")).toBe("email");
    expect(screen.getByLabelText("Şifre").getAttribute("autocomplete")).toBe("current-password");
    for (const file of ["src/app/giris/giris-inner.tsx", "src/app/kayit/signup-wizard.tsx", "src/app/sifremi-unuttum/page.tsx"]) {
      expect(read(file)).not.toMatch(/autoComplete="off"/);
    }
    expect(read("src/app/kayit/signup-wizard.tsx").match(/autoComplete="new-password"/g)).toHaveLength(2);
  });

  it("düğme alanın türünü değiştirir; ad ve basılı durumu söyler", () => {
    render(<GirisPage />);
    const field = screen.getByLabelText("Şifre");
    const toggle = screen.getByRole("button", { name: "Şifreyi göster" });
    expect(field.getAttribute("type")).toBe("password");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe("password");
    fireEvent.change(field, { target: { value: "Sifre1234!" } });
    fireEvent.click(toggle);
    expect(field.getAttribute("type")).toBe("text");
    expect((field as HTMLInputElement).value).toBe("Sifre1234!");
    const hide = screen.getByRole("button", { name: "Şifreyi gizle" });
    expect(hide.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(hide);
    expect(field.getAttribute("type")).toBe("password");
  });

  it("düğme formu göndermez (type=button)", () => {
    const onToggle = vi.fn();
    const submit = vi.fn((event: Event) => event.preventDefault());
    render(
      <form onSubmit={(event) => submit(event.nativeEvent)}>
        <PasswordToggle shown={false} onToggle={onToggle} controls="x" />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Şifreyi göster" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it("kayıtta iki şifre alanının ikisinde de düğme var", () => {
    const wizard = read("src/app/kayit/signup-wizard.tsx");
    expect(wizard).toContain('controls="password"');
    expect(wizard).toContain('controls="password2"');
    expect(wizard).toContain('type={showPassword ? "text" : "password"}');
    expect(wizard).toContain('type={showPassword2 ? "text" : "password"}');
  });
});

const PLANS = [
  { id: "plus-haftalik", name: "Sınav Haftası", description: null, price_try: 34900, credit_amount: 2700, is_premium: true, billing_period: "weekly", tier: "plus", period_days: 7 },
  { id: "plus-aylik", name: "Plus", description: null, price_try: 59900, credit_amount: 7200, is_premium: true, billing_period: "monthly", tier: "plus", period_days: 30 },
  { id: "sigma-aylik", name: "Sigma", description: null, price_try: 199900, credit_amount: 60000, is_premium: true, billing_period: "monthly", tier: "sigma", period_days: 30 },
];

function renderPay() {
  Element.prototype.scrollIntoView = vi.fn();
  return render(
    <div id="planlar">
      <SubscriptionCards plans={PLANS} embedded headingLevel="h1" checkoutEnabled />
    </div>,
  );
}

describe("/pay: ?plan= beyaz listesi ve işaretli kart", () => {
  it("yalnız plus, week, sigma; başka her şey (enjeksiyon dahil) yok sayılır", () => {
    expect(pickedPlanFrom("plus")).toBe("plus");
    expect(pickedPlanFrom("week")).toBe("week");
    expect(pickedPlanFrom("sigma")).toBe("sigma");
    for (const value of [null, undefined, "", "PLUS", "plus ", "kurucu", '"><script>alert(1)</script>', "sigma&from=x"]) {
      expect(pickedPlanFrom(value)).toBeNull();
    }
  });

  it("?plan=sigma Sigma kartını açar ve işaretler; sayfa karta kayar", () => {
    search = "plan=sigma&from=lesson.create";
    const { container } = renderPay();
    const picked = container.querySelectorAll("[data-cx-picked]");
    expect(picked).toHaveLength(1);
    expect(picked[0].getAttribute("data-cx-picked")).toBe("sigma");
    expect(picked[0].textContent).toContain("Sigma");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(container.textContent).not.toContain("lesson.create");
  });

  it("?plan=plus ve ?plan=week Plus kartını işaretler; geçersiz değerde işaret yok, Sigma kapalı", () => {
    search = "plan=week";
    expect(renderPay().container.querySelector("[data-cx-picked]")?.getAttribute("data-cx-picked")).toBe("week");
    cleanup();
    search = 'plan="><script>x</script>';
    const { container } = renderPay();
    expect(container.querySelector("[data-cx-picked]")).toBeNull();
    expect(container.innerHTML).not.toContain("<script>");
    expect(container.textContent).toContain("Diğer planlar · Sigma");
  });

  it("ana satın alma düğmeleri işaretli; brand kuralı tek düğmeye düşer", () => {
    search = "";
    const { container } = renderPay();
    const mains = [...container.querySelectorAll("[data-cx-main]")].map((node) => node.getAttribute("data-cx-main"));
    expect(mains).toEqual(expect.arrayContaining(["plus", "week"]));
    const css = uncomment(read("src/styles/ui-v2-pay.css"));
    expect(css).toContain('.cs-pay-card--recommended [data-cx-main="plus"]');
    expect(css).toMatch(/:has\(\[data-cx-picked="week"\], \[data-cx-picked="sigma"\]\)[^{]*\[data-cx-main="plus"\]/);
  });
});

describe("kurulum: yükleme yüzeyi ve haplar", () => {
  it("yükleme yüzeyi kenarsız bg-1 köşe 24; sürüklemede renk; haplar 40 / telefonda 44", () => {
    const css = uncomment(read("src/styles/ui-v2-kurulum.css"));
    expect(css).toMatch(/\.apw \.apw-drop \{[^}]*border: 0;[^}]*var\(--cx-radius-l\)[^}]*var\(--cx-bg-1\)/);
    expect(css).toMatch(/\.apw-drop--over \{[^}]*var\(--cx-brand-weak\)/);
    expect(css).toMatch(/\.apw-quick-btn \{[^}]*min-height: 40px/);
    expect(css).toMatch(/max-width: 767px[\s\S]*min-height: 44px/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*scale: 1/);
  });
});
