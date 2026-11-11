// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { makeRecordingDb } from "./helpers/recording-db";

/*
  11 Kasım 2026 (ürün sahibinin kararı): sınav sabahı kâğıdı Plus'a özel; ücretsiz hesapta ilk dersin temel döngüsü
  süre sınırı olmadan açık, Plus'a özel olanlar adıyla söylenir.

   - Sayfa kapısı: kâğıt kredi işi olmadığı için karar sayfada (`plusOnlyLocked`). Ücretsiz hesapta kâğıt hiç
     yüklenmez, yükseltme ekranı açılır; Plus, Plus denemesi ve önizlemesi kapalı kurucu görür; "ücretsiz gibi gör"
     önizlemesindeki kurucu ücretsizdir.
   - Hazırlık sayfasındaki düğme ücretsizde "Plus" rozeti taşır ve kapıyı yerinde açar.
   - Metinler tek kaynaktan (`free-tier-copy.ts`) ve gerçek kapılarla aynı listeyi söyler.
*/

const h = vi.hoisted(() => ({
  db: null as unknown,
  loadCramSheet: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  push: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));
h.loadCramSheet = vi.fn(async () => ({ sections: [], weakSpots: [], focusTopics: [], itemCount: 0, empty: true }));
h.push = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireStudentArea: async () => ({ supabase: h.db, user: { id: USER, email: "ogrenci@example.com" } }),
}));
vi.mock("@/lib/student/parity-shell-props", () => ({ loadParityShellProps: async () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => h.db, createClient: async () => h.db }));
vi.mock("@/lib/learning/cram-sheet-load", () => ({ loadCramSheet: (...args: unknown[]) => (h.loadCramSheet as (...a: unknown[]) => unknown)(...args) }));
vi.mock("@/components/parity/sor-shell", () => ({
  ParitySorShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

import CramSheetPage from "@/app/deneme-sinavlari/[prepId]/sinav-sabahi/page";
import { PrepShareTools } from "@/components/parity/prep-share-tools";
import { plusOnlyLocked } from "@/lib/billing/node-free-meter";
import { FREE_LIMITS, FREE_TIER_SENTENCE, PLUS_ONLY_NODE_KINDS, isPlusOnlyAction } from "@/lib/billing/free-meters";
import {
  FIRST_LESSON_STEPS,
  FREE_FIRST_LESSON_SENTENCE,
  FREE_PAGE_TOTAL,
  FREE_PREP_LIMIT,
  PLUS_ONLY_FEATURES,
  PLUS_ONLY_SENTENCE,
} from "@/lib/billing/free-tier-copy";
import { tierComparisonRows } from "@/lib/billing/tier-presentation";
import { beyondFreeMessage } from "@/lib/billing/free-reach";
import { CRAM_SHEET_NAME, CRAM_SHEET_TITLE, examPrepCramSheetHref } from "@/lib/learning/cram-sheet";
import { FAQ } from "@/lib/marketing/landing-content";
import { homeLine } from "@/lib/companion/voice";
import { renderWelcomeMail } from "@/lib/email/lifecycle-templates";

const USER = "00000000-0000-4000-8000-00000000aaaa";
const PREP = "00000000-0000-4000-8000-0000000000a1";
const read = (path: string) => readFileSync(path, "utf8");
const lower = (text: string) => text.toLocaleLowerCase("tr");

type Account = "free" | "plus" | "trial" | "founder" | "preview";

/** Hesap türüne göre abonelik, yönetici rolü ve önizleme satırı. */
function service(account: Account) {
  const plusRow = (extra: Record<string, unknown> = {}) => ({
    user_id: USER,
    status: "active",
    current_period_end: "2099-01-01T00:00:00.000Z",
    cancel_at_period_end: false,
    plans: { is_premium: true, tier: "plus", name: "Plus", slug: "plus-aylik", monthly_allowance: 7200 },
    ...extra,
  });
  const tables: Record<string, Record<string, unknown>[]> = {
    exam_preps: [{ id: PREP, user_id: USER, title: "Anatomi", exam_type: "universite", exam_date: null, target_score: 70 }],
    subscriptions: account === "plus" ? [plusRow()] : account === "trial" ? [plusRow({ trial_until: "2099-01-01T00:00:00.000Z" })] : [],
    admin_free_preview:
      account === "preview" ? [{ user_id: USER, started_at: "2026-11-01T00:00:00.000Z", remaining: 0, period_ends_at: "2099-01-01T00:00:00.000Z" }] : [],
  };
  const admin = account === "founder" || account === "preview";
  return makeRecordingDb(tables, { timeline: [], rpc: (name) => (name === "is_admin" ? { data: admin } : undefined) }).client;
}

async function openPage(account: Account) {
  h.db = service(account);
  render(await CramSheetPage({ params: Promise.resolve({ prepId: PREP }) }));
}

beforeEach(() => {
  h.loadCramSheet.mockClear();
  h.push.mockClear();
});
afterEach(() => cleanup());

describe("sınav sabahı kâğıdı: sayfa kapısı", () => {
  it("ücretsiz hesapta kâğıt yüklenmez; yükseltme ekranı açılır, kapanınca hazırlığa dönülür", async () => {
    await openPage("free");
    expect(h.loadCramSheet).not.toHaveBeenCalled();
    expect(screen.getByTestId("plus-only-gate")).toBeTruthy();
    expect(document.querySelector("#cram-title")).toBeNull();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(`${CRAM_SHEET_NAME} Plus'ta.`);
    // Beklemek çözmez: geri sayım ve yenilenme saati yok.
    expect(dialog.textContent).not.toMatch(/yenilen/i);
    const upgrade = dialog.querySelector('a[href^="/pay"]')!;
    expect(decodeURIComponent(upgrade.getAttribute("href")!)).toContain(examPrepCramSheetHref(PREP));
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(h.push).toHaveBeenCalledWith(`/deneme-sinavlari/${PREP}`);
  });

  it("Plus, Plus denemesi ve kurucu kâğıdı görür", async () => {
    for (const account of ["plus", "trial", "founder"] as const) {
      await openPage(account);
      expect(h.loadCramSheet, account).toHaveBeenCalledTimes(1);
      expect(document.querySelector("#cram-title")?.textContent, account).toBe(CRAM_SHEET_TITLE);
      expect(screen.queryByTestId("plus-only-gate"), account).toBeNull();
      cleanup();
      h.loadCramSheet.mockClear();
    }
  });

  it("'ücretsiz gibi gör' önizlemesindeki kurucu ücretsiz hesap gibi kilitlidir", async () => {
    await openPage("preview");
    expect(h.loadCramSheet).not.toHaveBeenCalled();
    expect(screen.getByTestId("plus-only-gate")).toBeTruthy();
  });

  it("karar yolun Plus adımlarıyla aynı işlevden; okuma düşerse kilit yok", async () => {
    expect(await plusOnlyLocked(service("free"), USER)).toBe(true);
    expect(await plusOnlyLocked(service("plus"), USER)).toBe(false);
    expect(await plusOnlyLocked(service("founder"), USER)).toBe(false);
    expect(await plusOnlyLocked(service("preview"), USER)).toBe(true);
    const broken = { from: () => { throw new Error("db down"); }, rpc: async () => { throw new Error("db down"); } };
    expect(await plusOnlyLocked(broken as never, USER)).toBe(false);
  });

  it("sayfa kâğıdı kapıdan sonra yükler; Suspense ve istemci modülünden fonksiyon yok", () => {
    const page = read("src/app/deneme-sinavlari/[prepId]/sinav-sabahi/page.tsx");
    expect(page.indexOf("plusOnlyLocked(service, user.id)")).toBeGreaterThan(0);
    expect(page.indexOf("plusOnlyLocked(service, user.id)")).toBeLessThan(page.indexOf("loadCramSheet(service"));
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).not.toMatch(/<Suspense/);
    // İstemci dosyasından yalnız bileşen (JSX) alınır; fonksiyon çağrısı saf modüllerden.
    expect(read("src/lib/learning/cram-sheet.ts")).not.toMatch(/^"use client"/);
    expect(read("src/lib/billing/node-free-meter.ts")).not.toMatch(/^"use client"/);
  });
});

describe("hazırlık sayfasındaki düğme", () => {
  it("ücretsizde 'Plus' rozeti taşır ve yükseltme ekranını yerinde açar; adres durur", () => {
    render(<PrepShareTools prepId={PREP} inviteUrl={null} whatsappHref={null} cramSheetLocked />);
    const link = screen.getByText(CRAM_SHEET_TITLE).closest("a")!;
    expect(link.getAttribute("href")).toBe(examPrepCramSheetHref(PREP));
    expect(screen.getByTestId("cram-sheet-plus").textContent).toBe("Plus");
    expect(link.getAttribute("aria-label")).toBe(`${CRAM_SHEET_NAME}, Plus'ta`);
    expect(screen.queryByRole("dialog")).toBeNull();
    const click = fireEvent.click(link);
    // preventDefault: sayfaya gidilmez.
    expect(click).toBe(false);
    expect(screen.getByRole("dialog").textContent).toContain(`${CRAM_SHEET_NAME} Plus'ta.`);
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Plus'ta rozet ve kapı yok; bağlantı kâğıda gider", () => {
    render(<PrepShareTools prepId={PREP} inviteUrl={null} whatsappHref={null} />);
    const link = screen.getByText(CRAM_SHEET_TITLE).closest("a")!;
    expect(screen.queryByTestId("cram-sheet-plus")).toBeNull();
    expect(link.getAttribute("aria-label")).toBeNull();
    expect(fireEvent.click(link)).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hazırlık sayfası kilidi yolun Plus adımlarıyla aynı okumadan verir", () => {
    const page = read("src/app/deneme-sinavlari/[prepId]/page.tsx");
    expect(page).toContain("cramSheetLocked: skipKinds.size > 0");
    expect(read("src/components/parity/exam-prep-home.tsx")).toContain("cramSheetLocked={shareTools?.cramSheetLocked ?? false}");
  });
});

describe("metinler gerçek davranışı söyler", () => {
  it("tek cümle: ilk dersin adımları süre sınırı olmadan ücretsiz; 'sınırsız' denmez", () => {
    expect([...FIRST_LESSON_STEPS]).toEqual(["Konu Anlatımı", "Kartlar", "Doğru/Yanlış", "Konu Testi"]);
    expect(FREE_FIRST_LESSON_SENTENCE).toBe(
      "İlk hazırlığında ilk dersin (Konu Anlatımı + Kartlar + Doğru/Yanlış + Konu Testi) süre sınırı olmadan ücretsiz.",
    );
    expect(PLUS_ONLY_SENTENCE).toBe("Podcast, Video, Sözlü, Yazılı Deneme ve Sınav Sabahı Kâğıdı Plus'a özeldir.");
    for (const line of [FREE_FIRST_LESSON_SENTENCE, PLUS_ONLY_SENTENCE, FREE_TIER_SENTENCE]) {
      expect(lower(line)).not.toContain("sınırsız");
      expect(lower(line)).not.toContain("kredi");
    }
  });

  it("Plus'a özel listedeki her madde gerçekten kilitli", () => {
    const locks: Record<(typeof PLUS_ONLY_FEATURES)[number], () => boolean> = {
      Podcast: () => isPlusOnlyAction("PODCAST_GENERATE") && PLUS_ONLY_NODE_KINDS.has("podcast"),
      Video: () => isPlusOnlyAction("VIDEO_GENERATE") && isPlusOnlyAction("SKETCH_VIDEO_GENERATE"),
      Sözlü: () => isPlusOnlyAction("ORAL_EXAM_GENERATE") && PLUS_ONLY_NODE_KINDS.has("oral"),
      "Yazılı Deneme": () => isPlusOnlyAction("PRACTICE_EXAM_GENERATE") && PLUS_ONLY_NODE_KINDS.has("written_exam"),
      // Kredi işi değil: kapısı sayfada (yukarıdaki testler).
      "Sınav Sabahı Kâğıdı": () => read("src/app/deneme-sinavlari/[prepId]/sinav-sabahi/page.tsx").includes("plusOnlyLocked("),
    };
    expect(Object.keys(locks).sort()).toEqual([...PLUS_ONLY_FEATURES].sort());
    for (const feature of PLUS_ONLY_FEATURES) expect(locks[feature](), feature).toBe(true);
    // İlk dersin adımları Plus'a özel değil.
    for (const code of ["STUDY_PLAN_GENERATE", "FLASHCARD_GENERATE", "QUIZ_GENERATE"] as const) expect(isPlusOnlyAction(code), code).toBe(false);
  });

  it("ücretsiz hesabın cümlesi öbür gerçekleri sabitlerden söyler", () => {
    expect(FREE_TIER_SENTENCE).toContain("süre sınırı olmadan açık");
    expect(FREE_TIER_SENTENCE).toContain(`haftada ${FREE_LIMITS.lesson} ders hakkı`);
    expect(FREE_TIER_SENTENCE).toContain(`günde ${FREE_LIMITS.chat} sohbet mesajı`);
    expect(FREE_TIER_SENTENCE).toContain(`günde ${FREE_LIMITS.photo} fotoğraftan soru çözümü`);
    expect(beyondFreeMessage(CRAM_SHEET_NAME)).toBe(
      `${CRAM_SHEET_NAME} Plus'ta. Ücretsiz hesapta ${lower(FREE_TIER_SENTENCE.charAt(0))}${FREE_TIER_SENTENCE.slice(1)} açık.`,
    );
  });

  it("fiyat tablosu: ilk ders satırı, sınav sabahı kâğıdı Plus'ta, sayılar sabitlerden", () => {
    const rows = tierComparisonRows();
    const firstLesson = rows.find((row) => row.label.startsWith("İlk hazırlıkta ilk ders"))!;
    expect(firstLesson.label).toContain(FIRST_LESSON_STEPS.join(" + "));
    expect(firstLesson.free).toBe("Süre sınırı olmadan ücretsiz");
    expect(firstLesson.plus).toBe("Bütün konular açık");
    expect(rows.find((row) => row.label === "Sınav sabahı kâğıdı")).toMatchObject({ free: "Plus'ta", plus: "Açık", sigma: "Açık" });
    expect(rows.find((row) => row.label === "Podcast, sözlü ve yazılı deneme")?.free).toBe("Plus'ta");
    expect(rows.find((row) => row.label === "AI kullanımı")?.free).toBe(
      `Haftada ${FREE_LIMITS.lesson} ders, günde ${FREE_LIMITS.chat} mesaj, günde ${FREE_LIMITS.photo} fotoğraf`,
    );
    expect(rows.find((row) => row.label === "Sınav hazırlığı")?.free).toBe(String(FREE_PREP_LIMIT));
    expect(rows.find((row) => row.label === "Belge işleme")?.free).toBe(`Toplam ${FREE_PAGE_TOTAL} sayfa`);
    // Elle yazılmış sayı kalmadı.
    expect(read("src/lib/billing/tier-presentation.ts")).not.toContain('"Haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf"');
  });

  it("fiyat ve abonelik sayfasının açıklaması iki cümleyi tek kaynaktan alır", () => {
    for (const path of ["src/app/fiyatlandirma/page.tsx", "src/components/marketing/premium-plan-hero.tsx"]) {
      const source = read(path);
      expect(source, path).toContain("${FREE_FIRST_LESSON_SENTENCE} ${PLUS_ONLY_SENTENCE}");
      expect(source, path).not.toContain("Ücretsiz plandaki her şey ve: Plus aylık geniş hak");
      expect(source, path).not.toContain("ücretsiz planda da açık");
    }
    expect(read("src/app/ozellikler/page.tsx")).toContain("Kart istemiyoruz. {FREE_FIRST_LESSON_SENTENCE}");
    expect(read("src/app/krediler/page.tsx")).toContain("${PLUS_ONLY_SENTENCE}");
    expect(read("src/app/yardim/page.tsx")).toContain("${PLUS_ONLY_SENTENCE}");
  });

  it("SSS: 'Ücretsiz neler yapabilirim?' ve 'Plus'ta ne değişiyor?' Plus'a özel her maddeyi adıyla söyler", () => {
    const free = FAQ.find((item) => item.q === "Ücretsiz neler yapabilirim?")!.a;
    const plus = FAQ.find((item) => item.q === "Plus'ta ne değişiyor?")!.a;
    expect(free).toContain(`${lower(FREE_TIER_SENTENCE.charAt(0))}${FREE_TIER_SENTENCE.slice(1)}`);
    expect(free).toContain(`toplam ${FREE_PAGE_TOTAL} sayfa belge`);
    expect(free).toContain("Bir sınav hazırlığı");
    for (const feature of PLUS_ONLY_FEATURES) {
      expect(lower(free), feature).toContain(lower(feature));
      expect(lower(plus), feature).toContain(lower(feature));
    }
    for (const answer of [free, plus]) expect(lower(answer)).not.toContain("sınırsız ders");
  });

  it("hoş geldin e-postası ücretsiz hesabı aynı cümlelerle anlatır", () => {
    const mail = renderWelcomeMail({
      firstName: null,
      via: "google",
      needsVerification: false,
      exam: null,
      next: null,
      ctaUrl: "https://cortexplus.app/ogretmen",
      createUrl: "https://cortexplus.app/deneme-sinavlari/olustur",
      solveUrl: "https://cortexplus.app/soru-coz",
    });
    expect(mail.text).toContain(FREE_FIRST_LESSON_SENTENCE.replace(/\.$/, ""));
    expect(mail.text).toContain(PLUS_ONLY_SENTENCE);
    expect(mail.text).toContain(`Haftada ${FREE_LIMITS.lesson} ders hakkı`);
    expect(mail.text).not.toContain("1. konusu tamamen açık");
  });

  it("sınav günü satırı kilitli hesaba kâğıdı önermez", () => {
    const signals = { firstName: null, mood: null, streak: 0, daysSinceLast: 0, examDaysLeft: 0, hour: 9, seed: "2026-11-11" };
    expect(homeLine(signals).text).toContain("sınav sabahı kâğıdıyla");
    const locked = homeLine({ ...signals, cramSheetLocked: true });
    expect(locked.reason).toBe("exam_day");
    expect(lower(locked.text)).not.toContain("kâğıd");
    expect(read("src/app/ogretmen/page.tsx")).toContain("cramSheetLocked: account?.showsUpgradeChrome === true");
  });
});
