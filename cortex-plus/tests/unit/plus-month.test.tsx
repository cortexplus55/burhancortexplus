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
import { FREE_IMAGE_DAILY_LIMIT } from "@/lib/ai/image-quota";

/*
  20 Ekim 2026, ürün sahibi: "plus alan biri bütün bir plus hesabıyla neler yapabilir … kaç adet
  kullanabilir … misafir ekranına ve kayıtlı ücretsiz kullanıcı ekranına dikkat çekici". Kural: her
  sayı kredi tablosundan hesaplanır; öğrenci kredi görmez; ücretsizde kapalı denen iş gerçekten
  ücretsiz günlük haktan büyük.
*/

afterEach(cleanup);

const FREE_DAILY = PLAN_ALLOWANCES.free;
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
    // Bugünkü değerler (kredi sistemi v2): tablo değişirse bu satır da değişir, cümleler kendiliğinden.
    expect(counts).toEqual({
      lesson: 1200,
      quiz: 1800,
      cards: 2400,
      podcast: 100,
      oral: 900,
      written: 480,
      photo: 720,
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

  it("'Ücretsizde kapalı' tam olarak ücretsiz günlük haktan büyük işler", () => {
    for (const work of PLAN_WORK) {
      // Fotoğraf günlük haktan büyük ama kendi sayacıyla ücretsizde açık (23 Ekim 2026: günde 3).
      expect(work.plusOnly, work.id).toBe(work.credits > FREE_DAILY && work.freeDaily === undefined);
      if (work.plusOnly) expect(freeMonthlyCount(work), work.id).toBe(0);
    }
    expect(freeMonthlyCount(PLAN_WORK_BY_ID.lesson)).toBe(30);
    expect(PLAN_WORK_BY_ID.photo.freeDaily).toBe(FREE_IMAGE_DAILY_LIMIT);
    expect(freeMonthlyCount(PLAN_WORK_BY_ID.photo)).toBe(FREE_IMAGE_DAILY_LIMIT * 30);
  });

  it("hazır tempolar Plus hakkına sığar ve gittikçe yoğunlaşır", () => {
    const shares = TEMPO_PRESETS.map((preset) => mixShare(tempoMix(preset.tempo)));
    for (const share of shares) {
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThanOrEqual(1);
    }
    expect([...shares].sort((a, b) => a - b)).toEqual(shares);
    // Ana ekran kartının cümlesi "sınav ayı" temposundan: günde 3 ders, 5 test, her gün bir podcast.
    const examMonth = TEMPO_PRESETS.find((preset) => preset.id === "sinav-ayi")!.tempo;
    expect(examMonth).toMatchObject({ lessonsPerDay: 3, quizzesPerDay: 5, podcastsPerWeek: 7 });
  });

  it("ücretsiz gün karşılığı: Plus'a özel iş varsa yok, yoksa günlük hakla", () => {
    expect(freeDaysFor({ podcast: 1 })).toBeNull();
    expect(freeDaysFor({ lesson: 30 })).toBe(30);
    expect(freeDaysFor({ quiz: 3 })).toBe(Math.ceil((3 * CREDIT_PRICE_TABLE.QUIZ_GENERATE.credits) / FREE_DAILY));
  });

  it("ücretsiz–Plus satırları ve günlük fiyat", () => {
    const rows = freeVsPlusRows(fmt);
    expect(rows[0]).toEqual({ label: "Ders (ayda)", free: "30", plus: "1.200" });
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
        yearlyKurus={499000}
        primary={{ label: "Plus ile başla", href: "/kayit?next=%2Fpay" }}
        secondary={{ label: "Önce ücretsiz dene", href: "/kayit" }}
      />,
    );
    expect(container.querySelectorAll(".pm-tile")).toHaveLength(9);
    expect(screen.getAllByText("1.200").length).toBeGreaterThan(0);
    expect(screen.getByText("Kendi ayını kur")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Plus ile başla/ }).getAttribute("href")).toBe("/kayit?next=%2Fpay");
    expect(container.textContent).toContain("Otomatik yenileme yok");
    expect(container.textContent).toContain("yıllıkta");
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
  it("misafir: ana sayfada ikinci bölüm", () => {
    const landing = readFileSync("src/components/landing/landing-page.tsx", "utf8");
    expect(landing).toContain("<PlusMonth");
    expect(landing.indexOf("<PlusMonth")).toBeLessThan(landing.indexOf('id="nasil"'));
  });

  it("ücretsiz öğrenci: ana ekranda kart, ödeme sayfasında bölüm, kapıda sayılar; Plus'ta görünmez", () => {
    const home = readFileSync("src/app/ogretmen/page.tsx", "utf8");
    expect(home).toContain("const showPlus = account.showsUpgradeChrome;");
    expect(home).toContain('variant="compact"');
    const pay = readFileSync("src/app/pay/page.tsx", "utf8");
    expect(pay).toContain("entitlements.showsUpgradeChrome ? (");
    expect(pay).toContain('id="planlar"');
    const sheet = readFileSync("src/components/paywall/upgrade-sheet.tsx", "utf8");
    expect(sheet).toContain("<PlusCountsInline />");
  });
});
