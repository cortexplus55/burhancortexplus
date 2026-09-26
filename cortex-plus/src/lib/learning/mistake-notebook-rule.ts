/**
 * Yanlış defterinin tek kuralı — istemci ve sunucu aynı sayıyı okusun.
 *
 * Bir soruyu bir kez doğru yapmak onu bildiğini kanıtlamıyor; dört şıkta
 * bir isabet zaten dörtte bir. Üst üste iki doğru istiyoruz ve arada bir
 * yanlış girerse sayaç sıfırlanıyor. Kuralın kendisi `nextReviewState`
 * (sunucu) içinde; burada yalnızca eşik var ki arayüz "1/2" yazabilsin.
 */
export const MASTERY_STREAK = 2;
