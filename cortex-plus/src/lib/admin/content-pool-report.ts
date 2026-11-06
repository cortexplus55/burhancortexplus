import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CURRICULUM } from "@/lib/curriculum/registry";
import { groupProgramsByFamily, type FamilyPoolRow } from "@/lib/admin/content-families";

/*
  İçerik havuzu kartı (6 Kasım 2026, /admin/sistem). Ünite toplamı kayıt defterinden (model ve sorgu yok); havuz
  sayıları aile başına dört SAYIM sorgusu (`count: exact, head: true`, satır okunmaz): 9 aile × 4 = 36 sorgu, hepsi
  aynı anda. Göç gerekmez. Bir sayım düşerse o hücre "ölçülemedi" olur, sayfa düşmez.

  - Doğrulanmış dersi olan ünite: `topic_content` kind=lesson, status=verified, outcome_id boş (ünite dersi;
    kazanım dersleri ayrı tür).
  - Doğrulanmış soru: `item_bank` status=verified.
  - Karantinada: `item_bank` status=stale ve `qa.quarantine` dolu (saatlik denetim ya da elle karantina).
  - Yenilenecek: status=stale, karantina işareti yok (ünite yeniden yazılınca emekliye ayrılan eski sürüm).
*/

type CountQuery = PromiseLike<{ count: number | null; error: unknown }>;

async function countOrNull(query: CountQuery): Promise<number | null> {
  try {
    const { count, error } = await query;
    return error || typeof count !== "number" ? null : count;
  } catch {
    return null;
  }
}

export type ContentPoolReport = { rows: FamilyPoolRow[]; unmapped: string[] };

export async function loadContentPoolReport(service: SupabaseClient): Promise<ContentPoolReport> {
  const { families, unmapped } = groupProgramsByFamily(
    CURRICULUM.programs.map((program) => ({ id: program.id, kind: program.kind, unitCount: program.units.length })),
  );
  const rows = await Promise.all(
    families.map(async (family): Promise<FamilyPoolRow> => {
      if (!family.programIds.length) {
        return { ...family, lessonUnits: 0, verifiedItems: 0, quarantinedItems: 0, staleItems: 0 };
      }
      const ids = family.programIds;
      const items = () => service.from("item_bank").select("id", { count: "exact", head: true }).in("program_id", ids);
      const [lessonUnits, verifiedItems, quarantinedItems, staleAll] = await Promise.all([
        countOrNull(
          service
            .from("topic_content")
            .select("id", { count: "exact", head: true })
            .in("program_id", ids)
            .eq("kind", "lesson")
            .eq("status", "verified")
            .is("outcome_id", null),
        ),
        countOrNull(items().eq("status", "verified")),
        countOrNull(items().eq("status", "stale").not("qa->quarantine", "is", null)),
        countOrNull(items().eq("status", "stale")),
      ]);
      const staleItems = staleAll === null || quarantinedItems === null ? null : Math.max(0, staleAll - quarantinedItems);
      return { ...family, lessonUnits, verifiedItems, quarantinedItems, staleItems };
    }),
  );
  return { rows, unmapped };
}
