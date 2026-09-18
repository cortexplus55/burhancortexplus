import "server-only";
import type { createServiceClient } from "@/lib/supabase/server";

/**
 * Zor soru yükseltmesinin aylık tavanı.
 *
 * Yükseltme, premium bir hesapta zor soruyu gpt-4o'ya çıkarıp krediyi
 * artırmamak demek (`model-router.ts`). Bedeli bizim olduğu için bir tavanı
 * olması gerekiyor: Plus ayda 400 kredi veriyor ve tavansız hâlde bunların
 * hepsi gpt-4o'ya gidebiliyordu.
 *
 * 60, bir Plus ayının %15'i. Günde ~2 zor soru soran öğrenci tavanı hiç
 * görmüyor; her mesajı zor okunan hesap 60'tan sonra standart modelde devam
 * ediyor — cevabını almaya devam ediyor, yalnızca ikramı bitiyor.
 */
export const HARD_UPGRADE_MONTHLY_LIMIT = 60;

type Service = ReturnType<typeof createServiceClient>;

/**
 * Bu ay bir yükseltme hakkı ister. Verildiyse `true` ve sayaç arttı.
 *
 * Hata hâlinde `false` dönüyor — yani kapalıya düşüyor. Sayacın çalışmadığı
 * bir anda herkese sınırsız gpt-4o vermek, ölçmediğimiz bir maliyeti açık
 * bırakmak olurdu. Öğrenci bu durumda da cevabını alıyor: yükseltme
 * olmayınca istek standart modelle sürüyor, reddedilmiyor.
 */
export async function claimHardUpgrade(
  service: Service,
  userId: string,
): Promise<boolean> {
  const { data, error } = await service.rpc("claim_model_upgrade", {
    p_user_id: userId,
    p_limit: HARD_UPGRADE_MONTHLY_LIMIT,
  });
  if (error) return false;
  return data === true;
}
