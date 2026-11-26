import { describe, expect, it } from "vitest";
import {
  computeMonthFinance,
  effectiveIncomeTax,
  expenseKurus,
  isMonthKey,
  monthRangeUtc,
  previousMonth,
  provisionalTaxRate,
  quarterMonths,
  type MonthFinanceInput,
} from "@/lib/founder-cockpit/finance";
import {
  CSV_BOM,
  accountantCsvFilename,
  buildAccountantCsv,
} from "@/lib/founder-cockpit/export-csv";
import {
  DEFAULT_COCKPIT_SETTINGS,
  settingsFromRow,
} from "@/lib/founder-cockpit/settings";
import type { CloudExpense, SaleRow } from "@/lib/founder-cockpit/finance-load";

/*
  Kurucu Kokpiti finans motoru (Faz 13). Bütün tutarlar kuruş; beklenen değerler elle hesaplandı.
  Varsayımlar: fiyatlar KDV dahil, PayTR komisyonu brüt ciro × oran (KDV hariç), yurt dışı faturanın KDV'si 2 No.lu KDV
  olarak ödenip 1 No.lu KDV'de indirilir, gelir/kurumlar vergisi o ayın kârı üzerinden (zarar ayında 0).
*/

const SETTINGS: MonthFinanceInput["settings"] = {
  companyType: "sahis",
  corporateTaxRate: 0.25,
  incomeTaxRate: 0.2,
  youngEntrepreneurExempt: false,
  vatRate: 0.2,
  paytrCommissionRate: 0.0295,
  usdTryRate: 50,
};

describe("kârlı ay (şahıs, gider yok)", () => {
  // 10 × ₺599 Plus, iade yok.
  const finance = computeMonthFinance({
    grossKurus: 599_000,
    refundKurus: 0,
    paymentCount: 10,
    expenses: [],
    settings: SETTINGS,
  });

  it("KDV ayrıştırması: 599.000 / 1,2", () => {
    expect(finance.netCollectedKurus).toBe(599_000);
    expect(finance.netSalesKurus).toBe(499_167);
    expect(finance.outputVatKurus).toBe(99_833);
  });

  it("komisyon brüt üzerinden, KDV'si indirilir", () => {
    expect(finance.commissionKurus).toBe(17_671);
    expect(finance.commissionVatKurus).toBe(3_534);
    expect(finance.deductibleVatKurus).toBe(3_534);
    expect(finance.kdv1PayableKurus).toBe(96_299);
    expect(finance.vatCarryForwardKurus).toBe(0);
  });

  it("gelir vergisi, vergi kasası ve harcanabilir net", () => {
    expect(finance.profitBeforeTaxKurus).toBe(481_496);
    expect(finance.incomeTaxKurus).toBe(96_299);
    expect(finance.incomeTaxLabel).toBe("Tahmini gelir vergisi");
    expect(finance.taxVaultKurus).toBe(96_299 + 96_299);
    expect(finance.spendableNetKurus).toBe(385_197);
  });

  it("cebirsel eşitlik: harcanabilir = KDV hariç satış − komisyon − yurt dışı − tahmini vergi (KDV devretmiyorsa)", () => {
    expect(finance.spendableNetKurus).toBe(
      finance.netSalesKurus -
        finance.commissionKurus -
        finance.foreignKurus -
        finance.incomeTaxKurus,
    );
  });
});

