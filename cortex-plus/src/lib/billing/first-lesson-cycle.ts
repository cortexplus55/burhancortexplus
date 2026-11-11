import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { freePreview } from "@/lib/billing/free-preview";
import { readFirstTopic } from "@/lib/billing/free-topic-gate";
import { firstLessonCycleNode } from "@/lib/billing/free-topic-rule";

/*
  İlk dersin temel döngüsü haftalık ders hakkına takılmaz (11 Kasım 2026, ürün sahibinin kararı).

  Ücretsiz hesapta ilk hazırlığın 1. konusu 31 Ekim'den beri açık (free-topic-gate.ts), ama dersleri haftalık ders
  sayacından (3) düşüyordu: sayaç Çalışma Stüdyosu'ndaki bir test ya da "Farklı anlat" ile dolmuşsa — ya da konunun
  birden çok ders adımı varsa — öğrenci kendi ilk dersinin ortasında "Bu haftaki 3 ücretsiz ders hakkın bitti"
  duvarına çarpıyordu. Karar: ilk dersin temel adımları (konu anlatımı, kartlar, doğru/yanlış, konu testi) ne kadar
  sürerse sürsün açık.

  Uygulama göçsüz: bu adımların İLK açılışı SQL'in zaten tanıdığı "derse dahil" sayacıyla ayrılır
  (`credit_reserve_metered`, `p_meter = 'included'`; günde 40, kötüye kullanım sınırı). Haftalık ders sayacı artmaz
  ve dolu olması açılışı engellemez. Sınırlar:
   - Yalnız adımın kendi ilk içeriği. Öğrenciye verilmiş kaydı olan adımı yeniden yazdırmak ve "Farklı anlat"
     (çağıran `rewrite` isteğinde buraya sormaz) bugünkü gibi haftalık ders hakkından düşer.
   - Yalnız 1. konunun kendi adımları (`firstLessonCycleNode`); adım üzerinden başka konu istenirse (`?konu=`) sayılmaz.
   - Yalnız İLK hazırlık: bu hazırlık kurulmadan önce hesap ücretsiz sayaçla bir yol adımı açmışsa (silinmiş bir
     hazırlıkta) yeni hazırlık "ilk" değildir. Ücretsiz hesap tek hazırlık tutar ama silip yenisini kurabilir; kural
     olmasa her konuya ayrı hazırlık kurup her birinin ilk dersini haftalık hak harcamadan açabilirdi. Kanıt kredi
     ayırmalarında durur (hazırlık silinse de kalır): `free_meter = 'included'`, anahtarı `exam_node_…`.
     Yöneticinin "ücretsiz gibi gör" önizlemesinde yalnız önizleme başladıktan sonraki ayırmalar sayılır.
  Okuma düşerse kural uygulanmaz: adım bugünkü gibi haftalık ders hakkından düşer (maliyet aleyhine hata yapma).
*/

/** Öğrenciye verilmiş kayıt (`node-free-meter.ts` ile aynı tanım): yazımı süren ya da düşen kayıt sayılmaz. */
const DELIVERED_STATUSES = ["active", "completed"];

/** Yol adımının kredi anahtarı öneki (`attempt-lifecycle.ts`: `exam_node_slot_…`, `exam_node_start_…`, `exam_node_v1_…`). */
const PATH_STEP_KEY_PATTERN = "exam_node_%";

export type FirstLessonCycleInput = {
  userId: string;
  prepId: string;
  nodeId: string;
  kind: string;
  /** Düğümün kendi oturum bilgisi (`exam_prep_nodes.session_meta`). */
  sessionMeta: unknown;
  topicLabel: string;
  /** Öğrencinin istekle gönderdiği konu (`?konu=`). */
  requestedTopicLabel: string | null;
};

/**
 * Bu açılış ilk dersin temel döngüsünde mi: çağıran (`start.ts`) hesabın sayaçlı olduğunu ve adımın haftalık ders
 * hakkından düşeceğini bilir; `true` dönerse adımı "derse dahil" sayacıyla ayırır.
 */
export async function firstLessonCycleFree(service: SupabaseClient, input: FirstLessonCycleInput): Promise<boolean> {
  try {
    const [first, delivered, createdAt] = await Promise.all([
      readFirstTopic(service, input.prepId),
      stepDelivered(service, input),
      prepCreatedAt(service, input),
    ]);
    if (!first || delivered || !createdAt) return false;
    if (
      !firstLessonCycleNode(first.first, {
        kind: input.kind,
        sessionMeta: input.sessionMeta,
        topicLabel: input.topicLabel,
        requestedTopicLabel: input.requestedTopicLabel,
      })
    ) {
      return false;
    }
    return await firstFreePrep(service, { userId: input.userId, createdAt });
  } catch {
    return false;
  }
}

async function stepDelivered(service: SupabaseClient, input: { userId: string; nodeId: string }): Promise<boolean> {
  const { data, error } = await service
    .from("exam_prep_node_attempts")
    .select("id")
    .eq("node_id", input.nodeId)
    .eq("user_id", input.userId)
    .in("status", DELIVERED_STATUSES)
    .not("payload", "is", null)
    .limit(1);
  if (error) throw new Error("first_lesson_attempts_unreadable");
  return (data ?? []).length > 0;
}

async function prepCreatedAt(service: SupabaseClient, input: { userId: string; prepId: string }): Promise<string | null> {
  const { data, error } = await service
    .from("exam_preps")
    .select("created_at")
    .eq("id", input.prepId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error) throw new Error("first_lesson_prep_unreadable");
  return typeof data?.created_at === "string" && data.created_at ? data.created_at : null;
}

/** Hazırlık kurulmadan önce hesap ücretsiz sayaçla yol adımı açmamışsa bu, hesabın ilk hazırlığıdır. */
async function firstFreePrep(service: SupabaseClient, input: { userId: string; createdAt: string }): Promise<boolean> {
  const preview = await freePreview(service, input.userId).catch(() => null);
  let query = service
    .from("credit_reservations")
    .select("id")
    .eq("user_id", input.userId)
    .eq("free_meter", "included")
    .neq("status", "refunded")
    .like("idempotency_key", PATH_STEP_KEY_PATTERN)
    .lt("created_at", input.createdAt);
  if (preview) query = query.gte("created_at", preview.startedAt);
  const { data, error } = await query.limit(1);
  if (error) throw new Error("first_lesson_history_unreadable");
  return (data ?? []).length === 0;
}
