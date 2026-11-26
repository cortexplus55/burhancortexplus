import { describe, expect, it } from "vitest";
import {
  REMINDER_THRESHOLDS,
  daysUntil,
  dueDateLabel,
  monthlyDeadlines,
  periodLabelOf,
  provisionalTaxDeadlines,
  reminderThresholdFor,
  shiftToBusinessDay,
  taxDeadlinesBetween,
  taxReminderKey,
  upcomingTaxDeadlines,
} from "@/lib/founder-cockpit/tax-calendar";

/*
  Kurucu Kokpiti vergi takvimi (Faz 13). Günler elle hesaplandı: 1 Ocak 2026 Perşembe, 1 Ocak 2027 Cuma.
  Kural: izleyen ayın 25'i 2 No.lu KDV, 26'sı Muhtasar ve Damga, 28'i 1 No.lu KDV; geçici vergi 17 Şubat / Mayıs /
  Ağustos / Kasım; hafta sonu ve tam gün resmî tatil ilk iş gününe kaydırır, arife kaydırmaz; 20'si iç hatırlatma.
*/

const byKind = (period: string) =>
  Object.fromEntries(monthlyDeadlines(period).map((item) => [item.kind, item]));

describe("aylık son günler", () => {
  it("Kasım 2026 dönemi: 20 Aralık faturalar, 25 KDV 2, Muhtasar Cumartesi'den Pazartesi'ye, 28 KDV 1", () => {
    const items = byKind("2026-11");
    expect(items.invoice_collect.dueDate).toBe("2026-12-20");
    // İç hatırlatma Pazar'a denk gelse de kaymaz.
    expect(items.invoice_collect.internal).toBe(true);
    expect(items.invoice_collect.shiftedFrom).toBeNull();
    expect(items.kdv2.dueDate).toBe("2026-12-25");
    expect(items.kdv2.shiftedFrom).toBeNull();
    expect(items.muhtasar_damga.originalDate).toBe("2026-12-26");
    expect(items.muhtasar_damga.dueDate).toBe("2026-12-28");
    expect(items.muhtasar_damga.shiftedFrom).toBe("Cumartesi");
    expect(items.kdv1.dueDate).toBe("2026-12-28");
  });

  it("Aralık dönemi yılı aşar (Ocak'ın son günleri)", () => {
    const items = byKind("2026-12");
    expect(items.kdv2.period).toBe("2026-12");
    expect(items.kdv2.originalDate).toBe("2027-01-25");
    expect(items.kdv2.dueDate).toBe("2027-01-25");
    expect(items.kdv1.originalDate).toBe("2027-01-28");
  });

  it("bayramda son gün: Nisan 2026 dönemi KDV 1, Kurban Bayramı ve hafta sonundan 1 Haziran'a kayar", () => {
    const items = byKind("2026-04");
    expect(items.kdv1.originalDate).toBe("2026-05-28");
    expect(items.kdv1.dueDate).toBe("2026-06-01");
    expect(items.kdv1.shiftedFrom).toBe("Kurban Bayramı");
    // 26 Mayıs 2026 Kurban arifesi: yarım gün, kaydırmaz.
    expect(items.muhtasar_damga.dueDate).toBe("2026-05-26");
    expect(items.muhtasar_damga.shiftedFrom).toBeNull();
    expect(items.kdv2.dueDate).toBe("2026-05-25");
  });

  it("Pazar'a denk gelen 25'i Pazartesi'ye kayar (Eylül 2026 dönemi)", () => {
    const items = byKind("2026-09");
    expect(items.kdv2.originalDate).toBe("2026-10-25");
    expect(items.kdv2.dueDate).toBe("2026-10-26");
    expect(items.kdv2.shiftedFrom).toBe("Pazar");
  });

  it("anahtar ve dönem adı kalıcı", () => {
    const items = byKind("2026-11");
    expect(items.kdv2.key).toBe("kdv2:2026-11");
    expect(items.kdv2.periodLabel).toBe("Kasım 2026");
    expect(periodLabelOf("2026-Q3")).toBe("2026 3. dönem");
  });
});

