// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/ogretmen";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { isInternalNavigation, NavigationProgress } from "@/components/layout/navigation-progress";
import { ContinueLine } from "@/components/parity/continue-line";

/*
  Zor beğenen kullanıcı turu (8 Kasım 2026): bağlantıya basınca hiçbir şey olmuyordu (bu projede sayfalara yükleniyor
  sınırı konmuyor); geri dönen öğrenci ana ekranda kaldığı yeri görmüyordu.
*/
const click = (init: MouseEventInit = {}) => new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
const anchor = (href: string, attrs: Record<string, string> = {}) => {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  document.body.appendChild(a);
  return a;
};

describe("sayfa geçiş çizgisi", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/ogretmen");
    pathname = "/ogretmen";
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("yalnız bu sekmede başka bir uygulama sayfasına giden bağlantıda başlar", () => {
    const loc = window.location;
    expect(isInternalNavigation(anchor("/deneme-sinavlari"), click(), loc)).toBe(true);
    expect(isInternalNavigation(anchor("/ogretmen?sohbet=1"), click(), loc)).toBe(true);
    expect(isInternalNavigation(anchor("/ogretmen"), click(), loc)).toBe(false);
    expect(isInternalNavigation(anchor("#bolum"), click(), loc)).toBe(false);
    expect(isInternalNavigation(anchor("https://baska.site/x"), click(), loc)).toBe(false);
    expect(isInternalNavigation(anchor("/x", { target: "_blank" }), click(), loc)).toBe(false);
    expect(isInternalNavigation(anchor("/x", { download: "" }), click(), loc)).toBe(false);
    expect(isInternalNavigation(anchor("mailto:a@b.c"), click(), loc)).toBe(false);
    expect(isInternalNavigation(anchor("/x"), click({ ctrlKey: true }), loc)).toBe(false);
    expect(isInternalNavigation(anchor("/x"), click({ button: 1 }), loc)).toBe(false);
  });

  it("Next'in tıklamayı iptal eden <Link>'inde de başlar (yakalama aşaması)", () => {
    vi.useFakeTimers();
    const view = render(<NavigationProgress />);
    const bar = view.container.querySelector(".cp-nav-progress") as HTMLElement;
    const link = anchor("/deneme-sinavlari");
    link.addEventListener("click", (event) => event.preventDefault());
    act(() => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      vi.advanceTimersByTime(150);
    });
    expect(bar.dataset.state).toBe("loading");
  });

  it("anında değişen adreste (pencere bağlantısı) çizgi hiç görünmez", () => {
    vi.useFakeTimers();
    const view = render(<NavigationProgress />);
    const bar = view.container.querySelector(".cp-nav-progress") as HTMLElement;
    const link = anchor("/ayarlar?dialog=profile");
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.history.pushState(null, "", "/ayarlar?dialog=profile");
    });
    act(() => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      vi.advanceTimersByTime(125);
    });
    expect(bar.dataset.state).toBe("idle");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(bar.dataset.state).toBe("idle");
  });

  it("yavaş geçişte çizgi görünür, yeni adreste tamamlanır", () => {
    vi.useFakeTimers();
    const view = render(<NavigationProgress />);
    const bar = view.container.querySelector(".cp-nav-progress") as HTMLElement;
    const link = anchor("/deneme-sinavlari");
    // jsdom bağlantıyı izlemez; Next'in yaptığı gibi adresi biz değiştireceğiz.
    act(() => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(bar.dataset.state).toBe("loading");
    act(() => {
      window.history.pushState(null, "", "/deneme-sinavlari");
      vi.advanceTimersByTime(130);
    });
    expect(bar.dataset.state).toBe("done");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(bar.dataset.state).toBe("idle");
  });

  it("sayfa hiç gelmezse 15 sn sonra kendiliğinden kapanır", () => {
    vi.useFakeTimers();
    const view = render(<NavigationProgress />);
    const bar = view.container.querySelector(".cp-nav-progress") as HTMLElement;
    act(() => {
      anchor("/yavas").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      vi.advanceTimersByTime(200);
    });
    expect(bar.dataset.state).toBe("loading");
    act(() => {
      vi.advanceTimersByTime(15_500);
    });
    expect(bar.dataset.state).toBe("idle");
  });
});

describe("Kaldığın yerden devam", () => {
  it("sıradaki adıma doğrudan gider; adım adı, tür, hazırlık ve süre görünür", () => {
    const view = render(
      <ContinueLine
        step={{
          prepId: "p1",
          prepTitle: "Anayasa Hukuku",
          next: { kind: "lesson", kindLabel: "Ders", heading: "Yasama yetkisi", minutes: 12, href: "/deneme-sinavlari/p1/dugum/n1" },
        }}
      />,
    );
    const link = view.getByRole("link");
    expect(link.getAttribute("href")).toBe("/deneme-sinavlari/p1/dugum/n1");
    expect(link.textContent).toContain("Kaldığın yerden devam");
    expect(link.textContent).toContain("Yasama yetkisi");
    expect(link.textContent).toContain("Ders · Anayasa Hukuku");
    expect(link.textContent).toContain("~12 dk");
  });
});

describe("zor kullanıcı turunun küçük düzeltmeleri", () => {
  it("selamda ad baş harfi büyük; e-posta ad sayılmaz", async () => {
    const { parityGreetingName } = await import("@/components/parity/app-utils");
    expect(parityGreetingName("burhan önder")).toBe("Burhan");
    expect(parityGreetingName("ilknur")).toBe("İlknur");
    expect(parityGreetingName("Ada")).toBe("Ada");
    expect(parityGreetingName("ogrenci@ornek.com")).toBe("Merhaba");
    expect(parityGreetingName("")).toBe("Merhaba");
  });

  it("sınav şeridi hazırlığa gider; hedef tarihinde bağlantı yok", async () => {
    const { resolveExamCountdown } = await import("@/lib/learning/exam-countdown");
    const from = new Date("2026-11-08T12:00:00+03:00");
    const prep = resolveExamCountdown({ candidates: [{ examDate: "2026-11-13", prepId: "p1", title: "Biyoloji" }], from });
    expect(prep.state === "countdown" && prep.href).toBe("/deneme-sinavlari/p1");
    const goal = resolveExamCountdown({ candidates: [], goalTargetDate: "2026-12-01", from });
    expect(goal.state === "countdown" ? goal.href : "x").toBeNull();
  });

  it("bitmemiş adımın geçmiş günü 'Bugün' yazılır; biten adım tarihini korur", async () => {
    const { pathNodeWhenLabel } = await import("@/lib/learning/path-dates");
    const today = "2026-11-08";
    expect(pathNodeWhenLabel({ status: "ready", calendarDate: "2026-11-06" }, { today })).toBe("Bugün");
    expect(pathNodeWhenLabel({ status: "locked", calendarDate: "2026-11-07" }, { today })).toBe("Bugün");
    expect(pathNodeWhenLabel({ status: "locked", calendarDate: "2026-11-09" }, { today })).toBe("Yarın");
  });

  it("'Doğrusu' açıklamada zaten geçiyorsa kapsanmış sayılır", async () => {
    const { sentenceCoveredBy } = await import("@/lib/text/turkish");
    expect(
      sentenceCoveredBy(
        "Hücre zarı seçici geçirgen yapıdadır.",
        "Hücre zarı seçici geçirgendir; maddelerin geçişi aynı şekilde gerçekleşmez.",
      ),
    ).toBe(true);
    expect(sentenceCoveredBy("Mitoz iki eş hücre verir.", "Hücre zarı seçici geçirgendir.")).toBe(false);
  });
});
