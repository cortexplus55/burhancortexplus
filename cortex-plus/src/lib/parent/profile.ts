import {
  isOptionalPhoneValid,
  type ParentRelation,
} from "@/lib/parity/signup";

export type ParentProfileUpdate = {
  fullName: string;
  locale: "tr" | "en";
  parentRelation: ParentRelation;
  phone: string | null;
};

export function parseParentProfileUpdate(input: {
  fullName: unknown;
  locale: unknown;
  parentRelation: unknown;
  phone: unknown;
}):
  | { ok: true; data: ParentProfileUpdate }
  | { ok: false; error: string } {
  const fullName = String(input.fullName ?? "").trim();
  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, error: "Ad soyad geçersiz." };
  }

  const locale = input.locale === "en" ? "en" : input.locale === "tr" ? "tr" : null;
  if (!locale) return { ok: false, error: "Dil seçimi geçersiz." };

  const relation = String(input.parentRelation ?? "");
  if (!["anne", "baba", "vasi", "diger"].includes(relation)) {
    return { ok: false, error: "Yakınlık seçilmedi." };
  }

  const phoneRaw = String(input.phone ?? "").trim();
  if (!isOptionalPhoneValid(phoneRaw)) {
    return { ok: false, error: "Telefon numarası geçersiz." };
  }

  return {
    ok: true,
    data: {
      fullName,
      locale,
      parentRelation: relation as ParentRelation,
      phone: phoneRaw || null,
    },
  };
}

export const PARENT_PAYMENT_STATUS: Record<string, string> = {
  pending: "Bekliyor",
  paid: "Tamamlandı",
  failed: "Başarısız",
  refunded: "İade edildi",
};

/** Plus kartlarıyla aynı: amount_try lira olarak gösterilir. */
export function formatParentPaymentAmount(amountTry: number) {
  return `₺${Number(amountTry).toLocaleString("tr-TR")}`;
}
