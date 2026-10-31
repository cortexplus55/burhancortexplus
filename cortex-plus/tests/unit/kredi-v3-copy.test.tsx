// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { StudentAccountContext } from "@/lib/student/account-context";
import { StudentShellProvider } from "@/lib/student/student-shell-context";
import { UPGRADE_FREE_LINE, UPGRADE_INVITE_LINE, UpgradeSheet } from "@/components/paywall/upgrade-sheet";
import { ExamPodcastPlayer } from "@/components/parity/exam-podcast-player";
import { FREE_LIMITS, REFERRAL_GIFT_LESSONS, REFERRAL_MAX_INVITES, defaultFreeMeter } from "@/lib/billing/free-meters";

/*
  Kredi v3 yeniden incelemesi (24 Ekim 2026), metin bulguları:
  1. /krediler ücretsiz kartı cüzdandaki her bakiyeye "Hediye" diyordu; eski ek paket ya da promosyon da
     olabilir → "Ek hakkın".
  2. /krediler ücretsiz sayaç satırlarını gizleyince "Araçlar'daki test ve kartlar da bu haktan düşer" ve
     "Anlatarak öğren mesaj sayılır" kuralı sayfadan kayboldu.
  3. Yükseltme kapısı sayıları elle yazıyor, davet hediyesinin hesap doğrulama koşulunu söylemiyordu.
  4. Podcast oynatıcısı ücretsiz hesabın Plus reddine "hakkın yetmedi · Hakkını gör" diyordu.
*/

vi.mock("next/navigation", () => ({
  usePathname: () => "/deneme-sinavlari/prep-1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

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
    resetsAtLabel: "2 Kasım 2026 00:00",
    periodKind: "daily",
    usedPercent: 0,
    extraPercent: null,
    ...over,
  };
}

const free = account();
const plus = account({ audience: "plus", isPremium: true, showsUpgradeChrome: false, subscriptionBadge: "Plus", periodKind: "monthly" });

function inShell(acc: StudentAccountContext, node: ReactNode) {
  return render(<StudentShellProvider account={acc}>{node}</StudentShellProvider>);
}

describe("/krediler ücretsiz kartı (#1, #2)", () => {
  const page = read("src/app/krediler/page.tsx");

  it("cüzdan bakiyesine 'Hediye' demez", () => {
    expect(page).toContain("freeExtraLine(wallet?.balance ?? 0)");
    expect(page).not.toMatch(/Hediye:/);
    expect(read("src/lib/billing/tier-presentation.ts")).not.toMatch(/`Hediye: /);
  });

  it("sayaç notları hangi işin hangi haktan düştüğünü söyler; kural koddakiyle aynı", () => {
    expect(page).toContain("Araçlar'daki test, kart ve doğru/yanlış da bu haktan düşer.");
    expect(page).toContain(`Yazılı soru çözümü ve Araçlar'daki "Anlatarak öğren" de mesaj sayılır.`);
    expect(page).toContain("Okunmayan fotoğraf haktan düşmez.");
    // Araçlar'daki test, kart ve doğru/yanlış dersten; "Anlatarak öğren" mesajdan.
    expect(defaultFreeMeter("QUIZ_GENERATE")).toBe("lesson");
    expect(defaultFreeMeter("FLASHCARD_GENERATE")).toBe("lesson");
    expect(defaultFreeMeter("AI_CHAT_STANDARD")).toBe("chat");
    expect(read("src/app/api/learning/true-false/generate/route.ts")).toContain('actionCode: "QUIZ_GENERATE"');
    const explain = read("src/app/api/learning/explain/route.ts");
    expect(explain).toContain('actionCode: "AI_CHAT_STANDARD"');
    expect(explain).not.toMatch(/freeMeter:/);
  });
});

describe("yükseltme kapısı (#3)", () => {
  it("davet ve ücretsiz hak satırları sayıları koddan alır, hesap doğrulama koşulunu söyler", () => {
    expect(UPGRADE_INVITE_LINE).toBe(
      `Ya da arkadaşını davet et — o hesabını doğrulayıp ilk çalışmasını yapınca ikinize de ${REFERRAL_GIFT_LESSONS} ders hediye (en çok ${REFERRAL_MAX_INVITES} davet)`,
    );
    expect(UPGRADE_FREE_LINE).toBe(
      // 31 Ekim 2026 (Paket J1 #3): ilk hazırlığın 1. konusu tam açık; ders sayacı o konunun içinde.
      `Ücretsiz hesapta ilk hazırlığında 1. konu tam açık (dersleri, testleri ve kartlarıyla; haftada ${FREE_LIMITS.lesson} derse kadar), günde ${FREE_LIMITS.chat} sohbet mesajı ve günde ${FREE_LIMITS.photo} fotoğraftan soru çözümü var; ` +
        `davet ettiğin arkadaş hesabını doğrulayıp ilk çalışmasını yapınca ikinize de ${REFERRAL_GIFT_LESSONS} ders hediye; en çok ${REFERRAL_MAX_INVITES} davet için.`,
    );
  });

  it("ekranda iki satır da görünür", () => {
    const { container } = inShell(free, <UpgradeSheet open onOpenChange={() => undefined} message="Hakkın doldu." />);
    expect(container.querySelector('a[href="/davet"]')?.textContent).toBe(UPGRADE_INVITE_LINE);
    fireEvent.click(screen.getByRole("button", { name: "Cortex Plus neden tamamen ücretsiz değil?" }));
    expect(container.textContent).toContain(UPGRADE_FREE_LINE);
  });
});

/** `/api/learning/podcast/audio` akışı: tek bir hata olayı. */
function streamedError(code: string) {
  const bytes = new TextEncoder().encode(`${JSON.stringify({ type: "error", code })}\n`);
  let sent = false;
  return {
    status: 200,
    ok: true,
    json: async () => null,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        },
      }),
    },
  };
}

