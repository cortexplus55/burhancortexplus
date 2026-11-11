// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PlusCountsInline, PlusMonth } from "@/components/marketing/plus-month";
import {
  PLAN_WORK,
  PLAN_WORK_BY_ID,
  PODCAST_WITH_AUDIO_CREDITS,
  TEMPO_PRESETS,
  freeDaysFor,
  freeMonthlyCount,
  freeVsPlusRows,
  mixShare,
  perDayKurus,
  tempoMix,
  workCount,
} from "@/lib/billing/plan-value";
import { AUDIO_CHARS_PER_CREDIT_PRICE, CREDIT_PRICE_TABLE, PLAN_ALLOWANCES } from "@/lib/credits/price-table";
import { FREE_CHAT_PER_DAY, FREE_LIMITS, FREE_PHOTO_PER_DAY, isPlusOnlyAction, needsPlusOutsideFirstLesson } from "@/lib/billing/free-meters";
import type { ActionCode } from "@/lib/env";

/*
  20 Ekim 2026, ürün sahibi: "plus alan biri bütün bir plus hesabıyla neler yapabilir … kaç adet
  kullanabilir … misafir ekranına ve kayıtlı ücretsiz kullanıcı ekranına dikkat çekici". Kural: her
  sayı kredi tablosundan hesaplanır; öğrenci kredi görmez; ücretsizde kapalı denen iş gerçekten
  ücretsiz hesapta açılmayan iş (24 Ekim 2026'dan beri açık liste: `PLUS_ONLY_ACTIONS`).
*/

afterEach(cleanup);

/** Her işin kredi kodu: "Ücretsizde kapalı" rozeti SQL'in `plus_only_action` listesiyle aynı olmalı. */
const WORK_ACTION: Record<string, ActionCode> = {
  lesson: "STUDY_PLAN_GENERATE",
  quiz: "QUIZ_GENERATE",
  cards: "FLASHCARD_GENERATE",
  podcast: "PODCAST_GENERATE",
  oral: "ORAL_EXAM_GENERATE",
  written: "PRACTICE_EXAM_GENERATE",
  photo: "IMAGE_SOLUTION",
  video: "VIDEO_GENERATE",
  chat: "AI_CHAT_STANDARD",
};
const fmt = (n: number) => new Intl.NumberFormat("tr-TR").format(n);

