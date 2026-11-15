import { SOURCE_NUMBER_PRIORITY } from "@/lib/learning/teaching-rubric";

/**
 * Düello seti istem eki (15 Kasım 2026, Burhan onayı, düello 9B). Yazar test motorunun kendi kurallarını (`TEST_SET_RULE`,
 * şık sayısı, eşdeğer şık …) zaten okuyor; bu ek yalnız düellonun farkını söyler: kolaydan zora sıra, sınav tuzağı, kısa
 * hesap, tekrar yok. Bu sürüm yalnız düello ekranının oynatabildiği biçimi ister (tek doğrulu çoktan seçmeli); doğru/yanlış
 * ve boşluk doldurma türleri ekran ve motor desteği gelince eklenir (`duello-9b-oneri.md` §2.1).
 */
export const DUEL_SET_RULE = [
  "DÜELLO SETİ (kesin):",
  "- Sorular kolaydan zora sıralı: ilk üçte biri kolay (tek bilgi, tanım), ortası orta, son üçte biri zor (iki bilgiyi birleştiren ya da kısa hesap isteyen).",
  "- En az iki soru bir sınav tuzağını yoklar: doğru olmayan şıklardan biri, öğrencilerin bu konuda gerçekten düştüğü yanılgının kendisidir. Yanılgıyı kaynağın uyarı, sık hata ya da 'karıştırılır' cümlesinden al; kaynakta yoksa ders kitabının bilinen yanılgısından, uydurma yanılgı yazma.",
  "- Kaynakta sayı ya da formül varsa en az bir soru kısa bir hesap ister; sonucu kendin hesapla ve doğru şıkla karşılaştır.",
  "- Aynı bilgiyi iki kez sorma; aynı doğru cevap en çok iki soruda.",
  "- Her soru 20 saniyede okunup cevaplanır; uzun kök ve uzun hesap yok.",
  SOURCE_NUMBER_PRIORITY,
].join("\n");
