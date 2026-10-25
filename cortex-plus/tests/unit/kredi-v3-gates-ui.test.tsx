// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { StudentAccountContext } from "@/lib/student/account-context";
import { StudentShellProvider } from "@/lib/student/student-shell-context";
import { CreditGate, freeGateReset } from "@/components/paywall/credit-gate";
import { countdownParts } from "@/components/paywall/upgrade-sheet";
import {
  ExamNodeSession,
  LESSON_PODCAST_GATE,
  VOICE_MODE_GATE,
  nodeGateForCode,
  type NodeGate,
} from "@/components/parity/exam-node-session";
import { chatGateProps } from "@/components/chat/chat-panel";
import { ReferralRewardCard } from "@/components/parity/referral-reward-card";
import { freeExtraLine, profilePlanView } from "@/lib/billing/tier-presentation";
import { freeLimitReachedLine, freeMeterResetsAt, type FreeMeterView } from "@/lib/billing/free-meters";
import type { ReferralSummary } from "@/lib/credits/referral";
import { PlusMonth } from "@/components/marketing/plus-month";
import { TEMPO_PRESETS, mixShare, tempoMix } from "@/lib/billing/plan-value";
import { possessiveSuffix } from "@/lib/text/number-suffix";

/*
  Kredi v3 incelemesi (24 Ekim 2026), arayüz bulguları:
  - #9/#18 Kapı sayaç bulamayınca ders sayacına düşüyor, Plus'taki işte (ders sonu "Şimdi dinle", sesli
    mod, yazılı deneme) ve derse dahil adımlarda Pazartesi'ye geri sayıyordu; düğüm 402'nin kodunu okumuyordu.
  - #10/#12 Soru-cevap sesli açılıyordu; ses ücretsizde Plus'ta.
  - #11/#15 Sohbette fotoğraf hakkı dolunca kapı "sohbet mesajı hakkın bitti" diyordu.
  - #19 Ders hakkının "Pazartesi 00:00" satırı geri sayım varken hiç çizilmiyor, sayım "142 saat" yazıyordu.
  - #13/#31 /krediler ücretsiz hesapta kredi yüzdesi ve "+%9000 ek paket" gösteriyordu.
  - #14/#26 Davet kartı kalkan çarpanı vaat ediyordu. #17/#32 Profil "günlük hak" ile Pazartesi'yi karıştırıyordu.
*/

