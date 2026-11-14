/**
 * Yaş beyanında eksik ne (arayüz ve sunucu aynı cümleyi kullanır). Ayrı ve zod'suz modül (15 Kasım 2026): kök
 * düzendeki onay kapısı bu tek işlev için `consent-evidence.ts`'i içe aktarınca zod şemaları her sayfanın paketine
 * giriyordu; zod 4 nesne şemasının hızlı yolu için `Function("")` yoklaması yapıyor ve rapor kipindeki CSP her sayfa
 * açılışında `/api/csp-report`'a "eval" raporu gönderiyordu. Davranış aynı; `consent-evidence.ts` bunu yeniden dışa verir.
 */
export type AgeDeclarationInput = { minor?: boolean; guardianAck?: boolean };

export function ageProblem(age: AgeDeclarationInput | null | undefined): string | null {
  if (!age || typeof age.minor !== "boolean") return "Yaşını seç.";
  if (age.minor && !age.guardianAck) return "18 yaşından küçüksen velinin iznini onayla.";
  return null;
}
