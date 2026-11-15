import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pathSkipKinds } from "@/lib/billing/node-free-meter";
import { nextPrepStep, type PrepCardNode } from "@/lib/learning/prep-cards";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";

/**
 * Silinmiş adımın bağlantısı (15 Kasım 2026, H1 · canlıda "Devam et" ilk tıklamada 404). Hazırlık sayfası yanıttan sonra
 * kaçırılan günleri yeniden dağıtıyor (`maybeRescheduleMissedDays`, `after()`); `replace_exam_prep_schedule` bitmemiş ve
 * başlanmamış adımları silip yeni kimlikle yazıyor. Ekranda kalan bağlantı eski kimliği taşıdığı için adım sayfası
 * bulamıyordu. Şimdi bulunamayan adım, tıklama anındaki güncel "Sıradaki adım"a yönlenir (ücretsiz hesapta Plus adımı
 * atlanır, hazırlık sayfasıyla aynı kural); sıradaki adım yoksa hazırlık sayfasına.
 */
export async function staleNodeTarget(
  service: SupabaseClient,
  input: { prepId: string; userId: string },
): Promise<string> {
  try {
    const [{ data: nodes }, skipKinds] = await Promise.all([
      service
        .from("exam_prep_nodes")
        .select("id, kind, title, status, sort_order, session_meta")
        .eq("exam_prep_id", input.prepId),
      pathSkipKinds(service, input.userId),
    ]);
    const next = nextPrepStep(
      input.prepId,
      ((nodes ?? []) as Record<string, unknown>[]).map(
        (row): PrepCardNode => ({
          id: String(row.id ?? ""),
          status: (row.status as PrepCardNode["status"]) ?? "locked",
          kind: (row.kind as string | null) ?? null,
          title: (row.title as string | null) ?? null,
          sortOrder: (row.sort_order as number | null) ?? null,
          sessionMeta: (row.session_meta as PrepCardNode["sessionMeta"]) ?? null,
        }),
      ),
      skipKinds,
    );
    return next?.href ?? examPrepHomeHref(input.prepId);
  } catch {
    return examPrepHomeHref(input.prepId);
  }
}
