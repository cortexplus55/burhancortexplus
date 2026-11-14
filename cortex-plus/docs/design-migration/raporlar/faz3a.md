# Faz 3A · `lib/entitlements` (arayüz değişikliği yok)

## 1. Özet
- `getGate` bugünkü sunucunun kararını birebir verir (sunucu gerçektir, OTONOM §9). Karar sırası `reserveCredits` +
  SQL `credit_reserve_metered` ile aynı.
- Karakterizasyon: SQL fonksiyonları canlıdaki göç sırasıyla PGlite'ta kuruldu; 16 senaryo × 8 eylem için SQL'in
  ayırma kararı ile kapı aynı. Bilinen farklar `KNOWN_DEVIATION` testleriyle sabit.
- Her 402 gövdesi artık `gate` taşır (`error` ve `code` aynen). Rotalara ikinci bir ön kontrol eklenmedi.
- Arayüz değişmedi.

## 2. PR
Bu PR (açıklama = bu rapor).

## 3. Değişen dosyalar
- Yeni: `src/lib/entitlements/{types,config,gate,server,track,index}.ts`.
- `src/lib/api/guards.ts`: `errorResponse` 402'de `gate` ekler.
- `src/lib/learning/node/start.ts`, `src/app/api/learning/exam-prep/create/route.ts`,
  `src/app/api/learning/exam-prep/invite/join/route.ts`: kendi 402 gövdelerine `gate`.
- `src/lib/student/account-context.ts`: `quotaRemaining`, `quotaAllowance` (tembel yenilemeli kalan; ekleme).
- Testler: `tests/unit/hak-sistemi.test.ts`, `tests/unit/hak-sistemi-karakterizasyon.test.ts`; yol adımı sözleşme
  anlık görüntüsü 402 gövdesindeki `gate` için bilerek güncellendi.
- Belgeler: `10-entitlements.md`, `bilinen-sunucu-sapmalari.md`.

## 4. Ölçümler
Arayüz değişikliği yok; görsel taban, denetim ve performans etkilenmez (yalnız 402 JSON gövdesi büyür).

## 5. Test sonuçları
- Yığının tepesinde (3A + 3B + 4A + 4B + 5) koşuldu: tip denetimi 0 hata; lint 0 hata (uyarılar dokunulmayan dosyalarda,
  önceden var); birim **734/734 dosya, 7.072 test** (referans 728 / 6.869); üretim derlemesi başarılı.
- e2e: CI (PR kontrolü).
- Karakterizasyon: 16 senaryo × 8 eylem SQL ile birebir; `KNOWN_DEVIATION` 4 test.
- Bekçiler: 402 üreticileri sınıflı (`admin-no-402`), hata yanıtı biçimi (`audio-credits`), ilk doz kapısı
  (`paket-j1`) değiştirilmeden geçiyor.

## 6. Promptan ayrılan yerler
- **`assertGate` rotalara eklenmedi.** Rotalar hakkı bugün zaten zorluyor; ikinci bir karar yalnız birinciyle
  ayrışabilirdi (OTONOM §9: sunucuya dokunma). Her ret 402 gövdesinde `gate` taşır; `assertGate` hazır.
- **Tablo–sunucu farkları** (9 madde): `10-entitlements.md` ve `bilinen-sunucu-sapmalari.md`.
- **`GateReason`'a eklenen nedenler:** `spend_cap`, `free_topic_limit`, `free_prep_limit`, `free_included_limit`,
  `free_photo_abuse_limit` (OTONOM §9 karar 5).
- **`video.create` = çizimli 1 dk video** (`SKETCH_VIDEO_GENERATE`, 25 kredi); tam video (280) ayrı bir eylem değil.

## 7. Yapılandırma değerleri
`FREE_DAILY_LIMITS` (3 mesaj, 1 fotoğraf, 40 derse dahil, 0 ders), `PAID_PLANS` (7.200 / 2.700 / 60.000),
`EXAM_WEEK_OFFER_THRESHOLD_DAYS = 14`, `PLUS_QUOTA_WARN_PERCENT = 90`, `DUEL_ACCESS` (bugünkü davranış). Hepsi bugünkü
yerlerinden okunur; değer değişmedi.

## 8. Desen yok / Sonraki karar
- Sınav Haftası cüzdan dönemi boşluğu (Burhan kararı; sunucuya dokunulmadı).

## 9. Yapılamayanlar ve riskler
- Sayaç "önce artır, hata olursa iade" modeli kabul edildi (OTONOM §9 karar 6); öldürülen podcast/sözlü/video/sesli tur
  ayırmalarının otomatik iade edilmemesi değişmedi (sapma listesinde).

## 10. Burhan'ın yapacakları
- Sınav Haftası dönem boşluğu kararı (`bilinen-sunucu-sapmalari.md` #2).
