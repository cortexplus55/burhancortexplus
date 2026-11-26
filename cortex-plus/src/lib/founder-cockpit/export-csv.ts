import type { MonthFinance } from "@/lib/founder-cockpit/finance";
import type { CloudExpense, SaleRow } from "@/lib/founder-cockpit/finance-load";
import { periodLabelOf } from "@/lib/founder-cockpit/tax-calendar";
import type { CockpitSettings } from "@/lib/founder-cockpit/settings";

/**
 * Mali müşavir paketi (Faz 13, 26 Kasım 2026): tek CSV, üç bölüm (özet, satışlar, yurt dışı faturalar). Excel'in Türkçe
 * ayarı için: UTF-8 BOM (﻿; Türkçe harfler bozulmaz), alan ayırıcı noktalı virgül, ondalık virgül, satır sonu CRLF.
 * Kişisel veri yok: satışlarda yalnız tarih, sipariş numarası, paket ve tutar (alıcı adı ya da e-postası yazılmaz).
 * Formül enjeksiyonuna karşı "=", "+", "-", "@" ile başlayan metin alanları tek tırnakla başlatılır.
 */

export const CSV_BOM = "﻿";
const SEP = ";";

function cell(value: string | number | null | undefined): string {
  if (value == null) return "";
  let text = String(value);
  // Eksi tutar ("-12,50") sayıdır, dokunulmaz; "-" ile başlayan metin formül sayılır.
  if (typeof value === "string" && /^(?:[=+@\t\r]|-(?!\d))/.test(text))
    text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tl(kurus: number): string {
  return (Math.round(kurus) / 100).toFixed(2).replace(".", ",");
}

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2).replace(".", ",");
}

function percent(rate: number): string {
  return `%${(Math.round(rate * 10000) / 100).toString().replace(".", ",")}`;
}

/** "2026-11-26T09:14:00Z" → "26.11.2026 12:14" (Türkiye saati). */
export function istanbulDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

export function buildAccountantCsv(input: {
  month: string;
  finance: MonthFinance;
  sales: readonly SaleRow[];
  expenses: readonly CloudExpense[];
  settings: Pick<
    CockpitSettings,
    "companyType" | "vatRate" | "paytrCommissionRate" | "usdTryRate"
  >;
  generatedAt: Date;
}): string {
  const { finance, settings } = input;
  const rows: (string | number | null)[][] = [];
  const row = (...values: (string | number | null)[]) => rows.push(values);

  row("Cortex Plus · Mali Müşavir Paketi", periodLabelOf(input.month));
  row("Hazırlanma", istanbulDateTime(input.generatedAt.toISOString()));
  row(
    "Şirket türü",
    settings.companyType === "limited" ? "Limited" : "Şahıs işletmesi",
  );
  row("KDV oranı", percent(settings.vatRate));
  row(
    "PayTR komisyon oranı (KDV hariç)",
    percent(settings.paytrCommissionRate),
  );
  row("Kur (1 USD)", money(settings.usdTryRate));
  row(
    "Not",
    "Ön muhasebe tahminidir; resmi beyanda mali müşavir hesabı ve GİB kayıtları esastır.",
  );
  row();
  row("ÖZET", "Tutar (TL)");
  row("Brüt ciro (KDV dahil)", tl(finance.grossKurus));
  row("İadeler", tl(finance.refundKurus));
  row("Net tahsilat (KDV dahil)", tl(finance.netCollectedKurus));
  row("KDV hariç net satış", tl(finance.netSalesKurus));
  row("Hesaplanan KDV (satış)", tl(finance.outputVatKurus));
  row("PayTR komisyonu (KDV hariç)", tl(finance.commissionKurus));
  row("PayTR komisyonu KDV", tl(finance.commissionVatKurus));
  row("Yurt dışı giderler (TL)", tl(finance.foreignKurus));
  row("Yurt dışı giderler (USD)", money(finance.foreignUsd));
  row("2 No.lu KDV (KDV 2)", tl(finance.kdv2Kurus));
  row("İndirilecek KDV", tl(finance.deductibleVatKurus));
  row("1 No.lu KDV ödenecek (KDV 1)", tl(finance.kdv1PayableKurus));
  row("Sonraki aya devreden KDV", tl(finance.vatCarryForwardKurus));
  row("Vergi öncesi kâr", tl(finance.profitBeforeTaxKurus));
  row(
    `${finance.incomeTaxLabel} (${percent(finance.incomeTaxRate)})`,
    tl(finance.incomeTaxKurus),
  );
  row("Vergi kasasına ayrılacak", tl(finance.taxVaultKurus));
  row("Gerçek harcanabilir net kâr", tl(finance.spendableNetKurus));
  row();
  row("SATIŞLAR (PayTR)");
  row(
    "Tarih",
    "Sipariş no",
    "Paket",
    "Durum",
    "Tutar KDV dahil (TL)",
    "KDV (TL)",
    "KDV hariç (TL)",
  );
  for (const sale of input.sales) {
    const excl = Math.round(sale.amountKurus / (1 + settings.vatRate));
    row(
      istanbulDateTime(sale.createdAt),
      sale.orderId,
      sale.planName,
      sale.status === "refunded" ? "İade edildi" : "Ödendi",
      tl(sale.amountKurus),
      tl(sale.amountKurus - excl),
      tl(excl),
    );
  }
  row();
  row("YURT DIŞI FATURALAR (API ve bulut)");
  row(
    "Kayıt tarihi",
    "Sağlayıcı",
    "Fatura no",
    "Tutar (USD)",
    "Tutar (TL)",
    "KDV 2 kapsamında",
    "KDV 2 (TL)",
    "Mali müşavire gönderildi",
    "Not",
  );
  for (const expense of input.expenses) {
    const tryKurus =
      expense.amountTry > 0
        ? Math.round(expense.amountTry * 100)
        : Math.round(expense.amountUsd * settings.usdTryRate * 100);
    row(
      istanbulDateTime(expense.createdAt),
      expense.vendor,
      expense.invoiceNumber ?? "",
      money(expense.amountUsd),
      tl(tryKurus),
      expense.kdv2 ? "Evet" : "Hayır",
      tl(expense.kdv2 ? Math.round(tryKurus * settings.vatRate) : 0),
      expense.sentToAccountant ? "Evet" : "Hayır",
      expense.notes ?? "",
    );
  }
  return (
    CSV_BOM +
    rows.map((values) => values.map(cell).join(SEP)).join("\r\n") +
    "\r\n"
  );
}

export function accountantCsvFilename(month: string): string {
  return `cortex-plus-mali-musavir-${month}.csv`;
}
