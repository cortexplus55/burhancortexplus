import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Yayındaki AI talimatları.
 *
 * `prompt_versions` tablosu vardı, yönetim panelinde sayfası vardı, "yayına al"
 * düğmesi vardı — ama çalışan kod o tabloyu hiç okumuyordu. Talimat, sohbet
 * rotasındaki bir sabitten geliyordu. Yani panelde bir sürümü yayına almak
 * hiçbir şeyi değiştirmiyordu; sayfa yalan söylüyordu.
 *
 * Burası o boşluğu kapatıyor: kod önce tabloya bakıyor, orada yayında bir
 * sürüm yoksa koddaki varsayılana düşüyor. Tablo boşken de her şey bugünkü
 * gibi çalışıyor.
 */
export const PROMPT_KEYS = {
  /** Sohbetteki öğrenci öğretmeni. */
  studentChat: "student_chat",
} as const;

export type PromptKey = (typeof PROMPT_KEYS)[keyof typeof PROMPT_KEYS];

/** Tabloda yayında sürüm yoksa kullanılan metinler. */
export const BUILTIN_PROMPTS: Record<PromptKey, string> = {
  student_chat:
    "Sınav öğretmeni gibi yaz: net ve kısa. Filler ve motivasyon cümlesi yok. Öğrenci 'anlamadım' derse aynı benzetmeyi tekrar etme; yeni bir açıdan tek adım ver. " +
    "Sohbet geçmişinde aynı konuyu daha önce başka bir benzetmeyle anlattıysan ve öğrenci hâlâ anlamadığını söylüyorsa, AYNI benzetmeyi tekrar etme — tamamen farklı bir benzetme veya farklı bir açıdan anlat. " +
    "Uzun cevapları tanım, örnek ve (varsa) sık yapılan hata gibi kısa bölümlere ayır. " +
    "Öğrenci bir cevap ya da çözüm denemesi paylaştığında, doğru olduğunu söylemeden önce kendi hesabını/muhakemeni sessizce yap; yanlışsa nazikçe düzelt, asla önce 'doğru' deyip sonra düzeltme. " +
    "Yanıtını HER ZAMAN öğrencinin durumuna özgü, somut bir soruyla bitir — anlayışını test eden bir soru sor ya da iki somut devam yolu sun. 'Başka sorun var mı?' gibi jenerik kapanışlar kullanma. " +
    "Markdown ve LaTeX kullanabilirsin. Öğrencinin tercih ettiği anlatım stili ayrıca sistem mesajında verilir.",
};

/**
 * Yayındaki talimatı getirir.
 *
 * Her istekte okunuyor, önbelleğe alınmıyor: panelde "yayına al" denince
 * değişikliğin bir sonraki sorudan itibaren geçerli olacağı yazıyor ve bunun
 * doğru olması gerekiyor. Sorgu tek satır ve anahtar üzerinden.
 */
export async function loadActivePrompt(
  supabase: SupabaseClient,
  key: PromptKey,
): Promise<string> {
  const { data } = await supabase
    .from("prompt_versions")
    .select("content")
    .eq("key", key)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const stored = typeof data?.content === "string" ? data.content.trim() : "";
  return stored || BUILTIN_PROMPTS[key];
}
