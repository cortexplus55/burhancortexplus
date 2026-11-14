// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudentShellProvider } from "@/lib/student/student-shell-context";
import { EntitlementUiProvider } from "@/components/entitlements/entitlement-ui";
import { StudioGallery } from "@/components/parity/studio-gallery";
import type { StudentAccountContext } from "@/lib/student/account-context";

/*
  Faz 8 (`ui.v2.studyo`): stüdyo ekranları yeni görünümün sarmalayıcısıyla, kurallar yalnız CSS'te. /araclar'da
  Plus'a özel stüdyonun (podcast, sözlü, yazılı) kartı bayrak açıkken `<Gate>` içinde: ücretsiz hesapta basınca stüdyo
  sayfası yerine yükseltme penceresi açılır. Üretim, oynatma ve puanlama kodu aynen.
*/

vi.mock("next/navigation", () => ({
  usePathname: () => "/araclar",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
Element.prototype.scrollIntoView = vi.fn();
window.matchMedia = vi.fn().mockReturnValue({ matches: false });
afterEach(() => cleanup());

const read = (path: string) => readFileSync(path, "utf8");
const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

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
    resetsAtLabel: "",
    periodKind: "daily",
    usedPercent: 0,
    extraPercent: null,
    freeMeters: [],
    ...over,
  };
}

function gallery(acc: StudentAccountContext, gated: boolean) {
  return render(
    <StudentShellProvider account={acc}>
      <EntitlementUiProvider prices={{ plusMonthly: 59900, plusWeekly: 34900, sigmaMonthly: 199900 }} firstLesson="open" examDaysLeft={null}>
        <StudioGallery freeAccount={acc.showsUpgradeChrome} gated={gated} />
      </EntitlementUiProvider>
    </StudentShellProvider>,
  );
}

describe("/araclar stüdyo kartları", () => {
  it("bayrak açık + ücretsiz: podcast, sözlü, yazılı kilitli; basınca yükseltme penceresi, sayfaya gitmez", () => {
    const { container } = gallery(account(), true);
    for (const id of ["podcast", "sozlu", "yazili"]) {
      const card = container.querySelector(`[data-studio="${id}"]`)!;
      expect(card.getAttribute("data-gate"), id).toBe("locked");
      expect(card.getAttribute("aria-haspopup")).toBe("dialog");
      expect(card.textContent).toContain("PLUS");
    }
    // Ücretsizde de açık olanlar kapısız.
    for (const id of ["soru-coz", "anlat"]) {
      expect(container.querySelector(`[data-studio="${id}"]`)!.getAttribute("data-gate"), id).toBeNull();
    }
    const podcast = container.querySelector<HTMLAnchorElement>('[data-studio="podcast"]')!;
    const navigated = fireEvent.click(podcast);
    expect(navigated).toBe(false); // preventDefault: bağlantı izlenmez
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("bayrak açık + Plus: kart kilitsiz (sınırlı hak, işaret yok) ve bağlantı aynen", () => {
    const { container } = gallery(
      account({ audience: "plus", isPremium: true, showsUpgradeChrome: false, subscriptionBadge: "Plus", planSlug: "plus-aylik", quotaAllowance: 7200, quotaRemaining: 7000, periodKind: "monthly", freeMeters: undefined }),
      true,
    );
    const podcast = container.querySelector('[data-studio="podcast"]')!;
    expect(podcast.getAttribute("data-gate")).not.toBe("locked");
    expect(podcast.getAttribute("aria-haspopup")).toBeNull();
    expect(podcast.textContent).not.toContain("PLUS");
    expect(podcast.getAttribute("href")).toBe("/studio/podcast");
  });

  it("bayrak kapalı: bugünkü rozet ve bağlantı, kapı yok", () => {
    const { container } = gallery(account(), false);
    const podcast = container.querySelector('[data-studio="podcast"]')!;
    expect(podcast.getAttribute("data-gate")).toBeNull();
    expect(podcast.getAttribute("href")).toBe("/studio/podcast");
    expect(podcast.querySelector(".sg-plus")?.textContent).toContain("Plus");
  });
});

describe("sarmalayıcı ve kapsam", () => {
  it("sayfalar ui.v2.studyo okur; yoldaki podcast ve sözlü adımı da", () => {
    expect(read("src/app/araclar/page.tsx")).toContain('uiV2("studyo", user.id)');
    expect(read("src/app/studio/layout.tsx")).toContain('uiV2("studyo", user.id)');
    for (const route of ["video", "podcast", "sinav-sabahi"]) {
      expect(read(`src/app/deneme-sinavlari/[prepId]/${route}/layout.tsx`)).toContain('(await uiV2("studyo")) ? ["studyo"] : []');
    }
    const node = read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx");
    expect(node).toContain('new Set(["podcast", "oral"])');
    expect(node).toContain('uiV2("studyo", user.id)');
  });

  it("kurallar yalnız [data-ui~=studyo] altında; ham renk yok, odak halkası var, yazdırma kuralı yok", () => {
    const css = uncomment(read("src/styles/ui-v2-studyo.css"));
    for (const rule of css.match(/[^{}]+\{/g) ?? []) {
      const selector = rule.replace("{", "").trim();
      if (!selector || selector.startsWith("@")) continue;
      for (const part of selector.split(",")) expect(part.trim(), part).toMatch(/^\[data-ui~="studyo"\]/);
    }
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/@media print/);
    expect(css).not.toMatch(/outline:\s*none/);
    expect(css).toMatch(/:focus-visible[\s\S]*var\(--cx-focus\)/);
  });

  it("podcast şimdiki satır: renk + kalınlık + sol çizgi, 16 px; konuşmacı renkleri token", () => {
    const css = uncomment(read("src/styles/ui-v2-studyo.css"));
    expect(css).toMatch(/\.is-now \{[^}]*inset 3px 0 0[^}]*font-size: 16px;[^}]*font-weight: 600/);
    const tokens = read("src/styles/tokens.css");
    expect(tokens.match(/--cx-speaker-ada:/g)).toHaveLength(2);
    expect(tokens.match(/--cx-speaker-kerem:/g)).toHaveLength(2);
  });

  it("1 dk video: masaüstünde dikey çerçeve en çok 405 × 720, ortalı", () => {
    const css = uncomment(read("src/styles/ui-v2-studyo.css"));
    expect(css).toMatch(/min-width: 768px[\s\S]*\.cp-video-frame\.is-portrait \{[^}]*min\(100%, 405px\)[^}]*max-height: 720px/);
  });
});
