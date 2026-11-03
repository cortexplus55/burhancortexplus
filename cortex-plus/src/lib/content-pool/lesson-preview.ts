/** Yol sayfası için sıradaki havuz dersinin ilk ekranı (yalnız okuma; model çağrısı, üretim ve kredi yok). */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { poolSliceForTopic, readPoolLesson, sliceLesson } from "@/lib/content-pool/serve";
import { readOutcomeLesson } from "@/lib/content-pool/outcome-store";
import { previewFromSavedLesson, previewFromSections, type LessonPreview } from "@/lib/learning/instant-lesson";

const TIMEOUT_MS = 250;

export async function poolLessonPreview(
  service: SupabaseClient,
  input: { prefs: unknown; topicLabel: string | null | undefined; title: string },
): Promise<LessonPreview | null> {
  const slice = poolSliceForTopic(input.prefs, input.topicLabel);
  if (!slice?.units.length) return null;
  const read = async (): Promise<LessonPreview | null> => {
    // Tek kazanımlı konu: önce kazanım dersi (açılış onu sunar), yoksa ünite dilimi.
    if (slice.codes?.size === 1 && slice.units.length === 1) {
      const code = [...slice.codes][0]!;
      const outcome = slice.units[0]!.outcomes.find((o) => o.code === code);
      const body = outcome ? await readOutcomeLesson(service, slice.units[0]!, outcome.outcomeId).catch(() => null) : null;
      if (body) return previewFromSections(input.title, body.sections);
    }
    const bodies = await Promise.all(slice.units.map(async (unit) => ({ unit, body: await readPoolLesson(service, unit).catch(() => null) })));
    const ok = bodies.filter((b): b is { unit: (typeof slice.units)[number]; body: NonNullable<typeof b.body> } => Boolean(b.body));
    if (!ok.length) return null;
    return previewFromSections(input.title, sliceLesson(ok, slice.codes, input.title).sections);
  };
  // Yol sayfasını bekletmez: okuma yetişmezse önizleme yok (loading iskeleti çizer).
  return Promise.race([read().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS))]);
}

/**
 * "Tekrar İncele" önizlemesi (3 Kasım 2026): öğrencinin kendi son kayıtlı dersinin ilk ekranı, 250 ms sınırlı okuma.
 * Tam kayıt yine başlatma isteğiyle gelir; bu yalnız ilk metni sunucu çiziminde taşır.
 */
export async function savedLessonPreview(
  service: SupabaseClient,
  input: { userId: string; prepId: string; nodeId: string; title: string },
): Promise<LessonPreview | null> {
  const read = async (): Promise<LessonPreview | null> => {
    const { data } = await service
      .from("exam_prep_node_attempts")
      .select("payload")
      .eq("node_id", input.nodeId)
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId)
      .in("status", ["completed", "active"])
      .order("created_at", { ascending: false })
      .limit(3);
    for (const row of data ?? []) {
      const preview = previewFromSavedLesson(input.title, row.payload);
      if (preview) return preview;
    }
    return null;
  };
  return Promise.race([read().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS))]);
}
