// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HomeCockpit, HomeSelectionProvider, HomeToolsTray } from "@/components/parity/home-cockpit";
import { StudentShellProvider } from "@/lib/student/student-shell-context";
import { EntitlementUiProvider } from "@/components/entitlements/entitlement-ui";
import type { StudentAccountContext } from "@/lib/student/account-context";
import {
  RING_ARC_LIMIT,
  initialCockpitIndex,
  orderCockpitPreps,
  ringArcs,
  type CockpitPrep,
} from "@/lib/learning/home-cockpit-model";
import { pathIsBehind } from "@/lib/learning/home-cockpit";

/*
  Ana ekran (13 Kasım 2026, ürün sahibinin kararı; 8 Kasım'ın "ana ekran yalnız sohbet" kararının yerine): beş parça.
  Örnekler bilerek genel (A/B/C hazırlığı, "Konu 1"); veri yükleyicinin sırası ve açılış seçimi, "geride" sinyali,
  halka (≤12 konu yay yay, fazlası kesintisiz), şerit erişilebilirliği ve tepsi.
*/

vi.mock("next/image", () => ({ default: () => null }));

afterEach(cleanup);

function prep(over: Partial<CockpitPrep> & { id: string }): CockpitPrep {
  return {
    title: `Hazırlık ${over.id}`,
    subject: null,
    examDate: null,
    daysLeft: null,
    behind: false,
    progress: { done: 1, total: 4, pct: 25 },
    next: { heading: "Sıradaki adım", kindLabel: "Konu anlatımı", href: "/x" },
    topics: [
      { id: "k1", label: "Konu 1", done: true, next: null },
      { id: "k2", label: "Konu 2", done: false, next: { heading: "Konu 2 anlatımı", kindLabel: "Konu anlatımı", href: "/k2" } },
      { id: "k3", label: "Konu 3", done: false, next: { heading: "Konu 3 anlatımı", kindLabel: "Konu anlatımı", href: "/k3" } },
    ],
    currentTopic: 1,
    href: `/deneme-sinavlari/${over.id}`,
    createdAt: "2026-11-01T00:00:00Z",
    ...over,
  };
}

const PREPS = orderCockpitPreps([
  prep({ id: "C", examDate: null, createdAt: "2026-11-09T00:00:00Z" }),
  prep({ id: "B", examDate: "2026-12-20", daysLeft: 37, behind: true }),
  prep({ id: "A", examDate: "2026-11-01", daysLeft: -12 }),
  prep({ id: "D", examDate: "2026-11-13", daysLeft: 0 }),
]);

describe("sıra ve açılış seçimi", () => {
  it("tarihliler artan (geçmiş en üstte), tarihsizler sonda; açılışta en yakın gelecek sınav", () => {
    expect(PREPS.map((item) => item.id)).toEqual(["A", "D", "B", "C"]);
    // Bugünkü sınav (0 gün) gelecek sayılır.
    expect(initialCockpitIndex(PREPS)).toBe(1);
    expect(initialCockpitIndex([prep({ id: "A", examDate: "2026-11-01", daysLeft: -12 }), prep({ id: "C" })])).toBe(1);
    expect(initialCockpitIndex([prep({ id: "A", examDate: "2026-11-01", daysLeft: -12 })])).toBe(0);
  });

  it("yaylar eşit, aralarında boşluk; tek konu tam halka", () => {
    const arcs = ringArcs(4);
    expect(arcs).toHaveLength(4);
    expect(arcs[0]![0]).toBeGreaterThan(0);
    expect(arcs[3]![1]).toBeLessThan(360);
    expect(ringArcs(1)).toEqual([[0, 359.99]]);
  });
});

describe("geride sinyali (yolda günü geçmiş ama bitmemiş adım)", () => {
  const node = (status: string, calendarDate: string, sort: number) => ({
    id: `n${sort}`,
    exam_prep_id: "p",
    status,
    kind: "lesson",
    title: null,
    sort_order: sort,
    session_meta: { calendarDate },
  });
  const options = { createdAt: "2026-11-01T00:00:00Z", examDate: "2026-12-20", today: "2026-11-13", skipKinds: new Set<string>() };

  it("bitmemiş ve günü geçmiş adım varsa geride", () => {
    expect(pathIsBehind([node("ready", "2026-11-10", 1), node("locked", "2026-11-20", 2)], options)).toBe(true);
  });
  it("günü geçmiş adım bitmişse ya da günü gelmemişse geride değil", () => {
    expect(pathIsBehind([node("done", "2026-11-10", 1), node("ready", "2026-11-13", 2)], options)).toBe(false);
  });
  it("ücretsiz hesapta atlanan Plus adımı sayılmaz", () => {
    expect(pathIsBehind([node("ready", "2026-11-10", 1)], { ...options, skipKinds: new Set(["lesson"]) })).toBe(false);
  });
});