const chapters = [
  {
    title: "Giriş",
    lines: [
      { speaker: "ada", text: "Merhaba, bugün devletin unsurlarını konuşuyoruz." },
      { speaker: "kerem", text: "Üç unsur vardı, değil mi?" },
    ],
  },
];

async function renderPlayer(acc: StudentAccountContext, response: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => response));
  const view = inShell(acc, <ExamPodcastPlayer title="Podcast" chapters={chapters} onFinish={() => undefined} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

describe("podcast oynatıcısı Plus reddini hesaba göre söyler (#4)", () => {
  it("ücretsiz hesap: akıştaki premium_required → 'Sesli dinleme Plus'ta', /pay", async () => {
    const { container } = await renderPlayer(free, streamedError("premium_required"));
    expect(container.textContent).toContain("Sesli dinleme Plus'ta; bölümleri metinden okuyabilirsin.");
    expect(container.textContent).not.toContain("hakkın yetmedi");
    const link = screen.getByRole("link", { name: "Plus'a geç" });
    expect(link.getAttribute("href")).toBe("/pay");
    expect(container.querySelector('a[href="/krediler"]')).toBeNull();
  });

  it("ücretsiz hesap: 402 premium_required de aynı", async () => {
    const { container } = await renderPlayer(free, { status: 402, ok: false, json: async () => ({ code: "premium_required" }) });
    expect(container.textContent).toContain("Sesli dinleme Plus'ta");
    expect(screen.getByRole("link", { name: "Plus'a geç" }).getAttribute("href")).toBe("/pay");
  });

  it("abone: eski cümle ve /krediler kalır", async () => {
    const { container } = await renderPlayer(plus, { status: 402, ok: false, json: async () => ({ code: "premium_required" }) });
    expect(container.textContent).toContain("Bu seslendirme için hakkın yetmedi.");
    expect(container.textContent).not.toContain("Sesli dinleme Plus'ta");
    expect(screen.getByRole("link", { name: "Hakkını gör" }).getAttribute("href")).toBe("/krediler");
  });

  it("abone: hakkı bitince yine ek paket, Plus satılmaz", async () => {
    const { container } = await renderPlayer(plus, streamedError("insufficient_credits"));
    expect(container.textContent).toContain("Bu ayki seslendirme hakkın doldu.");
    expect(screen.getByRole("link", { name: "Ek paket al" }).getAttribute("href")).toBe("/paketler");
  });
});