describe("Plus'ın bir ayı: sayılar kredi tablosundan", () => {
  it("her iş: hakkın tamamı o işe verilirse kaç tane", () => {
    const plus = PLAN_ALLOWANCES.plusMonthly;
    const counts = Object.fromEntries(PLAN_WORK.map((work) => [work.id, workCount(plus, work)]));
    expect(counts).toEqual({
      lesson: Math.floor(plus / CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits),
      quiz: Math.floor(plus / CREDIT_PRICE_TABLE.QUIZ_GENERATE.credits),
      cards: Math.floor(plus / CREDIT_PRICE_TABLE.FLASHCARD_GENERATE.credits),
      podcast: Math.floor(plus / PODCAST_WITH_AUDIO_CREDITS),
      oral: Math.floor(plus / CREDIT_PRICE_TABLE.ORAL_EXAM_GENERATE.credits),
      written: Math.floor(plus / CREDIT_PRICE_TABLE.PRACTICE_EXAM_GENERATE.credits),
      photo: Math.floor(plus / CREDIT_PRICE_TABLE.IMAGE_SOLUTION.credits),
      video: Math.floor(plus / CREDIT_PRICE_TABLE.VIDEO_GENERATE.credits),
      chat: Math.floor(plus / CREDIT_PRICE_TABLE.AI_CHAT_STANDARD.credits),
    });
    // Bugünkü değerler (kredi v3, 24 Ekim 2026): tablo değişirse bu satır da değişir, cümleler kendiliğinden.
    expect(counts).toEqual({
      lesson: 240,
      quiz: 720,
      cards: 1800,
      podcast: 100,
      oral: 1200,
      written: 480,
      photo: 1800,
      video: 25,
      chat: 2400,
    });
  });

  it("podcast sesiyle sayılır: senaryo + 5 dakikalık seslendirme", () => {
    const audioUnits = Math.ceil((5 * 88 * 7.5) / AUDIO_CHARS_PER_CREDIT_PRICE);
    expect(PODCAST_WITH_AUDIO_CREDITS).toBe(
      CREDIT_PRICE_TABLE.PODCAST_GENERATE.credits + audioUnits * CREDIT_PRICE_TABLE.AUDIO_SYNTHESIZE.credits,
    );
    expect(PODCAST_WITH_AUDIO_CREDITS).toBeGreaterThan(CREDIT_PRICE_TABLE.PODCAST_GENERATE.credits);
  });

  it("'Ücretsizde kapalı' tam olarak ücretsiz hesapta açılmayan işler; açık olanlar sayaçla", () => {
    for (const work of PLAN_WORK) {
      expect(work.plusOnly, work.id).toBe(isPlusOnlyAction(WORK_ACTION[work.id]!));
      if (work.plusOnly) expect(freeMonthlyCount(work), work.id).toBe(0);
    }
    // 11 Kasım 2026 akşamı (ürün sahibinin kararı): ücretsiz hesap = tek ders. "Ayda ~12 ders" artık yanlış: ders
    // yalnız ilk ders, test ve kartlar o derse dahil; günde 3 mesaj, günde 1 fotoğraf.
    expect(FREE_LIMITS.lesson).toBe(0);
    expect(PLAN_WORK_BY_ID.lesson.free).toBe("first");
    expect(freeMonthlyCount(PLAN_WORK_BY_ID.lesson)).toBe(1);
    expect(PLAN_WORK_BY_ID.quiz.free).toBe("included");
    expect(PLAN_WORK_BY_ID.cards.free).toBe("included");
    expect(freeMonthlyCount(PLAN_WORK_BY_ID.quiz)).toBe(1);
    // İlk dersin dışında Plus'a yönlenen işler: "first" / "included" tam olarak ders sayacına düşenler.
    for (const work of PLAN_WORK) {
      const lessonMetered = work.free === "first" || work.free === "included";
      expect(lessonMetered, work.id).toBe(!work.plusOnly && needsPlusOutsideFirstLesson(WORK_ACTION[work.id]!));
    }
    expect(freeMonthlyCount(PLAN_WORK_BY_ID.chat)).toBe(FREE_CHAT_PER_DAY * 30);
    expect(freeMonthlyCount(PLAN_WORK_BY_ID.photo)).toBe(FREE_PHOTO_PER_DAY * 30);
  });

  it("hazır tempolar Plus hakkına sığar ve gittikçe yoğunlaşır", () => {
    const shares = TEMPO_PRESETS.map((preset) => mixShare(tempoMix(preset.tempo)));
    for (const share of shares) {
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThanOrEqual(1);
    }
    expect([...shares].sort((a, b) => a - b)).toEqual(shares);
    // Ana ekran kartının cümlesi "sınav ayı" temposundan okunur (kredi v3: günde 2 ders, 3 test, haftada 5 podcast).
    const examMonth = TEMPO_PRESETS.find((preset) => preset.id === "sinav-ayi")!.tempo;
    expect(examMonth).toMatchObject({ lessonsPerDay: 2, quizzesPerDay: 3, podcastsPerWeek: 5 });
    // En yoğun tempo bile hakkın dörtte üçünü geçmez: öğrenci "yetmez" diye korkmasın.
    expect(Math.max(...shares)).toBeLessThan(0.75);
  });

  it("ücretsiz gün karşılığı: Plus'a özel iş ya da ilk dersin ötesi varsa yok, yoksa günlük sayaçlarla", () => {
    expect(freeDaysFor({ podcast: 1 })).toBeNull();
    // Ücretsiz hesap = tek ders: birden çok ders ya da dersin dışında test/kart ücretsizle yürümez.
    expect(freeDaysFor({ lesson: 30 })).toBeNull();
    expect(freeDaysFor({ lesson: 2 })).toBeNull();
    expect(freeDaysFor({ lesson: 3, quiz: 3 })).toBeNull();
    expect(freeDaysFor({ quiz: 1 })).toBeNull();
    expect(freeDaysFor({ lesson: 1, quiz: 1, cards: 1 })).toBe(1);
    // Mesaj günde 3, fotoğraf günde 1; en uzun süren sayaç belirler.
    expect(freeDaysFor({ chat: 9 })).toBe(3);
    expect(freeDaysFor({ photo: 2, chat: 3 })).toBe(2);
    // Hazır tempoların hepsi günde en az bir ders ister: hiçbiri ücretsizle yürümez.
    for (const preset of TEMPO_PRESETS) expect(freeDaysFor(tempoMix(preset.tempo)), preset.id).toBeNull();
  });

  it("ücretsiz–Plus satırları ve günlük fiyat", () => {
    const rows = freeVsPlusRows(fmt);
    expect(rows[0]).toEqual({ label: "Ders (ayda)", free: "İlk ders", plus: "240" });
    expect(rows[1]).toEqual({ label: "Konu testi (ayda)", free: "İlk derse dahil", plus: "720" });
    expect(rows.find((row) => row.label.startsWith("Podcast"))?.free).toBe("Kapalı");
    expect(perDayKurus(59900)).toBe(1997);
  });
});

