import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_VERSION, poolUnit } from "@/lib/content-pool/keys";
import type { LessonBody } from "@/lib/content-pool/schema";
import { screenLead } from "@/lib/content-pool/serve";

/**
 * Ünite sayfasının havuz özeti (27 Kasım 2026, /mufredat ince içerik temizliği). 864 ünite sayfası yalnız kazanım listesiydi
 * (ortanca 53 kelime; denetim `docs/seo/mufredat-ince-icerik-denetimi.md`). Havuzda her ünitenin doğrulanmış dersi var:
 * genel bakış, kazanım başına bölüm (başlık, anlatım, kilit noktalar), terimler ve özet. Sayfa bunları gösterir; model
 * çağrısı yok.
 *
 * Üç durum ayrı tutulur:
 * - `ok`: doğrulanmış ders var, sayfa zenginleşir ve dizinde kalır.
 * - `missing`: bu ünitenin güncel, doğrulanmış dersi gerçekten yok (satır yok, kazanımlar değişmiş ya da genel bakış boş)
 *   → sayfa `noindex, follow` olur.
 * - `error`: okuma düştü ya da süreyi aştı → sayfa eski hâliyle açılır ama dizinden çıkarılmaz (geçici bir hata bir gün
 *   önbellekte kalacak bir noindex'e dönmesin).
 */

export type UnitPreviewOutcome = {
  code: string;
  /** Havuz bölümünün başlığı; bölüm yoksa boş. */
  heading: string;
  /** Anlatımın ilk cümlesi. */
  lead: string | null;
  /** Bölümün ilk kilit noktaları (ünitede 1-2 kazanım varsa 4, yoksa 2). */
  keyPoints: string[];
};

export type UnitPreview = {
  overview: string;
  summary: string | null;
  /** Kayıt defterindeki kazanım sırasıyla. */
  outcomes: UnitPreviewOutcome[];
  keyTerms: Array<{ term: string; definition: string }>;
};

export type UnitPreviewResult = { state: "ok"; preview: UnitPreview } | { state: "missing" } | { state: "error" };

export const UNIT_PREVIEW_TIMEOUT_MS = 3_500;
const MAX_KEY_TERMS = 8;
/** Az kazanımlı ünitede sayfa kısa kalmasın diye kazanım başına daha çok kilit nokta. */
const keyPointLimit = (outcomeCount: number) => (outcomeCount <= 2 ? 4 : 2);

/** `unitIndex` 0 tabanlı (kayıt defteri sırası); havuz kimliği `program#sıra` 1 tabanlı. Asla fırlatmaz. */
export async function loadUnitPreview(
  service: SupabaseClient,
  input: { programId: string; unitIndex: number },
): Promise<UnitPreviewResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<UnitPreviewResult>((resolve) => {
    timer = setTimeout(() => resolve({ state: "error" }), UNIT_PREVIEW_TIMEOUT_MS);
  });
  try {
    return await Promise.race([readUnitPreview(service, input), timeout]);
  } catch {
    return { state: "error" };
  } finally {
    clearTimeout(timer);
  }
}

async function readUnitPreview(
  service: SupabaseClient,
  input: { programId: string; unitIndex: number },
): Promise<UnitPreviewResult> {
  const unit = poolUnit(`${input.programId}#${input.unitIndex + 1}`);
  if (!unit) return { state: "missing" };
  const { data, error } = await service
    .from("topic_content")
    .select("body, unit_sha256")
    .eq("unit_id", unit.unitId)
    .eq("kind", "lesson")
    .eq("program_id", unit.program.id)
    .eq("version", CONTENT_VERSION)
    .eq("status", "verified")
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { state: "error" };
  // Satır yok ya da kazanımlar değişmiş (ders eski kazanımlara göre yazılmış): bu ünitenin güncel özeti yok.
  if (!data || data.unit_sha256 !== unit.sha256) return { state: "missing" };
  const lesson = data.body as LessonBody | null;
  const overview = lesson?.overview?.trim() ?? "";
  if (!lesson || !overview) return { state: "missing" };
  const sections = Array.isArray(lesson.sections) ? lesson.sections : [];

  const outcomes = unit.outcomes.map((outcome, index): UnitPreviewOutcome => {
    const section =
      sections.find((s) => s.outcome_code === outcome.code) ??
      (sections.length === unit.outcomes.length ? sections[index] : undefined);
    return {
      code: outcome.code,
      heading: section?.heading?.trim() ?? "",
      lead: section?.explanation ? screenLead(section.explanation) : null,
      keyPoints: (section?.key_points ?? [])
        .map((point) => point.replace(/\*\*/g, "").trim())
        .filter(Boolean)
        .slice(0, keyPointLimit(unit.outcomes.length)),
    };
  });

  return {
    state: "ok",
    preview: {
      overview,
      summary: lesson.summary?.trim() || null,
      outcomes,
      keyTerms: (lesson.key_terms ?? []).slice(0, MAX_KEY_TERMS),
    },
  };
}

/** Sayfaya eklenen metnin kelime sayısı (bekçi ve ölçüm için). */
export function unitPreviewWordCount(preview: UnitPreview): number {
  const text = [
    preview.overview,
    preview.summary ?? "",
    ...preview.outcomes.flatMap((o) => [o.heading, o.lead ?? "", ...o.keyPoints]),
    ...preview.keyTerms.flatMap((t) => [t.term, t.definition]),
  ].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}
