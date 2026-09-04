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
    "Anlaşılır öğret. Markdown ve LaTeX kullanabilirsin. Öğrencinin tercih ettiği anlatım stili ayrıca sistem mesajında verilir.",
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