describe("zarar ayı (iade + yurt dışı faturalar)", () => {
  // 3 × ₺599, biri iade; OpenAI $40 (TL girilmedi), Vercel $20 (₺1.000 girildi), KDV 2 dışı $5.
  const finance = computeMonthFinance({
    grossKurus: 179_700,
    refundKurus: 59_900,
    paymentCount: 3,
    expenses: [
      { amountUsd: 40, amountTry: 0, kdv2: true },
      { amountUsd: 20, amountTry: 1_000, kdv2: true },
      { amountUsd: 5, amountTry: 0, kdv2: false },
    ],
    settings: SETTINGS,
  });

  it("yurt dışı gider: TL girildiyse o, değilse kurla", () => {
    expect(finance.foreignUsd).toBe(65);
    expect(finance.foreignKurus).toBe(200_000 + 100_000 + 25_000);
    expect(finance.kdv2Kurus).toBe(60_000);
  });

  it("indirilecek KDV hesaplanandan büyük: KDV 1 sıfır, fark devreder", () => {
    expect(finance.netCollectedKurus).toBe(119_800);
    expect(finance.outputVatKurus).toBe(19_967);
    expect(finance.deductibleVatKurus).toBe(61_060);
    expect(finance.kdv1PayableKurus).toBe(0);
    expect(finance.vatCarryForwardKurus).toBe(41_093);
  });

  it("zararda gelir vergisi 0; vergi kasası yalnız KDV 2; harcanabilir eksi", () => {
    expect(finance.profitBeforeTaxKurus).toBe(-230_468);
    expect(finance.incomeTaxKurus).toBe(0);
    expect(finance.taxVaultKurus).toBe(60_000);
    expect(finance.spendableNetKurus).toBe(-271_561);
  });
});

describe("şirket türü ve istisna", () => {
  const base = {
    grossKurus: 599_000,
    refundKurus: 0,
    paymentCount: 10,
    expenses: [],
  };

  it("Limited: kurumlar vergisi oranı", () => {
    const finance = computeMonthFinance({
      ...base,
      settings: { ...SETTINGS, companyType: "limited" },
    });
    expect(finance.incomeTaxLabel).toBe("Tahmini kurumlar vergisi");
    expect(finance.incomeTaxRate).toBe(0.25);
    expect(finance.incomeTaxKurus).toBe(120_374);
  });

  it("Şahıs + genç girişimci istisnası: gelir vergisi 0", () => {
    const finance = computeMonthFinance({
      ...base,
      settings: { ...SETTINGS, youngEntrepreneurExempt: true },
    });
    expect(finance.incomeTaxKurus).toBe(0);
    expect(finance.incomeTaxLabel).toMatch(/genç girişimci/);
    expect(finance.taxVaultKurus).toBe(finance.kdv1PayableKurus);
  });

  it("istisna Limited'de uygulanmaz", () => {
    expect(
      effectiveIncomeTax({
        ...SETTINGS,
        companyType: "limited",
        youngEntrepreneurExempt: true,
      }).rate,
    ).toBe(0.25);
  });

  it("geçici vergi oranı: şahısta %15, istisnada 0, limitedde kurumlar oranı", () => {
    expect(provisionalTaxRate(SETTINGS)).toBe(0.15);
    expect(
      provisionalTaxRate({ ...SETTINGS, youngEntrepreneurExempt: true }),
    ).toBe(0);
    expect(provisionalTaxRate({ ...SETTINGS, companyType: "limited" })).toBe(
      0.25,
    );
  });
});

describe("sınır durumları", () => {
  it("boş ay sıfır, NaN girdisi sıfır sayılır", () => {
    const finance = computeMonthFinance({
      grossKurus: Number.NaN,
      refundKurus: 0,
      paymentCount: 0,
      expenses: [],
      settings: SETTINGS,
    });
    expect(finance.grossKurus).toBe(0);
    expect(finance.taxVaultKurus).toBe(0);
    expect(finance.spendableNetKurus).toBe(0);
  });

  it("fatura tutarı", () => {
    expect(expenseKurus({ amountUsd: 10, amountTry: 0, kdv2: true }, 50)).toBe(
      50_000,
    );
    expect(
      expenseKurus({ amountUsd: 10, amountTry: 480.5, kdv2: true }, 50),
    ).toBe(48_050);
    expect(expenseKurus({ amountUsd: -3, amountTry: 0, kdv2: true }, 50)).toBe(
      0,
    );
  });
});

describe("ay yardımcıları", () => {
  it("Türkiye ayının UTC aralığı (UTC+3)", () => {
    expect(monthRangeUtc("2026-11")).toEqual({
      startIso: "2026-10-31T21:00:00.000Z",
      endIso: "2026-11-30T21:00:00.000Z",
    });
    expect(monthRangeUtc("2026-12").endIso).toBe("2026-12-31T21:00:00.000Z");
  });

  it("önceki ay, çeyrek ayları, doğrulama", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-11")).toBe("2026-10");
    expect(quarterMonths("2026-Q4")).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(quarterMonths("2026-11")).toEqual([]);
    expect(isMonthKey("2026-11")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
  });
});

