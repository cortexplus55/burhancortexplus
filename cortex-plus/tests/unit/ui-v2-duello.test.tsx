// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DuelPlay } from "@/components/duel/duel-play";
import { NewDuelButton } from "@/components/duel/new-duel-button";
import { StudentShellProvider } from "@/lib/student/student-shell-context";
import { EntitlementUiProvider } from "@/components/entitlements/entitlement-ui";
import type { StudentAccountContext } from "@/lib/student/account-context";

/*
  Faz 9 (`ui.v2.duello`): düellonun yeni görünümü bugünkü düello sisteminin (prep_duels, sunucuda puan, tohumlu bot)
  üstünde. Bayrak açıkken rakip bilgi sızdırmaz: botun bu sorudaki doğru / yanlışı ve puanı öğrenci cevaplayana kadar
  gösterilmez, bot "BOT" etiketli; düello kurma düğmeleri `duel.start` kapısında. Kapalıyken bugünkü akış.
*/

vi.mock("next/navigation", () => ({
  usePathname: () => "/deneme-sinavlari/p1/duello",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
Element.prototype.scrollIntoView = vi.fn();
window.matchMedia = vi.fn().mockReturnValue({ matches: false });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const read = (path: string) => readFileSync(path, "utf8");
const QUESTIONS = [
  { text: "Soru 1: hangisi doğru?", options: ["A şıkkı", "B şıkkı", "C şıkkı", "D şıkkı", "E şıkkı"] },
  { text: "Soru 2: hangisi doğru?", options: ["A şıkkı", "B şıkkı", "C şıkkı", "D şıkkı", "E şıkkı"] },
];

function stubBot() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/bot")) {
        return new Response(
          JSON.stringify({
            level: "derece",
            name: "Derece Öğrencisi",
            // Bot ilk soruya hemen (1 ms) cevap veriyor: öğrenci henüz cevaplamadan sonucu görünmemeli.
            steps: [
              { ms: 1, correct: true, points: 15 },
              { ms: 1, correct: false, points: 0 },
            ],
            correct: 1,
            score: 15,
            total: 2,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ correct: 2, score: 30, total: 2, answers: [0, 1], rank: 1, leaderboard: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

async function startWithBot(neutralBot: boolean) {
  stubBot();
  render(
    <DuelPlay code="abc12345" title="Hücre" topic={null} creatorName="Ayşe" questions={QUESTIONS} initialBoard={[]} signedIn countdownSeconds={0} neutralBot={neutralBot} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /ile başla/ }));
  await waitFor(() => expect(document.querySelector(".cp-duel-bot")).toBeTruthy());
  // Bot 1 ms'de cevapladı; oyun sayacının bir tık ilerlemesini bekle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}

describe("rakip bilgi sızdırmaz", () => {
  it("bayrak açık: öğrenci cevaplamadan bot 'cevapladı' der; doğru / yanlış, puan ve nokta rengi yok; BOT etiketi var", async () => {
    await startWithBot(true);
    const bot = document.querySelector(".cp-duel-bot")!;
    expect(bot.textContent).toContain("BOT");
    expect(bot.querySelector(".cp-duel-bot-status")!.textContent).toBe("cevapladı");
    expect(bot.textContent).not.toMatch(/bildi|yanıldı/);
    expect(bot.querySelector(".cp-duel-bot-score")!.textContent).toBe("0 puan");
    const dots = [...bot.querySelectorAll(".cp-duel-bot-track li")].map((li) => li.className);
    expect(dots[0]).toBe("is-done");
    expect(dots.join(" ")).not.toMatch(/is-right|is-wrong/);
    // Cevaplayınca önceki soru görünür olur.
    fireEvent.click(screen.getByRole("button", { name: /A şıkkı/ }));
    await waitFor(() => expect(screen.getByText(/Soru 2 \/ 2/)).toBeTruthy());
    const after = document.querySelector(".cp-duel-bot")!;
    expect(after.querySelector(".cp-duel-bot-track li")!.className).toBe("is-right");
    expect(after.querySelector(".cp-duel-bot-score")!.textContent).toBe("15 puan");
  });

  it("bayrak kapalı: bugünkü canlı akış (bot sonucu süresi gelince görünür), BOT etiketi yok", async () => {
    await startWithBot(false);
    const bot = document.querySelector(".cp-duel-bot")!;
    expect(bot.querySelector(".cp-duel-bot-tag")).toBeNull();
    expect(bot.querySelector(".cp-duel-bot-status")!.textContent).toMatch(/✓ bildi/);
    expect(bot.querySelector(".cp-duel-bot-score")!.textContent).toBe("15 puan");
  });
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
    resetsAtLabel: "",
    periodKind: "daily",
    usedPercent: 0,
    extraPercent: null,
    freeMeters: [],
    ...over,
  };
}

describe("düello kurma kapısı (duel.start)", () => {
  function buttons(acc: StudentAccountContext, gated: boolean) {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <StudentShellProvider account={acc}>
        <EntitlementUiProvider prices={{ plusMonthly: 59900, plusWeekly: 34900, sigmaMonthly: 199900 }} firstLesson="done" examDaysLeft={null}>
          <NewDuelButton prepId="p1" gated={gated} />
        </EntitlementUiProvider>
      </StudentShellProvider>,
    );
    return fetchMock;
  }

  it("bayrak açık + ücretsiz (hediye bakiyesi yok): iki düğme kilitli, basınca istek atılmaz, pencere açılır", () => {
    const fetchMock = buttons(account(), true);
    const create = screen.getByRole("button", { name: /Yeni düello/ });
    expect(create.getAttribute("data-gate")).toBe("locked");
    expect(screen.getByRole("button", { name: /AI rakiple hemen başla/ }).getAttribute("data-gate")).toBe("locked");
    fireEvent.click(create);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("bayrak kapalı: kapı yok, bugünkü 402 yolu (istek atılır)", () => {
    const fetchMock = buttons(account(), false);
    const create = screen.getByRole("button", { name: /Yeni düello/ });
    expect(create.getAttribute("data-gate")).toBeNull();
    fireEvent.click(create);
    expect(fetchMock).toHaveBeenCalledWith("/api/learning/exam-prep/duel", expect.objectContaining({ method: "POST" }));
  });
});

describe("sarmalayıcı ve kapsam", () => {
  it("iki düello sayfası ui.v2.duello okur; paylaşılan sayfa oturumsuz da çalışır", () => {
    const shared = read("src/app/duello/[code]/page.tsx");
    expect(shared).toContain('uiV2("duello", userId)');
    expect(shared).toContain("neutralBot={duelloV2}");
    const list = read("src/app/deneme-sinavlari/[prepId]/duello/page.tsx");
    expect(list).toContain('uiV2("duello", user.id)');
    expect(list).toContain("<NewDuelButton prepId={prepId} gated={duelloV2} />");
  });

  it("kurallar yalnız [data-ui~=duello] altında; ham renk yok, odak halkası var", () => {
    const css = read("src/styles/ui-v2-duello.css").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const rule of css.match(/[^{}]+\{/g) ?? []) {
      const selector = rule.replace("{", "").trim();
      if (!selector || selector.startsWith("@")) continue;
      for (const part of selector.split(",")) expect(part.trim(), part).toMatch(/^\[data-ui~="duello"\]/);
    }
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).toMatch(/:focus-visible[\s\S]*var\(--cx-focus\)/);
    expect(css).toMatch(/\.cp-duel-option \{[^}]*min-height: 56px/);
  });

  it("yeni düello sunucusu (duel.enabled) bu fazda yok: /d/KOD rotası yok, tablo değişmedi", () => {
    expect(() => read("src/app/d/[code]/page.tsx")).toThrow();
    expect(read("src/lib/entitlements/config.ts")).toContain('play: "everyone"');
  });
});
