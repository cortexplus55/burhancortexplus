/**
 * Cevap iki kez denetimden geçemediğinde öğrenciye ne söylenecek?
 *
 * Eskiden hiçbir şey söylenmiyordu: akış hata veriyor, ekranda boş bir yanıt
 * ya da kırık bir satır kalıyordu. Kredi iade ediliyordu ama öğrenci bunu
 * bilmiyordu; gördüğü şey "bu sistem çalışmıyor"du.
 *
 * İki ayrı durum var ve ikisini aynı cümleyle geçmek yanlış olur:
 *
 *   • Ücretsiz hesap, zor soru — gerçek bir sınıra çarptı. Bunu söylemek
 *     dürüstlük, üstelik paywall'ın kazanılmış hâli: öğrenci reklamı değil
 *     kendi sorusunun cevabını arıyorken sınırı görüyor.
 *   • Diğer her durum — bizim tarafta bir şey tutmadı. Öğrenciye abonelik
 *     önermek burada saygısızlık olur; zaten ödüyor ya da soru zor değil.
 *
 * Kredi her iki hâlde de iade ediliyor: cevap alamadığı bir şey için para
 * ödemiyor.
 */

export function chatFallbackMessage(input: {
  isPremium: boolean;
  difficulty: "easy" | "medium" | "hard";
}): string {
  if (!input.isPremium && input.difficulty === "hard") {
    return (
      "Bu soruyu iki kez denedim ama verdiğim cevabın doğruluğundan emin " +
      "olamadım, o yüzden sana yanlış bir şey göstermek istemiyorum. " +
      "Kredin harcanmadı.\n\n" +
      "Bu tür sorular — çok adımlı çözümler, ispatlar, uzun problem " +
      "metinleri — daha güçlü modeli gerektiriyor. Plus'ta soruların " +
      "otomatik olarak o modele gidiyor.\n\n" +
      "Şimdi denemek istersen: soruyu parçalara böl, tek tek soralım. " +
      "Çoğu zaman bu da işe yarıyor."
    );
  }

  return (
    "Bu soruyu iki kez denedim ama verdiğim cevabın doğruluğundan emin " +
    "olamadım, o yüzden sana yanlış bir şey göstermek istemiyorum. " +
    "Kredin harcanmadı.\n\n" +
    "Soruyu biraz daha açar mısın — neyin verildiğini ve neyin sorulduğunu " +
    "ayrı yazarsan genelde ilk denemede çıkıyor."
  );
}
