import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Oylama sütunları veritabanında var mı?
 *
 * Kod ile göç dosyası aynı anda yayına çıkmıyor: kod Vercel'e push ile gidiyor,
 * göç ise elle uygulanıyor. Arada kalan sürede oylama düğmesini göstersek
 * basıldığında hata verirdi — hiçbir şey yapmayan düğme, olmayan düğmeden
 * kötü. Bu yüzden özellik sütun gelene kadar kendini kapalı tutuyor ve göç
 * uygulandığı an ilk soğuk başlangıçta kendiliğinden açılıyor.
 *
 * Sonuç sunucu örneği başına bir kez sorulup saklanıyor; istek başına ek
 * sorgu yok. Göç kalıcı olarak uygulandıktan sonra bu dosya ve çağrıları
 * silinebilir.
 */
let cached: Promise<boolean> | undefined;

export function messageFeedbackEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  cached ??= (async () => {
    const { error } = await supabase.from("messages").select("rating").limit(1);
    return !error;
  })();
  return cached;
}
