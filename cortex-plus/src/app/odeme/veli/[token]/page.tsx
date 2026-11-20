import { redirect } from "next/navigation";
import { PARENT_PAY_PATH } from "@/lib/payments/parent-link";

export const dynamic = "force-dynamic";

/**
 * Eski veli ödeme adresi (29 Ekim 2026). Faz 5 §2 ile sayfa `/veli-odeme/<belirteç>`e taşındı; daha önce gönderilmiş
 * bağlantılar kırılmasın diye aynı belirteçle oraya yönlenir (doğrulama yeni sayfada).
 */
export default async function LegacyParentPayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`${PARENT_PAY_PATH}/${encodeURIComponent(token)}`);
}