describe("ayarlar", () => {
  it("varsayılanlar: şahıs, 50 $ günlük bütçe, koruma kapalı", () => {
    expect(DEFAULT_COCKPIT_SETTINGS.companyType).toBe("sahis");
    expect(DEFAULT_COCKPIT_SETTINGS.dailyAiBudgetUsd).toBe(50);
    expect(DEFAULT_COCKPIT_SETTINGS.circuitBreakerEnabled).toBe(false);
  });

  it("satırdan okuma: bozuk değer varsayılana düşer", () => {
    const settings = settingsFromRow({
      company_type: "limited",
      vat_rate: "0.2",
      usd_try_rate: "abc",
      daily_ai_budget_usd: -5,
    });
    expect(settings.companyType).toBe("limited");
    expect(settings.vatRate).toBe(0.2);
    expect(settings.usdTryRate).toBe(DEFAULT_COCKPIT_SETTINGS.usdTryRate);
    expect(settings.dailyAiBudgetUsd).toBe(
      DEFAULT_COCKPIT_SETTINGS.dailyAiBudgetUsd,
    );
    expect(settingsFromRow(null)).toEqual(DEFAULT_COCKPIT_SETTINGS);
  });
});

describe("mali müşavir paketi (CSV)", () => {
  const finance = computeMonthFinance({
    grossKurus: 179_700,
    refundKurus: 59_900,
    paymentCount: 3,
    expenses: [{ amountUsd: 40, amountTry: 0, kdv2: true }],
    settings: SETTINGS,
  });
  const sales: SaleRow[] = [
    {
      createdAt: "2026-11-03T09:00:00Z",
      orderId: "CP123",
      status: "paid",
      planName: "Plus Aylık",
      amountKurus: 59_900,
    },
    {
      createdAt: "2026-11-04T23:30:00Z",
      orderId: "CP124",
      status: "refunded",
      planName: "Plus Aylık",
      amountKurus: 59_900,
    },
  ];
  const expenses: CloudExpense[] = [
    {
      id: "a",
      periodMonth: "2026-11",
      vendor: "OpenAI",
      amountUsd: 40,
      amountTry: 0,
      invoiceNumber: '=HYPERLINK("x")',
      kdv2: true,
      sentToAccountant: false,
      notes: "Kasım; kullanım",
      createdAt: "2026-12-02T08:00:00Z",
    },
  ];
  const csv = buildAccountantCsv({
    month: "2026-11",
    finance,
    sales,
    expenses,
    settings: SETTINGS,
    generatedAt: new Date("2026-12-02T09:15:00Z"),
  });
  const lines = csv.slice(CSV_BOM.length).split("\r\n");

  it("Excel için: BOM, noktalı virgül, CRLF, ondalık virgül", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines[0]).toBe("Cortex Plus · Mali Müşavir Paketi;Kasım 2026");
    expect(lines).toContain("Brüt ciro (KDV dahil);1797,00");
    // 99.833 − 5.301 − 200.000 kuruş
    expect(lines).toContain("Vergi öncesi kâr;-1054,68");
  });

  it("satışlar Türkiye saatiyle, KDV ayrık; kişisel veri yok", () => {
    expect(lines).toContain(
      "03.11.2026 12:00;CP123;Plus Aylık;Ödendi;599,00;99,83;499,17",
    );
    expect(lines).toContain(
      "05.11.2026 02:30;CP124;Plus Aylık;İade edildi;599,00;99,83;499,17",
    );
    expect(csv).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it("formül enjeksiyonu ve ayraç kaçışı; eksi tutar sayı kalır", () => {
    const row = lines.find((line) => line.includes("OpenAI"))!;
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain(`"Kasım; kullanım"`);
    expect(row).toContain(";40,00;2000,00;Evet;400,00;Hayır;");
    const loss = lines.find((line) => line.startsWith("Vergi öncesi kâr;"))!;
    expect(loss).not.toContain("'");
  });

  it("dosya adı", () => {
    expect(accountantCsvFilename("2026-11")).toBe(
      "cortex-plus-mali-musavir-2026-11.csv",
    );
  });
});