vi.mock("next/navigation", () => ({
  usePathname: () => "/deneme-sinavlari/prep-1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
// Salı 27 Ekim 2026 12:00 İstanbul (09:00 UTC): ders hakkı Pazartesi 2 Kasım 00:00'da yenilenir.
const TUESDAY = new Date("2026-10-27T09:00:00Z");

function meters(now: Date): FreeMeterView[] {
  return (["lesson", "chat", "photo"] as const).map((meter) => ({
    meter,
    used: 3,
    limit: meter === "photo" ? 1 : 3,
    resetsAtIso: freeMeterResetsAt(meter, now).toISOString(),
  }));
}

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
    resetsAtLabel: "2 Kasım 2026 00:00",
    periodKind: "daily",
    usedPercent: 100,
    extraPercent: null,
    freeMeters: meters(TUESDAY),
    ...over,
  };
}

const inShell = (acc: StudentAccountContext, node: ReactNode) =>
  render(<StudentShellProvider account={acc}>{node}</StudentShellProvider>);

describe("kapının yenilenme saati (#18, #19)", () => {
  it("sayaç bilinmiyorsa saat de yok; ders sayacına düşülmez", () => {
    expect(freeGateReset(null, meters(TUESDAY), TUESDAY)).toBeNull();
    expect(freeGateReset(undefined, meters(TUESDAY), TUESDAY)).toBeNull();
  });

  it("ders Pazartesi 00:00, derse dahil adımlar gece yarısı (kabukta görünmese de)", () => {
    expect(freeGateReset("lesson", meters(TUESDAY), TUESDAY)).toEqual({
      hint: "Ders hakkın Pazartesi 00:00'da yenilenir.",
      resetsAt: "2026-11-01T21:00:00.000Z",
    });
    expect(freeGateReset("included", meters(TUESDAY), TUESDAY)).toEqual({
      hint: "Hakkın gece yarısı yenilenir.",
      resetsAt: "2026-10-27T21:00:00.000Z",
    });
  });

  it("geri sayım bir günden uzunsa gün ve saat; kısa sürede saat, dakika, saniye", () => {
    expect(countdownParts(5 * 86400 + 22 * 3600 + 59)).toEqual([
      { value: "5", unit: "gün" },
      { value: "22", unit: "saat" },
    ]);
    expect(countdownParts(4 * 3600 + 21 * 60)).toEqual([
      { value: "04", unit: "saat" },
      { value: "21", unit: "dk" },
      { value: "00", unit: "sn" },
    ]);
    expect(countdownParts(86400).map((part) => part.unit)).toEqual(["saat", "dk", "sn"]);
  });

  it("ders kapısı Pazartesi satırını ve günlü geri sayımı birlikte çizer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(TUESDAY);
    try {
      inShell(account(), <CreditGate open onOpenChange={() => undefined} message={freeLimitReachedLine("lesson")} meter="lesson" />);
      expect(screen.getByText("Ders hakkın Pazartesi 00:00'da yenilenir.")).toBeTruthy();
      expect(screen.getByText("Hakkın yenilenene kadar:")).toBeTruthy();
      expect(screen.getByText("gün", { exact: false })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sayaçsız kapı (kurulum, belge) geri saymaz", () => {
    inShell(account(), <CreditGate open onOpenChange={() => undefined} message="Materyali işlemek için kullanım hakkın doldu." />);
    expect(screen.queryByText("Hakkın yenilenene kadar:")).toBeNull();
    expect(screen.queryByText(/yenilenir/)).toBeNull();
  });

  it("sesli mod ve yazılı deneme Plus'ta: 'doldu' yok, geri sayım yok", () => {
    inShell(account(), <CreditGate open onOpenChange={() => undefined} message="Sesli ders için kullanım hakkın doldu." action="VOICE_TURN" actionLabel="Sesli mod" />);
    expect(screen.getByText(/Sesli mod Plus'ta\. Ücretsiz hesapta/)).toBeTruthy();
    expect(screen.queryByText("Hakkın yenilenene kadar:")).toBeNull();
    cleanup();
    inShell(account(), <CreditGate open onOpenChange={() => undefined} message="x" action="PRACTICE_EXAM_GENERATE" actionLabel="Yazılı deneme" />);
    expect(screen.getByText(/Yazılı deneme Plus'ta/)).toBeTruthy();
    expect(screen.queryByText("Hakkın yenilenene kadar:")).toBeNull();
  });

  it("kapılar doğru sayaç ya da iş koduyla çağrılıyor", () => {
    expect(read("src/components/parity/exam-node-coach.tsx")).toContain('meter="included"');
    expect(read("src/components/parity/exam-intro-quiz.tsx")).toContain('meter="included"');
    // "Anlatarak öğren" Araçlar kartı: mesaj hakkından (karar #8).
    expect(read("src/components/learning/studio/explain-studio.tsx")).toContain('meter="chat"');
    const written = read("src/components/learning/studio/written-studio.tsx");
    expect(written).toContain('action="PRACTICE_EXAM_GENERATE"');
    const voice = read("src/components/parity/exam-voice-tutor.tsx");
    expect(voice.match(/action="VOICE_TURN"/g)).toHaveLength(2);
    // Araçlar'daki test, kartlar, doğru/yanlış dersten düşer: stüdyo kapısının varsayılanı ders sayacı.
    expect(read("src/components/learning/studio/studio-shared.tsx")).toContain('meter ?? (action ? undefined : "lesson")');
  });
});

describe("düğüm kapısı 402'nin kodunu okur (#9, #18)", () => {
  const base: NodeGate = { message: freeLimitReachedLine("lesson"), beyondFreeDaily: false, meter: "lesson" };

  it("ders hakkı, derse dahil sınır, Plus'taki iş", () => {
    expect(nodeGateForCode("free_lesson_limit", base, false)).toMatchObject({ meter: "lesson", beyondFreeDaily: false });
    const included = nodeGateForCode("free_included_limit", base, false);
    expect(included).toMatchObject({ meter: "included", beyondFreeDaily: false });
    expect(included.message).not.toMatch(/\d/);
    expect(nodeGateForCode("premium_required", base, false)).toMatchObject({ beyondFreeDaily: true });
    expect(nodeGateForCode("insufficient_credits", base, false)).toBe(base);
    expect(nodeGateForCode("free_lesson_limit", base, true)).toBe(base);
  });

  it("ders sonu 'Şimdi dinle' ve sesli mod Plus kapısı", () => {
    expect(LESSON_PODCAST_GATE).toMatchObject({ action: "PODCAST_GENERATE", actionLabel: "Sesli tekrar", beyondFreeDaily: true });
    expect(VOICE_MODE_GATE).toMatchObject({ action: "VOICE_TURN", actionLabel: "Sesli mod", beyondFreeDaily: true });
    const session = read("src/components/parity/exam-node-session.tsx");
    expect(session).toContain('data.code === "premium_required" ? LESSON_PODCAST_GATE : gateCopy');
  });

  it("konu testinde 402 free_included_limit: günlük adım cümlesi ve gece yarısı", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "x", code: "free_included_limit" }), { status: 402 }))),
    );
    inShell(
      account(),
      <ExamNodeSession prepId="prep-1" nodeId="node-1" kind="quiz" prepTitle="AYT Biyoloji" topicLabel="Hücre" todayMood="ready" initialFamiliarity="basics" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Testi oluştur" }));
    await waitFor(() => expect(screen.getByText(/Bugün çok sayıda çalışma adımı açtın/)).toBeTruthy());
    expect(screen.getByText("Hakkın gece yarısı yenilenir.")).toBeTruthy();
    expect(screen.queryByText(/Pazartesi/)).toBeNull();
  });
});