describe("sınav şeridi", () => {
  it("tablist, en yakın sınav seçili; gün sayısı ve 'gün sonra'; bugün yalnız 0; tarihsizde takvim; geride nokta", () => {
    const { container } = render(
      <HomeSelectionProvider preps={PREPS}>
        <HomeCockpit />
      </HomeSelectionProvider>,
    );
    const list = screen.getByRole("tablist", { name: "Sınavlar" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]!.textContent).toBe("0");
    expect(tabs[2]!.textContent).toBe("37gün sonra");
    expect(tabs[3]!.textContent).toBe("");
    expect(tabs[3]!.getAttribute("aria-label")).toBe("Hazırlık C");
    expect(tabs[2]!.querySelector(".cx-strip-dot")).not.toBeNull();
    expect(tabs[1]!.querySelector(".cx-strip-dot")).toBeNull();
    // Son kutu yeni hazırlık: mevcut kurulum akışı.
    expect(within(list).getByRole("link", { name: "Yeni sınav hazırlığı" })!.getAttribute("href")).toBe("/deneme-sinavlari/olustur");
    expect(container.querySelectorAll(".cx-brand")).toHaveLength(1);
  });

  it("ok tuşları seçimi değiştirir; sayfa değişmez, başlık ve yüzde yerinde güncellenir", () => {
    render(
      <HomeSelectionProvider preps={[prep({ id: "A", daysLeft: 3, examDate: "2026-11-16" }), prep({ id: "B", daysLeft: 9, examDate: "2026-11-22", progress: { done: 3, total: 4, pct: 75 }, currentTopic: 2 })]}>
        <HomeCockpit />
      </HomeSelectionProvider>,
    );
    expect(screen.getByText("%25")).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[0]!, { key: "ArrowDown" });
    expect(screen.getAllByRole("tab")[1]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("%75")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Konu 3");
  });
});

describe("konu halkası", () => {
  it("≤12 konuda her konu bir yay; kaydırıcı aynı seçimi yapar", () => {
    const { container } = render(
      <HomeSelectionProvider preps={[prep({ id: "A" })]}>
        <HomeCockpit />
      </HomeSelectionProvider>,
    );
    expect(container.querySelectorAll(".cx-ring-arc")).toHaveLength(3);
    expect(container.querySelectorAll(".cx-ring-arc[data-done]")).toHaveLength(1);
    const slider = screen.getByRole("slider", { name: "Konular" });
    expect(slider!.getAttribute("aria-valuetext")).toBe("2 / 3");
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider!.getAttribute("aria-valuetext")).toBe("3 / 3");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Konu 3");
    fireEvent.click(container.querySelectorAll(".cx-ring-arc")[0]!);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Konu 1");
    // Seçili yay kendisi işaretli; çerçeve yayla aynı açıda, yarıçapı yayın kalınlığı içinde (dışarıda çizgi yok).
    const arcs = [...container.querySelectorAll(".cx-ring-arc")];
    expect(arcs.map((arc) => arc.hasAttribute("data-selected"))).toEqual([true, false, false]);
    const frame = container.querySelectorAll(".cx-ring-selected");
    expect(frame).toHaveLength(1);
    expect(frame[0]!.getAttribute("d")).toMatch(/^M [\d.]+ [\d.]+ A 107 107 .* A 93 93 .* Z$/);
    // Kaydırıcı halkanın içinde değil, grubun en sağ ucunda (halka ve metinden sonra).
    const body = container.querySelector(".cx-cockpit-body")!;
    expect([...body.children].map((child) => child.className)).toEqual(["cx-ring", "cx-cockpit-text", "cx-slider"]);
    // Devam et hazırlık sayfasını açar (çalışma yolu sayfası ayrı commit'te).
    expect(screen.getByRole("link", { name: "Devam et" })!.getAttribute("href")).toBe("/deneme-sinavlari/A");
  });

  it(`${RING_ARC_LIMIT}'den fazla konuda yaylar tek tek çizilmez; seçili konunun yeri işaretlenir`, () => {
    const many = Array.from({ length: RING_ARC_LIMIT + 3 }, (_, index) => ({ id: `k${index}`, label: `Konu ${index + 1}`, done: index < 4, next: null }));
    const { container } = render(
      <HomeSelectionProvider preps={[prep({ id: "A", topics: many, currentTopic: 4 })]}>
        <HomeCockpit />
      </HomeSelectionProvider>,
    );
    expect(container.querySelectorAll(".cx-ring-arc").length).toBeLessThanOrEqual(2);
    // Seçili konunun payı halkanın üstünde ince çerçeve (halkanın dışında ayrı çizgi yok).
    expect(container.querySelectorAll(".cx-ring-selected")).toHaveLength(1);
    expect(container.querySelector(".cx-ring-marker")).toBeNull();
    expect(screen.getByRole("slider")!.getAttribute("aria-valuetext")).toBe(`5 / ${RING_ARC_LIMIT + 3}`);
  });
});

