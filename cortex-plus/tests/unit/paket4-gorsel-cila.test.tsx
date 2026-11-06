// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ExternalAnchor, NEW_TAB_NOTE } from "@/components/ui/external-anchor";
import { OfficialLinks } from "@/components/curriculum/official-links";
import { OWN_DOCUMENT_NOTE } from "@/lib/billing/own-document-copy";
import { FREE_PAGE_TOTAL } from "@/lib/billing/free-tier-copy";
import { documentPagesFor } from "@/lib/billing/plan-value";
import { PLAN_ALLOWANCES } from "@/lib/credits/price-table";
import { supplementScreens } from "@/lib/content-pool/supplement";
import { lessonStepCounter } from "@/lib/learning/activity-duration";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

const read = (path: string) => readFileSync(path, "utf8");

afterEach(cleanup);

describe("Paket 4 #1 — video başlık şeridi", () => {
  const css = read("src/styles/video-lesson.css");

  it("başlık ve alt başlık koyu yarı saydam cam şeritte, tokenlarla", () => {
    expect(css).toMatch(/\.cp-video-frame \{[^}]*--cp-video-scrim: rgba\(9, 13, 22, 0\.78\)/);
    const heading = css.match(/\.cp-video-heading \{([^}]*)\}/)?.[1] ?? "";
    expect(heading).toContain("background: var(--cp-video-scrim)");
    expect(heading).toContain("-webkit-backdrop-filter: blur(var(--cp-video-scrim-blur))");
    expect(heading).toContain("backdrop-filter: blur(var(--cp-video-scrim-blur))");
    expect(heading).toContain("text-shadow: var(--cp-video-text-shadow)");
    // Bulanıklık yoksa daha koyu düz zemin.
    expect(css).toMatch(/@supports not[^{]*backdrop-filter[^{]*\{\s*\.cp-video-heading \{\s*background: var\(--cp-video-scrim-solid\)/);
  });

  it("şerit üst çubuğun içinde: --cp-top-h ölçümü onu sayar; kilit bilgi ölçülen çubuğun altında", () => {
    const player = read("src/components/parity/video-lesson.tsx");
    expect(player).toMatch(/<div ref=\{topBar\} className="cp-video-top">\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<div className="cp-video-heading">/);
    expect(player).toContain('box.style.setProperty("--cp-top-h"');
    expect(css).toContain("top: max(22%, calc(var(--cp-top-h, 7.2rem) + 0.4rem));");
    // Çizimli sahnenin ve yatay düzenin ölçü kuralları yerinde.
    expect(css).toMatch(/\.cp-video-board-body \{[\s\S]*padding: calc\(var\(--cp-top-h, 7\.2rem\) \+ 0\.35rem\)/);
    expect(css).toMatch(/\.cp-video-frame\.is-landscape \.cp-video-board-body \{[\s\S]*padding: calc\(var\(--cp-top-h, 6\.4rem\) \+ 0\.35rem\)/);
  });
});

describe("Paket 4 #2 — kredi sayısı yok, bağlantı Türkçe", () => {
  it("kendi belgen notu kredi yazmaz; sayılar tek kaynaktan", () => {
    expect(OWN_DOCUMENT_NOTE).not.toMatch(/kredi/i);
    expect(OWN_DOCUMENT_NOTE).toContain(`toplam ${FREE_PAGE_TOTAL.toLocaleString("tr-TR")} sayfa`);
    expect(OWN_DOCUMENT_NOTE).toContain(`ayda ${documentPagesFor(PLAN_ALLOWANCES.plusMonthly).pages.toLocaleString("tr-TR")} sayfaya`);
  });

  it("resmî kurulum ekranı kredi tablosunu okumaz ve ekranda 'kredi' sayısı yazmaz", () => {
    const flow = read("src/components/parity/official-setup-flow.tsx");
    expect(flow).not.toContain("CREDIT_PRICE_TABLE");
    expect(flow).not.toMatch(/\d+\s*kredi|\}\s*kredi/);
    expect(flow).toContain("{OWN_DOCUMENT_NOTE}");
  });

  it("belgenden ek yetmediğinde öğrenciye bedel yazılmaz", () => {
    const [screen0] = supplementScreens({ state: "insufficient_credits", cost: 15 } as never, 4);
    expect(JSON.stringify(screen0)).not.toMatch(/kredi|\b15\b/);
  });

  it("yeni sekme bağlantısı Türkçe ekran okuyucu notu taşır, simge ad almaz", () => {
    render(
      <ExternalAnchor href="https://ornek.gov.tr/kilavuz.pdf" icon>
        Resmî kılavuz
      </ExternalAnchor>,
    );
    const link = screen.getByRole("link", { name: `Resmî kılavuz ${NEW_TAB_NOTE}` });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).not.toMatch(/\bOpen\b/);
    const svg = link.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(link.querySelector(".sr-only")?.textContent?.trim()).toBe(NEW_TAB_NOTE);
  });

  it("resmî kaynak listesi aynı bileşenden", () => {
    render(<OfficialLinks exam="yks" />);
    const links = screen.queryAllByRole("link");
    for (const link of links) expect(link.textContent).toContain(NEW_TAB_NOTE);
  });

  it("kaynakta çıplak target=\"_blank\" kalmadı: her yeni sekme bağlantısı ExternalAnchor", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith(".tsx") && !path.endsWith("external-anchor.tsx")) {
          if (/target=(?:"_blank"|\{"_blank"\})/.test(read(path))) offenders.push(path);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});

describe("Paket 4 #3 — yazım sürerken payda yok", () => {
  const screens = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      heading: `Kavram ${i + 1}`,
      concept: `Kavram ${i + 1}`,
      blocks: [{ type: "text" as const, text: `Bu ekran ${i + 1}. adımı anlatan kısa ve genel bir paragraftır.` }],
    }));
  const base = { format: 3, title: "Genel ders", overview: "Ders kavramları sırayla anlatır." } as LessonV3;
  const count = (c: HTMLElement) => c.querySelector(".als-count")?.textContent ?? "";

  it("sayaç imzası tahmin almaz; building iken etiket çıplak 'N'", () => {
    const fn = read("src/lib/learning/activity-duration.ts");
    expect(fn).not.toContain("estimatedTotal");
    expect(fn).not.toContain("} / ~");
    for (const written of [1, 3, 8]) {
      const c = lessonStepCounter({ index: 0, writtenSteps: written, building: true });
      expect(c.label).toBe("1");
      expect(c.indeterminate).toBe(true);
    }
  });

  it("plannedScreens verilse de akışta 'Adım 1', ana yazım bitse (writingDone) de payda ve 'N adım' yok; mühürde kilitli", () => {
    const { container, rerender } = render(
      <ExamLessonSteps lesson={sealLessonV3ForPlay({ ...base, screens: screens(2) } as LessonV3)} building plannedScreens={8} upcoming={["Sonraki"]} closeHref="/d" />,
    );
    expect(count(container)).toMatch(/^Adım\s*1$/);
    expect(container.querySelector('[role="progressbar"]')!.hasAttribute("aria-valuemax")).toBe(false);
    expect(container.querySelector(".als-intro-meta")!.textContent).not.toMatch(/\d+ adım|~/);

    // Ana yazım bitti ama ekler sürüyor: süre görünebilir, payda görünmez.
    rerender(
      <ExamLessonSteps lesson={sealLessonV3ForPlay({ ...base, screens: screens(6) } as LessonV3)} building writingDone plannedScreens={8} closeHref="/d" />,
    );
    expect(count(container)).toMatch(/^Adım\s*1(~\d+ dk)?$/);
    expect(container.querySelector(".als-intro-meta")!.textContent).not.toMatch(/\d+ adım/);
    expect(container.querySelector('[role="progressbar"]')!.hasAttribute("aria-valuemax")).toBe(false);

    // Mühür: payda yazılan adım ve kilitli.
    rerender(<ExamLessonSteps lesson={sealLessonV3ForPlay({ ...base, screens: screens(6) } as LessonV3)} plannedScreens={8} closeHref="/d" />);
    const sealed = count(container).match(/1 \/ (\d+)/);
    expect(sealed).not.toBeNull();
    expect(container.querySelector(".als-intro-meta")!.textContent).toContain(`${sealed![1]} adım`);
  });

  it("hazır (mühürlü) ders açılınca payda hemen görünür", () => {
    const { container } = render(<ExamLessonSteps lesson={sealLessonV3ForPlay({ ...base, screens: screens(4) } as LessonV3)} closeHref="/d" />);
    expect(count(container)).toMatch(/1 \/ \d+/);
  });
});