describe("geçici vergi", () => {
  it("17 Şubat önceki yılın 4. dönemi; dört dönem", () => {
    const items = provisionalTaxDeadlines(2027);
    expect(items.map((item) => item.period)).toEqual([
      "2026-Q4",
      "2027-Q1",
      "2027-Q2",
      "2027-Q3",
    ]);
    expect(items[0]!.dueDate).toBe("2027-02-17");
  });

  it("17 Mayıs 2027 Kurban Bayramı'na denk gelir: 20 Mayıs Perşembe'ye kayar", () => {
    const q1 = provisionalTaxDeadlines(2027).find(
      (item) => item.period === "2027-Q1",
    )!;
    expect(q1.originalDate).toBe("2027-05-17");
    expect(q1.dueDate).toBe("2027-05-20");
    expect(q1.shiftedFrom).toBe("Kurban Bayramı");
  });

  it("17 Kasım 2026 Salı: kaymaz", () => {
    const q3 = provisionalTaxDeadlines(2026).find(
      (item) => item.period === "2026-Q3",
    )!;
    expect(q3.dueDate).toBe("2026-11-17");
    expect(q3.shiftedFrom).toBeNull();
  });
});

describe("iş günü kaydırma", () => {
  it("hafta içi gün olduğu gibi kalır", () => {
    expect(shiftToBusinessDay("2026-11-26")).toEqual({
      date: "2026-11-26",
      reason: null,
    });
  });

  it("29 Ekim (Cumhuriyet Bayramı) ertesi iş gününe kayar", () => {
    expect(shiftToBusinessDay("2026-10-29")).toEqual({
      date: "2026-10-30",
      reason: "Cumhuriyet Bayramı",
    });
  });

  it("Cumartesi önce, Pazar sonra: ilk neden yazılır", () => {
    expect(shiftToBusinessDay("2026-11-28")).toEqual({
      date: "2026-11-30",
      reason: "Cumartesi",
    });
  });
});

describe("aralıktaki işler", () => {
  it("26 Kasım 2026'dan 30 gün: bugünün Muhtasarı, Ekim KDV 1'i (Cumartesi → 30 Kasım), Kasım faturaları ve KDV 2'si", () => {
    const items = upcomingTaxDeadlines(new Date("2026-11-26T09:00:00Z"), 30);
    const keys = items.map((item) => `${item.key}@${item.dueDate}`);
    expect(keys).toEqual([
      "muhtasar_damga:2026-10@2026-11-26",
      "kdv1:2026-10@2026-11-30",
      "invoice_collect:2026-11@2026-12-20",
      "kdv2:2026-11@2026-12-25",
    ]);
    // Kasım Muhtasarı 26 Aralık'tan 28 Aralık'a kaydığı için 30 günlük pencerenin dışında.
    expect(items.some((item) => item.key === "muhtasar_damga:2026-11")).toBe(
      false,
    );
  });

  it("tarih sırasıyla ve tekrarsız; yıl sonu geçici vergiyi de kapsar", () => {
    const items = taxDeadlinesBetween("2027-01-01", "2027-02-28");
    const dates = items.map((item) => item.dueDate);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    expect(
      items.some(
        (item) =>
          item.key === "gecici_vergi:2026-Q4" && item.dueDate === "2027-02-17",
      ),
    ).toBe(true);
  });

  it("Türkiye günü UTC gece yarısından sonra başlar", () => {
    // 25 Kasım 22:30 UTC = 26 Kasım 01:30 Türkiye: bugün son günü olan Muhtasar listede.
    const items = upcomingTaxDeadlines(new Date("2026-11-25T22:30:00Z"), 1);
    expect(items.map((item) => item.key)).toContain("muhtasar_damga:2026-10");
  });
});

describe("hatırlatma eşikleri", () => {
  it("5 gün ve 1 gün", () => {
    expect(REMINDER_THRESHOLDS).toEqual([5, 1]);
    expect(reminderThresholdFor("2026-12-19", "2026-12-25")).toBeNull();
    expect(reminderThresholdFor("2026-12-20", "2026-12-25")).toBe(5);
    expect(reminderThresholdFor("2026-12-23", "2026-12-25")).toBe(5);
    expect(reminderThresholdFor("2026-12-24", "2026-12-25")).toBe(1);
    expect(reminderThresholdFor("2026-12-25", "2026-12-25")).toBe(1);
    expect(reminderThresholdFor("2026-12-26", "2026-12-25")).toBeNull();
  });

  it("kalan gün ve anahtar", () => {
    expect(daysUntil("2026-11-26", "2026-12-25")).toBe(29);
    expect(daysUntil("2026-12-31", "2027-01-01")).toBe(1);
    expect(taxReminderKey({ key: "kdv2:2026-11" }, 5)).toBe(
      "tax:kdv2:2026-11:5",
    );
  });

  it("son gün etiketi Türkçe gün adıyla", () => {
    expect(dueDateLabel("2026-12-28")).toBe("28 Aralık 2026 Pazartesi");
  });
});
