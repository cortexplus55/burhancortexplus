/**
 * Saate göre selamlama.
 *
 * Küçük ama gerçek bir kişiselleştirme dokunuşu: oturum açmadan da (ör.
 * /ornek vitrin sayfası) "şu an sana özel bir şey oluyor" hissi veriyor.
 * Saat dilimi kullanıcının tarayıcısınınki — sunucu tarafında render
 * edilirse `date` parametresiyle sabitlenip testlerde deterministik kalır.
 */
export function timeGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 6) return "İyi geceler";
  if (hour < 11) return "Günaydın";
  if (hour < 18) return "İyi günler";
  if (hour < 22) return "İyi akşamlar";
  return "İyi geceler";
}