describe("Soru-cevap ücretsizde yazılı başlar (#10, #12)", () => {
  const renderQa = (acc: StudentAccountContext) =>
    inShell(
      acc,
      <ExamNodeSession prepId="prep-1" nodeId="node-1" kind="qa" prepTitle="AYT Biyoloji" topicLabel="Hücre" todayMood="ready" initialFamiliarity="basics" />,
    );

  it("ücretsiz hesapta sesli mod kapalı ve 'Plus'ta' yazıyor; açmak Plus kapısını açar", () => {
    renderQa(account());
    const toggle = screen.getByRole("checkbox") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.getByText(/Plus'ta · ücretsiz hesapta yazarak sorarsın/)).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(screen.getByText(/Sesli mod Plus'ta\. Ücretsiz hesapta/)).toBeTruthy();
    expect(screen.queryByText("Hakkın yenilenene kadar:")).toBeNull();
  });

  it("Plus'ta sesli mod açık başlar", () => {
    renderQa(account({ audience: "plus", isPremium: true, freeMeters: undefined }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Yazmak yerine konuş")).toBeTruthy();
  });
});

describe("sohbet kapısı dolan sayacı söyler (#11, #15)", () => {
  it("fotoğraf, mesaj, Plus'taki iş, abone", () => {
    expect(chatGateProps("free_photo_limit", false)).toEqual({
      message: freeLimitReachedLine("photo"),
      meter: "photo",
      action: "IMAGE_SOLUTION",
    });
    expect(chatGateProps("free_chat_limit", false)).toMatchObject({ message: freeLimitReachedLine("chat"), meter: "chat" });
    expect(chatGateProps(null, false)).toMatchObject({ meter: "chat" });
    expect(chatGateProps("premium_required", false)).toMatchObject({ beyondFreeDaily: true });
    expect(chatGateProps("free_photo_limit", true)).toEqual({ message: "Kullanım hakkın doldu. Çalışman kayıtlı kalır." });
  });

  it("iki kapı da kodu kullanıyor; kod 402 gövdesinden ve çözüm akışından okunuyor", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel.match(/\{\.\.\.chatGateProps\(paywallCode, gatePremium\)\}/g)).toHaveLength(2);
    expect(panel).toContain("const gatePremium = isPremium ?? shellAccount?.isPremium ?? false;");
    expect(panel).toContain("setPaywallCode(event.code);");
    expect(panel).toContain('setPaywallCode(typeof payload.code === "string" ? payload.code : null);');
  });
});

