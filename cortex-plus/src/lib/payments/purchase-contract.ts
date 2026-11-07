import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTry } from "@/lib/format";
import { DISTANCE_SALES_SECTIONS, PRE_INFO_SECTIONS } from "@/lib/legal/texts";
import { SALES_DOCS } from "@/lib/legal/versions";
import type { LegalSection } from "@/lib/legal/legal-types";

/*
  Satın almanın sözleşme örneği (7 Kasım 2026, uyum paketi). Mesafeli Sözleşmeler Yönetmeliği: ön bilgilendirme ve
  sözleşme satın alma bilgileriyle birlikte tüketiciye kalıcı bir ortamda iletilir. Mesafeli satış sözleşmesi
  "örnek e-postayla gönderilir ve Ödemelerim'de görüntülenir" der; iki söz de buradan tutulur:
  - ödeme kesinleşince (PayTR geri çağrısı, `completed`) hesabın e-postasına örnek gider;
  - hesapsız veli ödemesinde örnek, ödemeye geçerken velinin yazdığı adrese gider (adres saklanmaz);
  - Ödemelerim'deki "Sözleşme" bağlantısı aynı bölümleri çizer (`/odemeler/sozlesme/[siparis]`).
*/

export type PurchaseFacts = {
  merchantOid: string;
  planName: string;
  amountKurus: number;
  at: string;
  /** Veli ödemesinde hakkın tanımlandığı öğrencinin adı. */
  forStudent?: string | null;
};

const DATE_FORMAT = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

export function purchaseSummary(facts: PurchaseFacts): LegalSection {
  const when = Number.isNaN(Date.parse(facts.at)) ? facts.at : DATE_FORMAT.format(new Date(facts.at));
  return {
    heading: "Satın alma bilgileri",
    body: [
      `Sipariş numarası: ${facts.merchantOid}`,
      `Tarih: ${when}`,
      `Paket: ${facts.planName}`,
      `Tutar (KDV dahil): ${formatTry(facts.amountKurus)}`,
      "Ödeme: kredi ya da banka kartıyla tek çekim (PayTR). Otomatik yenileme yoktur.",
      ...(facts.forStudent ? [`Hakkın tanımlandığı öğrenci: ${facts.forStudent}`] : []),
      `Sözleşme sürümü: ${SALES_DOCS.version}`,
    ],
  };
}

/** Örneğin bölümleri: satın alma bilgileri, sonra Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi. */
export function purchaseContractSections(facts: PurchaseFacts): LegalSection[] {
  return [
    purchaseSummary(facts),
    ...PRE_INFO_SECTIONS.map((section) => ({ heading: `Ön Bilgilendirme Formu · ${section.heading}`, body: section.body })),
    ...DISTANCE_SALES_SECTIONS.map((section) => ({
      heading: `Mesafeli Satış Sözleşmesi · ${section.heading}`,
      body: section.body,
    })),
  ];
}

type PaymentRow = {
  user_id: string | null;
  beneficiary_user_id: string | null;
  amount_try: number | null;
  created_at: string | null;
  status: string | null;
  plans: { name?: string | null } | { name?: string | null }[] | null;
};

function planNameOf(row: PaymentRow): string {
  const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
  return plan?.name?.trim() || "Cortex Plus";
}

/**
 * Ödeme kesinleşince örneği hesabın e-postasına gönderir. Hesapsız veli ödemesinde gönderilmez (örnek veliye
 * ödemeye geçerken gitti; öğrenci sözleşmenin tarafı değil). Hiçbir koşulda fırlatmaz: geri çağrının "OK"u
 * bekletilmez.
 */
export async function sendPurchaseContract(
  service: SupabaseClient,
  merchantOid: string,
  appUrl: string,
): Promise<void> {
  try {
    const { data: payment } = await service
      .from("payments")
      .select("user_id, beneficiary_user_id, amount_try, created_at, status, plans(name)")
      .eq("merchant_oid", merchantOid)
      .maybeSingle();
    const row = payment as PaymentRow | null;
    if (!row?.user_id || row.status !== "paid") return;

    const { data: audit } = await service
      .from("audit_logs")
      .select("metadata")
      .eq("action", "payment.token.created")
      .eq("entity_id", merchantOid)
      .limit(1)
      .maybeSingle();
    const via = (audit?.metadata as { via?: string } | null)?.via;
    if (via === "parent_link") return;

    const { data: account } = await service.auth.admin.getUserById(row.user_id);
    const email = account?.user?.email;
    if (!email) return;

    const facts: PurchaseFacts = {
      merchantOid,
      planName: planNameOf(row),
      amountKurus: Number(row.amount_try ?? 0),
      at: row.created_at ?? new Date().toISOString(),
    };
    const origin = appUrl.replace(/\/$/, "");
    const { sendPurchaseContractEmail } = await import("@/lib/email/mailer");
    const sent = await sendPurchaseContractEmail({
      to: email,
      title: "Ödemen alındı · Sözleşme örneğin",
      intro: `${facts.planName} hesabına tanımlandı. Aşağıda satın alma bilgilerin, Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi var; bu e-postayı saklayabilirsin.`,
      sections: purchaseContractSections(facts),
      link: { href: `${origin}/odemeler/sozlesme/${encodeURIComponent(merchantOid)}`, label: "Sözleşmeyi sitede gör" },
    });
    if (!sent.ok) console.warn("purchase_contract_email_failed", { merchantOid, reason: sent.reason });
  } catch (error) {
    console.error("purchase_contract_email_failed", { merchantOid, error: String(error) });
  }
}

/**
 * Hesapsız veli ödemesinde örnek, ödemeye geçerken velinin yazdığı adrese gider (adres saklanmaz; ödeme sonrası
 * velinin adresi bizde olmadığı için tek an budur). Ödeme tamamlanmazsa sözleşme kurulmaz; e-posta bunu söyler.
 */
export async function sendParentContractCopy(email: string, facts: PurchaseFacts, appUrl: string): Promise<void> {
  try {
    const { sendPurchaseContractEmail } = await import("@/lib/email/mailer");
    const sent = await sendPurchaseContractEmail({
      to: email,
      title: "Ödeme bilgileri ve sözleşme örneği",
      intro: `Ödemeyi tamamladığınızda ${facts.planName}${facts.forStudent ? ` ${facts.forStudent} adlı öğrencinin` : ""} hesabına tanımlanır. Aşağıda satın alma bilgileri, Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi var; bu e-postayı saklayabilirsiniz. Ödeme tamamlanmazsa sözleşme kurulmaz ve tahsilat yapılmaz.`,
      sections: purchaseContractSections(facts),
      link: { href: `${appUrl.replace(/\/$/, "")}/mesafeli-satis`, label: "Sözleşmeyi sitede gör" },
    });
    if (!sent.ok) console.warn("parent_contract_email_failed", { merchantOid: facts.merchantOid, reason: sent.reason });
  } catch (error) {
    console.error("parent_contract_email_failed", { merchantOid: facts.merchantOid, error: String(error) });
  }
}
