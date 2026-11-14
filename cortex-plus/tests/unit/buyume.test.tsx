// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  GROWTH_DISMISS_COOLDOWN_DAYS,
  dismissGrowth,
  growthVisible,
  istanbulDay,
  markGrowthShown,
  type GrowthStore,
} from "@/lib/growth/growth-prompt";
import { InviteStrip } from "@/components/growth/invite-strip";
import { REFERRAL_GIFT_LESSONS } from "@/lib/billing/free-meters";

/*
  Faz 11C (`ui.v2.buyume`): büyüme yerleşimlerinin ortak kuralları ve ana ekran davet şeridi. Günde en çok bir öneri
  (bütün yerleşimler), kapatılınca 30 gün çıkmaz, depo okunamazsa gösterilmez; hiçbir şey kendiliğinden gönderilmez.
*/

function memory(): GrowthStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

const NOW = new Date("2026-11-14T20:00:00+03:00");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("ortak kurallar (saf)", () => {
  it("depo yoksa ya da okunamazsa gösterilmez", () => {
    expect(growthVisible("home_invite", NOW, null)).toBe(false);
    const broken: GrowthStore = {
      getItem: () => {
        throw new Error("engelli");
      },
      setItem: () => {},
    };
    expect(growthVisible("home_invite", NOW, broken)).toBe(false);
  });

  it("günde en çok bir öneri: bugün başka yerleşim çizildiyse bu çizilmez; ertesi gün yeniden", () => {
    const store = memory();
    store.setItem("cx-growth-day", JSON.stringify({ day: istanbulDay(NOW), placement: "lesson_end" }));
    expect(growthVisible("home_invite", NOW, store)).toBe(false);
    expect(growthVisible("home_invite", days(1), store)).toBe(true);
  });

  it("aynı yerleşim aynı gün yeniden çizilebilir ama olay bir kez", () => {
    const store = memory();
    expect(growthVisible("home_invite", NOW, store)).toBe(true);
    expect(markGrowthShown("home_invite", NOW, store)).toBe(true);
    expect(growthVisible("home_invite", NOW, store)).toBe(true);
    expect(markGrowthShown("home_invite", NOW, store)).toBe(false);
  });

  it(`kapatılınca ${GROWTH_DISMISS_COOLDOWN_DAYS} gün çıkmaz`, () => {
    const store = memory();
    dismissGrowth("home_invite", NOW, store);
    expect(growthVisible("home_invite", days(1), store)).toBe(false);
    expect(growthVisible("home_invite", days(GROWTH_DISMISS_COOLDOWN_DAYS - 1), store)).toBe(false);
    expect(growthVisible("home_invite", days(GROWTH_DISMISS_COOLDOWN_DAYS + 1), store)).toBe(true);
  });

  it("gün İstanbul saatiyle: 23:30 ile 00:30 iki ayrı gün", () => {
    expect(istanbulDay(new Date("2026-11-14T23:30:00+03:00"))).toBe("2026-11-14");
    expect(istanbulDay(new Date("2026-11-15T00:30:00+03:00"))).toBe("2026-11-15");
  });
});

describe("ana ekran davet şeridi", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("metin ödül sayısını bugünkü sabitten alır; kopyala ve kapat; kişisel veri olaya gitmez", async () => {
    const capture = vi.fn();
    vi.stubGlobal("posthog", { capture });
    (window as unknown as { posthog: unknown }).posthog = { capture };
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<InviteStrip url="https://cortexplus.app/kayit?ref=ABC" plan="free" />);
    const region = await screen.findByRole("region", { name: "Arkadaşını getir" });
    expect(region.textContent).toContain(`İkinize de ${REFERRAL_GIFT_LESSONS} ders hediye`);
    expect(capture).toHaveBeenCalledWith("share_prompt_shown", { source: "growth", placement: "home_invite", plan: "free" });
    expect(JSON.stringify(capture.mock.calls)).not.toContain("ref=ABC");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bağlantıyı kopyala" }));
    });
    expect(writeText).toHaveBeenCalledWith("https://cortexplus.app/kayit?ref=ABC");
    expect(screen.getByRole("button", { name: "Kopyalandı" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Öneriyi kapat" }));
    expect(screen.queryByRole("region", { name: "Arkadaşını getir" })).toBeNull();
    expect(window.localStorage.getItem("cx-growth-dismiss:home_invite")).toBeTruthy();
  });

  it("kapatılmışsa çizilmez", () => {
    window.localStorage.setItem("cx-growth-dismiss:home_invite", new Date().toISOString());
    render(<InviteStrip url="https://cortexplus.app/kayit?ref=ABC" plan="free" />);
    expect(screen.queryByRole("region", { name: "Arkadaşını getir" })).toBeNull();
  });
});

describe("bağlama", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  it("ana ekran: yalnız bayrak açık + ilk ders tamamlanmış + hazırlık varken; bağlantı /davet ile aynı kaynaktan", () => {
    const page = read("src/app/ogretmen/page.tsx");
    expect(page).toContain('uiV2("buyume", user.id)');
    expect(page).toContain('firstLesson === "done" || cockpit.some((prep) => prep.progress.done > 0)');
    expect(page).toContain("loadInviteLink(supabase, user.id)");
    expect(page).toContain("<HomeCockpit aside={inviteStrip} />");
  });

  it("şerit telefonda gizli (ana ekran kaydırmasız); kap kenarsız bg-1 köşe 24; kapat 40 px", () => {
    const css = read("src/styles/ui-v2-buyume.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/max-width: 767px[\s\S]*\.cx-growth \{\s*display: none;/);
    expect(css).toMatch(/\.cx-growth \{[^}]*var\(--cx-radius-l\)[^}]*var\(--cx-bg-1\)/);
    expect(css).toMatch(/\.cx-growth-close \{[^}]*width: 40px;[^}]*height: 40px/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("çalışma ekranlarında yerleşim yok: ders, test, sözlü, düello, yazılı bileşenleri büyüme kancasını kullanmaz", () => {
    for (const file of [
      "src/components/parity/exam-lesson-steps.tsx",
      "src/components/parity/exam-quiz-play.tsx",
      "src/components/parity/oral-exam-flow.tsx",
      "src/components/duel/duel-play.tsx",
      "src/components/parity/exam-runner.tsx",
    ]) {
      let source = "";
      try {
        source = read(file);
      } catch {
        continue;
      }
      expect(source, file).not.toContain("useGrowthPrompt");
      expect(source, file).not.toContain("InviteStrip");
    }
  });
});
