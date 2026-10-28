import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { istanbulDay } from "@/lib/istanbul-day";
import {
  checkpointsFromEvents,
  detectCheckpointDates,
  mergeCheckpoints,
  type ScheduleCheckpoint,
} from "@/lib/learning/tr-calendar";

/** Belgede ara sınav arayan sayfa sayısı (izlence ve duyuru sayfaları; sözcükle süzülmüş). */
const CHECKPOINT_PAGE_LIMIT = 40;

/**
 * Takvimin ara sınavları (28 Ekim 2026): öğrencinin Takvimim'e eklediği "Vize", "Quiz" … etkinlikleri
 * ve hazırlığın belgelerinde aynı satırda ara sınav sözcüğü ile tarih geçen sayfalar. Okuma düşerse
 * boş liste: takvim yine kurulur, yalnız kontrol adımı konmaz.
 */
export async function loadScheduleCheckpoints(
  service: SupabaseClient,
  input: { userId: string; documentIds: readonly string[]; examDate: string; now?: Date },
): Promise<ScheduleCheckpoint[]> {
  const window = { from: istanbulDay(input.now ?? new Date()), examDate: input.examDate };
  const [events, pages] = await Promise.all([
    service
      .from("calendar_events")
      .select("title, event_date")
      .eq("user_id", input.userId)
      .gt("event_date", window.from)
      .lt("event_date", window.examDate)
      .then(({ data }) => (data ?? []) as { title: string; event_date: string }[], () => []),
    input.documentIds.length
      ? service
          .from("document_pages")
          .select("text_content")
          .in("document_id", [...input.documentIds])
          .or(
            "text_content.ilike.%vize%,text_content.ilike.%ara sınav%,text_content.ilike.%quiz%," +
              "text_content.ilike.%kısa sınav%,text_content.ilike.%midterm%",
          )
          .limit(CHECKPOINT_PAGE_LIMIT)
          .then(({ data }) => (data ?? []) as { text_content: string | null }[], () => [])
      : Promise.resolve([] as { text_content: string | null }[]),
  ]);
  const fromDocs = detectCheckpointDates(pages.map((row) => row.text_content ?? "").join("\n"), window);
  return mergeCheckpoints(checkpointsFromEvents(events, window), fromDocs);
}