describe("ekranda", () => {
  it("tam bölüm: dokuz iş, son sayılar, ayını kur, karşılaştırma; kredi kelimesi yok", () => {
    const { container } = render(
      <PlusMonth
        variant="full"
        monthlyKurus={59900}
        primary={{ label: "Plus ile başla", href: "/kayit?next=%2Fpay" }}
        secondary={{ label: "Önce ücretsiz dene", href: "/kayit" }}
      />,
    );
    expect(container.querySelectorAll(".pm-tile")).toHaveLength(9);
    expect(screen.getAllByText("240").length).toBeGreaterThan(0);
    expect(screen.getByText("Kendi ayını kur")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Plus ile başla/ }).getAttribute("href")).toBe("/kayit?next=%2Fpay");
    expect(container.textContent).toContain("Otomatik yenileme yok");
    // Yıllık plan 24 Ekim 2026'da satıştan kalktı.
    expect(container.textContent).not.toMatch(/yıllık/i);
    expect(container.textContent?.toLocaleLowerCase("tr")).not.toContain("kredi");
    expect(container.querySelectorAll(".pm-lock")).toHaveLength(PLAN_WORK.filter((work) => work.plusOnly).length);
  });

  it("ana ekran kartı ve yükseltme kapısının satırı", () => {
    const { container } = render(
      <>
        <PlusMonth variant="compact" monthlyKurus={null} primary={{ label: "Plus'a geç", href: "/pay" }} />
        <PlusCountsInline />
      </>,
    );
    expect(screen.getByRole("link", { name: /Plus'a geç/ }).getAttribute("href")).toBe("/pay");
    // Fiyat okunamadıysa günlük fiyat yazılmaz, sayfa düşmez.
    expect(container.textContent).not.toContain("Günde ₺");
    expect(container.textContent).toContain("25");
    expect(container.textContent?.toLocaleLowerCase("tr")).not.toContain("kredi");
  });
});

describe("nerede görünür", () => {
  it("misafir: ana sayfa sade; Plus'ın sayıları karşılaştırma kartında, tam bölüm ödeme sayfasında", () => {
    // 11 Kasım 2026 (ürün sahibi: "uzun ve tekrarlı olmasın"): ana sayfa üç bölüme indi; "Plus'ın bir ayı" bölümü
    // ana sayfadan kalktı. Plus'ın aylık hakkı yine kredi tablosundan hesaplanıp karşılaştırma kartında yazılır.
    const landing = readFileSync("src/components/landing/landing-page.tsx", "utf8");
    expect(landing).not.toContain("<PlusMonth");
    expect(landing).toContain("allowanceInWork(PLAN_ALLOWANCES.plusMonthly)");
    expect(landing).toContain("{fmtCount(plus.lessons)} ders ya da {fmtCount(plus.messages)} mesaj");
  });

  it("ücretsiz öğrenci: ödeme sayfasında bölüm, kapıda sayılar; ana ekranda (öğretmen sohbeti) yok", () => {
    // 8 Kasım 2026, ürün sahibi: "orası öğretmenle konuşma alanı, Plus kartının orada ne işi var".
    const home = readFileSync("src/app/ogretmen/page.tsx", "utf8");
    expect(home).not.toContain("PlusMonth");
    const pay = readFileSync("src/app/pay/page.tsx", "utf8");
    // 8 Kasım 2026: kurucu hesabına satış bölümü yok.
    expect(pay).toContain("entitlements.showsUpgradeChrome && !founder ? (");
    expect(pay).toContain('id="planlar"');
    const sheet = readFileSync("src/components/paywall/upgrade-sheet.tsx", "utf8");
    expect(sheet).toContain("<PlusCountsInline />");
  });
});
