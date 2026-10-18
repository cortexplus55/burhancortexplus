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

/** Motor istemine giren blok. Madde yoksa boş (eski hazırlık ya da analiz henüz yok). */
export function examPointsBlock(points: readonly string[] | undefined, use: ExamPointsUse): string {
  const list = (points ?? []).map((point) => point.trim()).filter(Boolean).slice(0, 8);
  if (!list.length) return "";
  return [
    "SINAVDA SORULUR (belgenin öğretmen analizi; yalnız KAYNAK'taki bilgi geçerli, çelişirse KAYNAK haklı):",
    ...list.map((point) => `* ${point}`),
    USE_LINE[use],
  ].join("\n");
}

/** Ders denetçisi: kavramına ait madde kısımda yoksa ya da yanlış aktarıldıysa ciddi sorun. */
export function examPointsVerifyBlock(points: readonly string[] | undefined): string {
  const list = (points ?? []).map((point) => point.trim()).filter(Boolean).slice(0, 8);
  if (!list.length) return "";
  return [
    "SINAVDA SORULUR listesi (öğretmen analizi):",
    ...list.map((point) => `* ${point}`),
    "Denetlenen kısmın kavramına ait bir madde kısımda hiç geçmiyorsa ya da sayısı, yaşı, eşiği ya da terimi " +
      "kaynaktan farklı aktarılmışsa 'high' yaz (where: kısmın ilk ekranı; fix: eksik maddeyi hangi blokla vereceği). " +
      "Başka kavrama ait maddeyi bu kısımda arama.",
  ].join("\n");
}
