import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionCode } from "@/lib/env";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { billingExempt, freePreview } from "@/lib/billing/free-preview";
import { CREDIT_PRICE_TABLE } from "@/lib/credits/price-table";

/*
  Ücretsiz hesap = deneme için TEK ders (11 Kasım 2026 akşamı, ürün sahibinin kararı).

  "Yeni kayıt olan denemesi için kayıtlı kullanıcıya sadece 1 ders ücretsiz vereceğiz. Daha fazlası için Plus'a
  yönlendireceğiz." Haftalık 3 ders hakkı kalktı. Ücretsiz hesapta açık kalan ders, ilk hazırlığın 1. konusunun
  ilk ders döngüsüdür; o adımlar "derse dahil" sayacıyla ayrılır (`first-lesson-cycle.ts`) ve bu kapıya hiç gelmez.

  Bu kapı, ders sayacına ("lesson") düşecek her işin önünde durur: Çalışma Stüdyosu'ndaki test, kart ve
  doğru/yanlış; "Farklı anlat" (yeni ders yazımı); verilmiş adımın yeniden yazımı; ilk olmayan hazırlığın dersi;
  dersi açılmamış konunun testi; düello ve zor soru üretimi. Karar:
   - "open": hesap sayaçlı değil (abone, kodla açılan Plus denemesi, önizlemesi kapalı kurucu). Bugünkü yol.
   - "gift": ücretsiz hesap, ama cüzdan bakiyesi (davet hediyesi, aboneliği biten öğrencinin ek paketi) işi
     karşılıyor. İş o bakiyeden ödenir (24 Ekim'den beri "sayaç dolunca hediye bakiyesi" davranışı aynen).
   - "plus": ücretsiz hesap ve bakiye yetmiyor: iş açılmaz, 402 `free_lesson_limit`. Beklemek çözmez; ekran geri
     sayım değil Plus kapısını gösterir. "Ücretsiz gibi gör" önizlemesindeki kurucunun cüzdanı hediye sayılmaz.

  Kapı koddadır ve SQL'e güvenmez: model çağrısından ve kredi ayırmadan önce karar verir (`reserveCredits`, yol
  adımı açılışı ve Stüdyo uçları aynı işlevi çağırır). SQL'deki sıfır sınır (göç 20261111180000) ikinci hattır.
  Okuma düşerse: hesabın planı okunamıyorsa "open" (kararı SQL verir); cüzdan okunamıyorsa "gift" (ayırma sayaçsız
  yapılır, bakiye yetmezse SQL reddeder ve çağıran aynı 402'yi döner). İki durumda da ücretsiz iş verilmez.
*/

/** Ders sayacına düşen işin reddi; SQL'in `free_limit:lesson` hatasıyla aynı kod (`refusalCode`). */
export const FREE_LESSON_CODE = "free_lesson_limit";

export type FreeLessonGate = "open" | "gift" | "plus";

type GateOptions = {
  /** Kaç birim iş (ders sayacındaki işlerde hep 1). */
  quantity?: number;
  /** Çağıran hesabın sayaçlı olduğunu zaten okudu (yol adımı açılışı): plan yeniden okunmaz. */
  metered?: boolean;
};

export async function freeLessonGate(
  service: SupabaseClient,
  userId: string,
  actionCode: ActionCode,
  options: GateOptions = {},
): Promise<FreeLessonGate> {
  if (options.metered !== true) {
    try {
      const [entitlements, exempt] = await Promise.all([
        getUserEntitlements(service, userId),
        billingExempt(service, userId),
      ]);
      if (entitlements.isPremium || exempt) return "open";
    } catch {
      return "open";
    }
  }
  // Önizlemedeki kurucu ücretsiz hesap gibi durur: cüzdanı hediye değil (SQL `credit_reserve_metered` ile aynı karar).
  if (await freePreview(service, userId).catch(() => null)) return "plus";
  try {
    const [rule, wallet] = await Promise.all([
      service.from("credit_rules").select("credit_cost").eq("action_code", actionCode).eq("active", true).maybeSingle(),
      service.from("credit_wallets").select("balance").eq("user_id", userId).maybeSingle(),
    ]);
    if (wallet.error) return "gift";
    const unit = typeof rule.data?.credit_cost === "number" ? rule.data.credit_cost : CREDIT_PRICE_TABLE[actionCode].credits;
    const cost = unit * Math.min(Math.max(Math.trunc(options.quantity ?? 1) || 1, 1), 1000);
    const balance = Number((wallet.data as { balance?: unknown } | null)?.balance ?? 0);
    return balance >= cost ? "gift" : "plus";
  } catch {
    return "gift";
  }
}

/** Uçların erken kapısı: iş bu hesapta açılmıyor mu (402 `FREE_LESSON_CODE` dönülür). */
export async function freeLessonRefused(
  service: SupabaseClient,
  userId: string,
  actionCode: ActionCode,
  options: GateOptions = {},
): Promise<boolean> {
  return (await freeLessonGate(service, userId, actionCode, options)) === "plus";
}