describe("profil ve /krediler ücretsiz hesapta sayaç anlatır (#13, #17, #31, #32)", () => {
  it("profil ipucu dönem türünü yok sayar", () => {
    for (const periodKind of ["daily", "weekly", "monthly"] as const) {
      expect(
        profilePlanView({ audience: "free", resetsAtLabel: "2 Kasım 2026 00:00", periodKind, subscriptionPeriodEnd: null })?.hint,
      ).toBe("Ücretsiz plan · haftada 3 ders, günde 3 mesaj · Ders hakkın Pazartesi 00:00'da yenilenir.");
    }
  });

  // Bakiye her zaman hediye değil (eski ek paket, promosyon): yazı tarafsız, "Ek hakkın".
  it("cüzdan bakiyesi işle anlatılır, kredi sayısı yazılmaz", () => {
    expect(freeExtraLine(90)).toBe("Ek hakkın: yaklaşık 3 ders");
    expect(freeExtraLine(20)).toBe("Ek hakkın: yaklaşık 6 mesaj");
    expect(freeExtraLine(2)).toBeNull();
    expect(freeExtraLine(0)).toBeNull();
  });

  it("/krediler: ücretsizde kredi kartı ve ek paket yüzdesi yok, sayaçlar ana kartta", () => {
    const page = read("src/app/krediler/page.tsx");
    expect(page).toContain("{isPremium ? (");
    expect(page).toContain("freeMeterResetLine(meter.meter)");
    expect(page).toContain("Podcast, sözlü ve yazılı deneme, video Plus'ta.");
    expect(page).toContain('"Belge sayfaları"');
    // Ana karttaki sayaç satırları aşağıda tekrar edilmez; anahtarlar usage-limits.ts ile aynı.
    const limits = read("src/lib/student/usage-limits.ts");
    for (const key of ["weekly-lessons", "daily-chat", "daily-photos"]) {
      expect(limits).toContain(`key: "${key}"`);
      expect(page).toContain(`"${key}"`);
    }
    // Ek paket satırı yalnız abone kartında.
    expect(page.indexOf("+%{extraPercent}")).toBeLessThan(page.indexOf(") : ("));
  });
});

describe("Plus kartının yüzde eki (#33)", () => {
  it("ana ekran kartı yüzdeye uyan eki yazar", () => {
    const preset = TEMPO_PRESETS.find((item) => item.id === "sinav-ayi")!;
    const share = Math.round(mixShare(tempoMix(preset.tempo)) * 100);
    const { container } = render(<PlusMonth variant="compact" monthlyKurus={null} primary={{ label: "Plus'a geç", href: "/pay" }} />);
    const title = container.querySelector(".pm-card-title")?.textContent ?? "";
    expect(title).toContain(`hakkının %${share}${possessiveSuffix(share)}.`);
  });
});

describe("davet kartı bir kezlik hediyeyi anlatır (#14, #26)", () => {
  const summary: ReferralSummary = {
    available: true,
    usedCount: 1,
    maxCount: 3,
    subscribedCount: 0,
    multiplier: 3,
    isInvitee: false,
    signupMultiplier: 3,
    subscribedMultiplier: 10,
    giftsGranted: 1,
    giftReceived: false,
    giftsKnown: true,
  };

  it("başlık, rozet ve adımlarda çarpan yok", () => {
    render(<ReferralRewardCard summary={summary} inviteUrl="https://cortexplus.app/kayit?davet=x" />);
    expect(screen.getByRole("heading", { name: "Arkadaşını davet et, ikinize de 3 ders hediye" })).toBeTruthy();
    expect(screen.getByText("1/3 davet hediyesi")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nasıl çalışır?" }));
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/katına|katlan|çarpan|10 kat/);
    expect(text).toContain("en çok 3 davet");
  });
});
