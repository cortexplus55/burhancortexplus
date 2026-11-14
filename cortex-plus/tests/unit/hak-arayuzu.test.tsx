// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StudentShellProvider } from "@/lib/student/student-shell-context";
import { EntitlementUiProvider } from "@/components/entitlements/entitlement-ui";
import { Gate, gateCounter, lockLabel } from "@/components/entitlements/gate";
import { MessageQuota } from "@/components/entitlements/message-quota";
import { UsageRow, usageLine } from "@/components/entitlements/usage-row";
import { KNOWN_ACTIONS, payHref, resetDay, resetLeft, sheetContent, sheetReasonFor, type PlanPrices } from "@/lib/entitlements/sheet-copy";
import type { StudentAccountContext } from "@/lib/student/account-context";

/*
  Faz 3B: <Gate> üç durum, yükseltme penceresinin altı nedeni (metinler ANA-PROMPT tablosundan, sayılar
  yapılandırmadan), `from` beyaz listesi, öğretmen çubuğunun hak göstergesi, profildeki Kullanım satırı ve sohbette
  402 sonrası metnin korunması.
*/

vi.mock("next/navigation", () => ({
  usePathname: () => "/ogretmen",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
Element.prototype.scrollIntoView = vi.fn();
window.matchMedia = vi.fn().mockReturnValue({ matches: false });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PRICES: PlanPrices = { plusMonthly: 59900, plusWeekly: 34900, sigmaMonthly: 199900 };
const NOW = new Date("2026-11-14T12:00:00+03:00");
const MIDNIGHT = "2026-11-14T21:00:00.000Z";

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
    freeMeters: [
      { meter: "chat", used: 1, limit: 3, resetsAtIso: MIDNIGHT },
      { meter: "photo", used: 0, limit: 1, resetsAtIso: MIDNIGHT },
    ],
    ...over,
  };
}
const plus = (usedPercent: number) =>
  account({
    audience: "plus",
    isPremium: true,
    showsUpgradeChrome: false,
    subscriptionBadge: "Plus",
    planSlug: "plus-aylik",
    subscriptionAllowance: 7200,
    quotaAllowance: 7200,
    quotaRemaining: Math.round(7200 * (1 - usedPercent / 100)),
    usedPercent,
    periodKind: "monthly",
    resetsAtIso: "2026-12-12T00:00:00.000Z",
    freeMeters: undefined,
  });

function withShell(ui: React.ReactNode, acc: StudentAccountContext, firstLesson: "open" | "done" | null = "open") {
  return render(
    <StudentShellProvider account={acc}>
      <EntitlementUiProvider prices={PRICES} firstLesson={firstLesson} examDaysLeft={5}>
        {ui}
      </EntitlementUiProvider>
    </StudentShellProvider>,
  );
}

describe("<Gate> üç durum", () => {
  it("açık: işaret yok, tıklama aynen", () => {
    const onClick = vi.fn();
    withShell(
      <Gate action="podcast.create" asChild>
        <button type="button" onClick={onClick}>
          Podcast
        </button>
      </Gate>,
      plus(10),
    );
    const button = screen.getByRole("button", { name: "Podcast" });
    expect(button.getAttribute("aria-haspopup")).toBeNull();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("sınırlı: günlük sayaç '2 kaldı', ekran okuyucuya '2 hak kaldı'", () => {
    withShell(
      <Gate action="teacher.message" asChild>
        <button type="button">Gönder</button>
      </Gate>,
      account(),
    );
    expect(screen.getByText("2 kaldı")).toBeTruthy();
    expect(screen.getByText("2 hak kaldı").className).toContain("sr-only");
  });

  it("sınırlı, 1 kaldı: uyarı tonu", () => {
    expect(gateCounter({ state: "limited", reason: "daily_messages_available", period: "day", remaining: 1, limit: 3 })).toEqual({ text: "1 kaldı", low: true });
    expect(gateCounter({ state: "limited", reason: "quota_ok", period: "month", remaining: 5000, limit: 7200 })).toBeNull();
  });

  it("kilitli: kilit + PLUS, soluk değil, basınca (fare ve Enter) pencere; tıklama işlemi çalışmaz; odak geri döner", async () => {
    const onClick = vi.fn();
    withShell(
      <Gate action="podcast.create" asChild>
        <button type="button" onClick={onClick}>
          Podcast
        </button>
      </Gate>,
      account(),
    );
    const button = screen.getByRole("button", { name: /Podcast/ });
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.textContent).toContain("PLUS");
    expect(screen.getByText("Plus gerekli").className).toContain("sr-only");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: "Podcast Plus ile açılır" });
    expect(dialog.textContent).toContain("Notlarından iki sesli, 5 dakikalık bir diyalog.");
    expect(dialog.textContent).toContain("Ada & Kerem · 5 dk");
    expect(screen.getByRole("link", { name: "Plus'a geç · ₺599 / ay" }).getAttribute("href")).toBe("/pay?plan=plus&from=podcast.create");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.keyDown(button, { key: "Enter" });
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Sigma ve Kurucu'ya pencere yok", () => {
    const sigma = account({ isPremium: true, subscriptionBadge: "Sigma", usedPercent: 100, quotaRemaining: 0, quotaAllowance: 60000, freeMeters: undefined, resetsAtIso: "2026-12-12T00:00:00.000Z" });
    withShell(
      <Gate action="lesson.create" asChild>
        <button type="button">Ders</button>
      </Gate>,
      sigma,
    );
    const button = screen.getByRole("button", { name: /Ders/ });
    expect(button.getAttribute("aria-haspopup")).toBeNull();
    expect(lockLabel({ state: "locked", reason: "quota_reset_wait" })).toBeNull();
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("yükseltme penceresi: altı neden", () => {
  const base = { prices: PRICES, now: NOW };
  it("free_first_lesson_used: Plus önerilen; sınav 14 gün içindeyse Sınav Haftası ikinci seçenek", () => {
    const near = sheetContent({ ...base, reason: "free_first_lesson_used", action: "lesson.create", examDaysLeft: 2 })!;
    expect(near.title).toBe("Yeni ders için Plus gerekli");
    expect(near.body[0]).toBe("Ücretsiz hakkın olan ilk ders kullanıldı. Plus'ta ayda yaklaşık 240 ders hazırlayabilirsin.");
    expect(near.options).toEqual([
      { plan: "plus", title: "Plus", note: null, price: "₺599 / ay", recommended: true },
      { plan: "week", title: "Sınav Haftası", note: "Sınavına 2 gün var", price: "₺349 / 7 gün" },
    ]);
    expect(near.primary).toEqual({ label: "Plus'a geç", href: "/pay?plan=plus&from=lesson.create", plan: "plus" });
    const far = sheetContent({ ...base, reason: "free_first_lesson_used", action: "lesson.create", examDaysLeft: 30 })!;
    expect(far.options).toHaveLength(1);
    expect(far.secondary).toBeUndefined();
  });
  it("feature_requires_plus: özellik cümlesi + birlikte açılanlar; tahtada olmayan eylemde genel şablon", () => {
    const oral = sheetContent({ ...base, reason: "feature_requires_plus", action: "oral.start" })!;
    expect(oral.title).toBe("Sözlü Plus ile açılır");
    expect(oral.body).toEqual([
      "Hocanın karşısındaymış gibi canlı sözlü; sesli ya da yazarak.",
      "Plus ile birlikte açılanlar: 1 dk video, sözlü sınav, yazılı deneme, sınav sabahı kağıdı.",
    ]);
    expect(oral.primary.label).toBe("Plus'a geç · ₺599 / ay");
    expect(sheetContent({ ...base, reason: "feature_requires_plus", action: "duel.start" })!.title).toBe("Bu özellik Plus ile açılır");
  });
  it("daily_messages_used: 3 / 3, yenilenme süresi, iki düğme", () => {
    const sheet = sheetContent({ ...base, reason: "daily_messages_used", action: "teacher.message", gate: { state: "locked", reason: "daily_messages_used", limit: 3, remaining: 0, resetAt: "2026-11-15T02:20:00+03:00" } })!;
    expect(sheet.title).toBe("Bugünkü 3 mesajın bitti");
    expect(sheet.body).toEqual(["Hakkın yarın yenilenir. Plus'ta ayda yaklaşık 2.400 mesaj var."]);
    expect(sheet.meter).toBe("3 / 3 kullanıldı");
    expect(sheet.reset).toBe("Yenilenme 14 sa 20 dk");
    expect(sheet.primary.label).toBe("Plus ile devam et");
    expect(sheet.secondary).toEqual({ label: "Yarın devam ederim" });
  });
  it("daily_photo_used", () => {
    const sheet = sheetContent({ ...base, reason: "daily_photo_used", action: "photo.solve", gate: { state: "locked", reason: "daily_photo_used", resetAt: MIDNIGHT } })!;
    expect(sheet.title).toBe("Bugünkü fotoğraf hakkın bitti");
    expect(sheet.body).toEqual(["Hakkın yarın yenilenir."]);
    expect(sheet.reset).toBe("Yenilenme 12 sa 0 dk");
  });
  it("plus_quota_90: yüzde, sıfırlanma günü, kalan ders, Sigma kartı", () => {
    const sheet = sheetContent({ ...base, reason: "plus_quota_90", action: "lesson.create", gate: { state: "limited", reason: "plus_quota_90", limit: 7200, remaining: 720, resetAt: "2026-12-12T00:00:00.000Z" } })!;
    expect(sheet.title).toBe("Aylık limitine yaklaşıyorsun");
    expect(sheet.figure).toBe("%90");
    expect(sheet.body).toEqual(["12 Aralık'ta sıfırlanır · yaklaşık 24 ders kaldı"]);
    expect(sheet.options[0]).toMatchObject({ plan: "sigma", note: "Ayda yaklaşık 2.000 ders", price: "₺1.999 / ay" });
    expect(sheet.primary).toMatchObject({ label: "Sigma'ya geç", href: "/pay?plan=sigma&from=lesson.create" });
    expect(sheet.secondary).toEqual({ label: "Sıfırlanmayı beklerim" });
  });
  it("plus_quota_100", () => {
    const sheet = sheetContent({ ...base, reason: "plus_quota_100", action: "teacher.message", gate: { state: "locked", reason: "plus_quota_100", resetAt: "2026-12-12T00:00:00.000Z" } })!;
    expect(sheet.title).toBe("Bu ayki hakkın doldu");
    expect(sheet.body).toEqual(["Yeni ders ve mesajlar 12 Aralık'ta açılır", "Daha önce hazırladığın dersler, kartlar ve testler açık kalır."]);
    expect(sheet.primary.label).toBe("Sigma'ya geç · ₺1.999 / ay");
  });
  it("çizili olmayanlar en yakın pencereye; bekleme, harcama sigortası ve derse dahil sınır pencere açmaz", () => {
    expect(sheetReasonFor("free_topic_limit")).toBe("free_first_lesson_used");
    expect(sheetReasonFor("free_prep_limit")).toBe("free_first_lesson_used");
    expect(sheetReasonFor("free_photo_abuse_limit")).toBe("daily_photo_used");
    for (const reason of ["spend_cap", "quota_reset_wait", "free_included_limit", "open", "quota_ok"] as const) {
      expect(sheetReasonFor(reason), reason).toBeNull();
    }
  });
  it("fiyat okunamazsa düğme fiyatsız", () => {
    const sheet = sheetContent({ reason: "feature_requires_plus", action: "podcast.create", prices: { plusMonthly: null, plusWeekly: null, sigmaMonthly: null } })!;
    expect(sheet.primary.label).toBe("Plus'a geç");
  });
});

describe("from beyaz listesi ve tarih biçimleri", () => {
  it("yalnız bilinen eylem adı; başka değer düşer", () => {
    expect(payHref("plus", "photo.solve")).toBe("/pay?plan=plus&from=photo.solve");
    expect(payHref("sigma", "https://kotu.example")).toBe("/pay?plan=sigma");
    expect(payHref("week", "lesson.create&x=1")).toBe("/pay?plan=week");
    expect(payHref("plus", null)).toBe("/pay?plan=plus");
    expect(KNOWN_ACTIONS).toHaveLength(9);
  });
  it("ay adının eki ve kalan süre", () => {
    expect(resetDay("2026-12-12T00:00:00.000Z")?.on).toBe("12 Aralık'ta");
    expect(resetDay("2026-09-03T00:00:00.000Z")?.on).toBe("3 Eylül'de");
    expect(resetDay("2026-04-05T00:00:00.000Z")?.on).toBe("5 Nisan'da");
    expect(resetLeft("2026-11-14T12:20:00+03:00", NOW)).toBe("20 dk");
  });
});

describe("öğretmen çubuğu ve Kullanım satırı", () => {
  it("ücretsizde '{N} mesaj kaldı'; Plus'ta çizilmez", () => {
    const { unmount } = withShell(<MessageQuota variant="inline" />, account());
    expect(screen.getByText("2 mesaj kaldı")).toBeTruthy();
    unmount();
    withShell(<MessageQuota variant="inline" />, plus(50));
    expect(screen.queryByText(/mesaj kaldı/)).toBeNull();
  });
  it("Kullanım: 'Bu ay %38 · 12 Aralık'ta sıfırlanır · Planın aktif'; Sınav Haftası haftalık; Kurucu'da yok", () => {
    expect(usageLine({ usedPercent: 38, resetsAtIso: "2026-12-12T00:00:00.000Z", periodKind: "monthly" })).toBe("Bu ay %38 · 12 Aralık'ta sıfırlanır · Planın aktif");
    expect(usageLine({ usedPercent: 10, resetsAtIso: "2026-11-17T00:00:00.000Z", periodKind: "weekly" })).toBe("Bu hafta %10 · 17 Kasım'da sıfırlanır · Planın aktif");
    const { unmount } = withShell(<UsageRow />, account({ isAdmin: true, isPremium: true, freeMeters: undefined }));
    expect(screen.queryByText(/Planın aktif/)).toBeNull();
    unmount();
  });
  it("Plus %90: satıra dokununca %90 penceresi (kullanıcı isteyince)", async () => {
    withShell(<UsageRow />, plus(90));
    fireEvent.click(screen.getByRole("button", { name: /Bu ay %90/ }));
    expect(await screen.findByRole("dialog", { name: "Aylık limitine yaklaşıyorsun" })).toBeTruthy();
  });
});

describe("sohbet: hak bitmişken gönderilen metin silinmez (402 yolu)", () => {
  it("free-exhausted: 402 + gate → yazılan metin geri, daily_messages_used penceresi", async () => {
    const { ChatPanel } = await import("@/components/chat/chat-panel");
    const exhausted = account({ freeMeters: [{ meter: "chat", used: 3, limit: 3, resetsAtIso: MIDNIGHT }] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/ai/chat")) {
          return new Response(
            JSON.stringify({ error: "x", code: "free_chat_limit", gate: { state: "locked", reason: "daily_messages_used", period: "day", limit: 3, remaining: 0, resetAt: MIDNIGHT, requiredPlan: "plus" } }),
            { status: 402, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    withShell(<ChatPanel variant="parity" composerMode="parity" hasDocuments={false} showSubjectPicker={false} placeholder="Sor, konuş veya dosya gönder" />, exhausted);
    const field = screen.getByPlaceholderText("Sor, konuş veya dosya gönder") as HTMLInputElement | HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Türev nedir?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
    expect(await screen.findByRole("dialog", { name: "Bugünkü 3 mesajın bitti" })).toBeTruthy();
    await waitFor(() => expect((screen.getByPlaceholderText("Sor, konuş veya dosya gönder") as HTMLInputElement).value).toBe("Türev nedir?"));
    expect(screen.queryByText("Türev nedir?", { selector: ".cp-sor-user, [data-role='user']" })).toBeNull();
  });
});