describe("çalışma araçları tepsisi", () => {
  const names = (container: HTMLElement) => [...container.querySelectorAll(".cx-tray-label")].map((node) => node.textContent);

  it("sekiz araç, depodaki adlarla; hazırlığa bağlı ikisi seçili hazırlığı açar", () => {
    const { container } = render(
      <HomeSelectionProvider preps={[prep({ id: "A" })]}>
        <HomeToolsTray freeAccount={false} />
      </HomeSelectionProvider>,
    );
    expect(names(container)).toEqual([
      "Kartlar",
      "Doğru / Yanlış",
      "Konu Testi",
      "Podcast",
      "1 Dk Çizimli Video",
      "Sözlü Sınav",
      "Yazılı Deneme",
      "Sınav Sabahı Kağıdı",
    ]);
    expect(screen.getByRole("link", { name: /Sınav Sabahı Kağıdı/ })!.getAttribute("href")).toBe("/deneme-sinavlari/A/sinav-sabahi");
    expect(screen.getByRole("link", { name: /1 Dk Çizimli Video/ }).getAttribute("href")).toMatch(/^\/deneme-sinavlari\/A\/video\?.*mode=sketch_reel/);
    // Plus hesabında kilit yok.
    expect(container.querySelectorAll(".cx-tray-plus")).toHaveLength(0);
  });

  it("ücretsiz hesapta Plus'a özel ve ders sayacına düşen araçlar kilit rozetli", () => {
    // Faz 3B: Plus'a özel beş araç hak kapısıyla (kilit + PLUS, basınca pencere); ders sayacına düşen üçü bugünkü rozetle.
    const free = { isPremium: false, isAdmin: false, showsUpgradeChrome: true, balance: 0, freeAllowanceRemaining: 0, usedPercent: 0, periodKind: "daily", resetsAtLabel: "" } as StudentAccountContext;
    const { container } = render(
      <StudentShellProvider account={free}>
        <EntitlementUiProvider prices={{ plusMonthly: 59900, plusWeekly: 34900, sigmaMonthly: 199900 }}>
          <HomeSelectionProvider preps={[prep({ id: "A" })]}>
            <HomeToolsTray freeAccount />
          </HomeSelectionProvider>
        </EntitlementUiProvider>
      </StudentShellProvider>,
    );
    expect(container.querySelectorAll(".cx-tray-plus")).toHaveLength(3);
    const gated = [...container.querySelectorAll(".cx-tray-item[data-gate='locked']")].map((node) => node.querySelector(".cx-tray-label")?.textContent);
    expect(gated).toEqual(["Podcast", "1 Dk Çizimli Video", "Sözlü Sınav", "Yazılı Deneme", "Sınav Sabahı Kağıdı"]);
    for (const item of container.querySelectorAll(".cx-tray-item[data-gate='locked']")) {
      expect(item.textContent).toContain("PLUS");
      expect(item.getAttribute("aria-haspopup")).toBe("dialog");
    }
  });
});

describe("kaynak bekçileri", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("ana ekran üst çubuğu: plan rozeti, yıldız ve ayarlar bağlantısı yok; Plus'a geç yalnız ücretsizde", () => {
    const shell = read("src/components/parity/sor-shell.tsx");
    const start = shell.indexOf('<header className="cx-home-top">');
    const header = shell.slice(start, shell.indexOf("</header>", start));
    expect(header).not.toContain("StarsButton");
    expect(header).not.toContain("cp-sor-plan");
    expect(header).not.toContain("/ayarlar");
    expect(header).toContain('tab.id !== "profile"');
    expect(header).toMatch(/\{showBuy \? \(\s*<Link href="\/pay" className="cx-home-buy"/);
  });

  it("/ogretmen yeni üst çubukta, geri sayım şeridi yok", () => {
    const page = read("src/app/ogretmen/page.tsx");
    expect(page).toMatch(/<ParitySorShell\s+home/);
    expect(page).not.toContain("countdown={countdown}");
  });

  it("mikrofon simgesi her yerde dikte; sesli öğretmen ince çubukta yok, geniş kutuda ses dalgasıyla", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const slimStart = panel.indexOf('<div className="cx-slim-bar cx-glass">');
    const slim = panel.slice(slimStart, panel.indexOf("</div>", panel.indexOf("<Mic aria-hidden />", slimStart)));
    expect(slim).not.toContain("toggleVoiceMode");
    expect(slim).toContain("startVoiceInput();");
    expect(slim).toContain('"Mikrofon"');
    // Her <Mic> düğmesi dikteyi (startVoiceInput) çağırır; sesli öğretmen düğmeleri AudioLines simgesini taşır.
    for (const match of panel.matchAll(/onClick=\{toggleVoiceMode\}[\s\S]{0,400}?<\/button>/g)) {
      expect(match[0]).toContain("AudioLines");
      expect(match[0]).not.toContain("<Mic");
    }
  });

  it("home-cockpit.css ham renk yazmaz; renk yalnız --cx-*", () => {
    const css = read("src/styles/home-cockpit.css");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/rgba?\(/);
  });
});
