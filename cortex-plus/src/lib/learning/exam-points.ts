/**
 * "Öğretmen gözü" (18 Ekim 2026, ürün sahibinin kararı: "öğretmen olsan bu soruları sorardım
 * mantığıyla mı dökümanlar incelenip öğrenciye aktarılıyor?").
 *
 * Belge yüklenince öğretmen analizi her konu için "Sınavda sorulur" maddeleri çıkarır
 * (`teacher-brain.ts` → `examPoints`): belgenin SINAV İPUCU / AKILDA TUT / ALARM kutuları,
 * tablolar, eşikler, sınıflamalar. Bütün öğretmen motorları bunları aynı başlıkla okur;
 * ders denetçisi de kavramına ait maddenin derste geçip geçmediğine bakar.
 *
 * 18 Ekim incelemesi: 7 Ekim'den beri analiz yeni hazırlıklarda çalışmıyordu, motorlar da 2-3
 * Ekim'den beri okumuyordu — dersin önemli noktaya parmak basması tesadüfe kalmıştı.
 */
export type ExamPointsUse = "lesson" | "quiz" | "podcast" | "cards" | "true_false" | "oral" | "video";

const USE_LINE: Record<ExamPointsUse, string> = {
  lesson:
    "Bunlar dersin omurgası: her madde ilgili kavramın ekranında, kaynağın kendi sayı ve terimleriyle geçsin; " +
    "maddenin kilit ifadesini öne çıkar. Bir maddeyi atlamak dersi eksik bırakır.",
  quiz: "Soruların çoğu bu maddeleri yoklasın; her soru bir maddeye ya da kaynaktaki bir ayırıcı ipucuna dayansın.",
  podcast: "Her madde bir bölümde geçsin; son bölüm bunları sınav öncesi tekrar gibi toparlasın.",
  cards: "Kartların çoğu bu maddelerden kurulsun; arka yüz maddenin kesin bilgisini taşısın.",
  true_false: "Önermelerin çoğu bu maddelerden kurulsun; yanlış önerme maddenin tipik karıştırılan hâli olsun.",
  oral: "Sorular bu maddeleri yoklasın; beklenen noktalar maddelerin kesin bilgisini taşısın.",
  video: "Sahnelerin kilit bilgileri (keyFact) ve anlatımı bu maddelerden seçilsin.",
};

/** İstemlere giren en çok madde sayısı; testin kapsam sayımı da bu sınırla. */
export const EXAM_POINTS_MAX = 8;

/**
 * Motor istemine giren blok. Madde yoksa boş (eski hazırlık ya da analiz henüz yok).
 * Testte maddeler numaralı (20 Ekim 2026): konu testi her sorunun "point" alanına numarayı yazar,
 * denetçi ve kod kapsamı bu numarayla sayar. Öbür motorlar madde imiyle okur.
 */
export function examPointsBlock(points: readonly string[] | undefined, use: ExamPointsUse): string {
  const list = (points ?? []).map((point) => point.trim()).filter(Boolean).slice(0, EXAM_POINTS_MAX);
  if (!list.length) return "";
  return [
    "SINAVDA SORULUR (belgenin öğretmen analizi; yalnız KAYNAK'taki bilgi geçerli, çelişirse KAYNAK haklı):",
    ...list.map((point, index) => (use === "quiz" ? `${index + 1}. ${point}` : `* ${point}`)),
    USE_LINE[use],
  ].join("\n");
}

const foldWord = (word: string) => word.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]/gu, "");
/** Sözcük kökü yerine ilk beş harf: Türkçe ekler sözcüğün sonunda ("reseptörler" ~ "reseptör"). */
const stemOf = (word: string) => foldWord(word).slice(0, 5);

/**
 * Kaynağında geçen sınav maddeleri (24 Ekim 2026 lansman testi). Maddeler konu adıyla öbür belgelerin analizinden
 * de gelebiliyor: beş dosyalı hazırlıkta "Homeostazi" dersi PDF'in 1. sayfasından yazılırken maddeler Word notunun
 * analizinden geldi (reseptör–kontrol merkezi–efektör). Yazar maddeyi derse koydu, denetçi "kaynakta yer almıyor"
 * diye tur açtı; dört tur, 181 sn. Madde, içerik sözcüklerinin (en az 5 harf) yarısı kaynakta geçiyorsa kalır;
 * düşen madde yalnız yönlendirmeyi kaybeder, ders kaynaktan yazılmaya devam eder.
 */
export function examPointsInSource(points: readonly string[] | undefined, source: string): string[] {
  const list = (points ?? []).map((point) => point.trim()).filter(Boolean);
  if (!list.length || !source.trim()) return list;
  const stems = new Set(source.split(/\s+/).filter((word) => foldWord(word).length >= 5).map(stemOf));
  return list.filter((point) => {
    const words = point.split(/\s+/).filter((word) => foldWord(word).length >= 5);
    if (!words.length) return true;
    return words.filter((word) => stems.has(stemOf(word))).length * 2 >= words.length;
  });
}

/**
 * Ders denetçisi: kavramına ait madde yanlış aktarıldıysa ciddi sorun ('high'); kısımda hiç geçmiyorsa öğretim
 * sorunu ('medium': ilk kavramda tur açmaz, sonrakilerde en çok bir tur, kavramı asla attırmaz).
 *
 * 24 Ekim 2026 lansman testi: "Homeostazi ve Geri Bildirim Temelleri" dersinde ilk kavramın adı konunun kendisiydi
 * ("Homeostazi"); denetçi listedeki bütün maddeleri (dar sınırlar, reseptör–kontrol merkezi–efektör, geri bildirim)
 * ona bağlayıp tek ekranlık ilk kavramda eksik saydı. Dört tur, ardından ana üç kavram atıldı: 257 sn, 21 çağrı.
 * Eksik madde yanlış bilgi değildir (CALIBRATION); yanlış aktarılan madde yanlış bilgidir.
 */
export function examPointsVerifyBlock(points: readonly string[] | undefined): string {
  const list = (points ?? []).map((point) => point.trim()).filter(Boolean).slice(0, 8);
  if (!list.length) return "";
  return [
    "SINAVDA SORULUR listesi (öğretmen analizi):",
    ...list.map((point) => `* ${point}`),
    "Denetlenen kısımda bir maddenin sayısı, yaşı, eşiği ya da terimi kaynaktan farklı aktarılmışsa 'high' yaz. " +
      "Kısmın kavramına ait bir madde kısımda hiç geçmiyorsa 'medium' yaz (where: kısmın ilk ekranı; fix: eksik " +
      "maddeyi hangi blokla vereceği). Başka kavrama ait maddeyi bu kısımda arama; ilk kavram tek ekrandır, maddelerin " +
      "çoğu sonraki kavramlarda gelir.",
  ].join("\n");
}
