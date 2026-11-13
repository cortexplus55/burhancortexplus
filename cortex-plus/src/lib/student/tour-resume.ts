import type { SetupExam } from "@/lib/curriculum/yks-alan";
import type { TourProgress } from "@/lib/marketing/guest-tour-progress";

/**
 * Turdan kayda süreklilik (C3, 13 Kasım 2026, ürün sahibinin kararı): misafir ana sayfanın turunda yol haritasına
 * kadar geldiyse, kayıttan sonraki ilk ana ekranda (henüz hiç hazırlığı yokken) tek kart: turdaki konuyu hazır
 * müfredattan gerçek bir hazırlık olarak başlatan resmî kurulum.
 *
 * Kart yalnız bir yol gösterir: turdaki cevaplar ölçüm sayılmaz, hazırlık yüzdesi ya da kanıt yazılmaz. Kurulum
 * bugünkü resmî kurulumdur (`/deneme-sinavlari/resmi/kurulum`); `konu` sözcüğü ağaçta ünite adında ya da kazanım
 * metninde aranır ve yalnız eşleşen üniteler seçili açılır (`selectionForTopic`). Eşleşme yoksa kurulum bugünkü
 * hâliyle açılır. Kodda konu listesi yok: konu resmî kayıt defterinden gelir.
 */

/** Kartın tek cümlesi (ürün sahibinin onayladığı söz). */
export const TOUR_RESUME_LINE = "Turda denemiştin — Köklü Sayılar ile başla";

/**
 * Turdaki örnek dersin konusu, resmî kurulum ağacında aranacak sözcük. "kareköklü" de eşleşir. Bekçi test her hedef
 * sınavın ağacında en az bir eşleşme olduğunu tutar.
 */
export const TOUR_TOPIC_TERM = "köklü";

export type TourResumeTarget = { exam: SetupExam; alan: "tyt" | null };

/** Turda yol haritasına ulaşıldı mı (kart ancak o zaman görünür). */
export function tourReachedRoadmap(progress: TourProgress | null): boolean {
  return Boolean(progress?.steps.includes("roadmap"));
}

function gradeNumber(gradeLevel: string): number | null {
  const match = /^(\d{1,2})\./.exec(gradeLevel.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Hangi resmî kurulum: önce öğrencinin hedefi (profil), sonra sınıfı, en son turdaki sekme. Her hedefin ağacında
 * konu var (bekçi); konusu olmayan sınavlar (TUS, DUS, YDS) sekmeye düşer.
 *
 * - LGS hedefi ya da 5–8. sınıf → LGS Matematik (8. sınıf "Kareköklü İfadeler").
 * - KPSS, ALES, DGS hedefi → o sınavın sayısal ağacı.
 * - Lise, YKS ve öbürleri → YKS TYT Temel Matematik (9. sınıf kazanımları TYT kapsamında).
 * - Turdaki "akademik" sekmesi (kayıtta KPSS'ye ön seçilir) → KPSS.
 */
export function tourResumeTarget(input: {
  segment: string | null | undefined;
  gradeLevel?: string | null;
  goalText?: string | null;
}): TourResumeTarget {
  const goal = (input.goalText ?? "").trim();
  if (/^LGS/i.test(goal)) return { exam: "lgs", alan: null };
  if (/^KPSS/i.test(goal)) return { exam: "kpss", alan: null };
  if (/^ALES/i.test(goal)) return { exam: "ales", alan: null };
  if (/^DGS/i.test(goal)) return { exam: "dgs", alan: null };
  if (/^YKS/i.test(goal)) return { exam: "yks", alan: "tyt" };
  const grade = gradeNumber(input.gradeLevel ?? "");
  if (grade != null && grade >= 5 && grade <= 8) return { exam: "lgs", alan: null };
  if (input.segment === "akademik") return { exam: "kpss", alan: null };
  return { exam: "yks", alan: "tyt" };
}

/** Kartın gittiği adres: resmî kurulum, sınav (ve YKS'de TYT) seçili, konu sözcüğüyle. */
export function tourResumeHref(input: {
  segment: string | null | undefined;
  gradeLevel?: string | null;
  goalText?: string | null;
}): string {
  const target = tourResumeTarget(input);
  const params = new URLSearchParams({ sinav: target.exam });
  if (target.alan) params.set("alan", target.alan);
  params.set("konu", TOUR_TOPIC_TERM);
  return `/deneme-sinavlari/resmi/kurulum?${params.toString()}`;
}
