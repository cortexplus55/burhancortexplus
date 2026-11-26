/**
 * Yurt dışı API ve bulut sağlayıcıları ve fatura satırı (Faz 13). Sunucu ve tarayıcı ortak: fatura formu da bu listeyi
 * okur. Liste göçteki CHECK kısıtıyla aynı (`founder_cloud_expenses.vendor`).
 */

export const VENDORS = ["OpenAI", "Vercel", "Supabase", "Resend", "Sentry", "Upstash", "Diğer"] as const;
export type Vendor = (typeof VENDORS)[number];

export type CloudExpense = {
  id: string;
  periodMonth: string;
  vendor: Vendor;
  amountUsd: number;
  amountTry: number;
  invoiceNumber: string | null;
  kdv2: boolean;
  sentToAccountant: boolean;
  notes: string | null;
  createdAt: string;
};
