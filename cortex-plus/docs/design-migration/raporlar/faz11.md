# Faz 11 · Kalan ekranlar ve büyüme (`ui.v2.ayarlar`, `ui.v2.kutuphane`, `ui.v2.araclar2`, `ui.v2.buyume`)

11A, 11B ve 11C tek PR'da.

## 1. Özet
- **11A Ayarlar ve /davet (`ui.v2.ayarlar`):** gruplar kenarsız `bg-1` köşe 24, satırlar arası çizgi yerine boşluk,
  satırlar bugün de 56 px; yıkıcı grup ("Hesap verisi") tehlike zemini ve başlık rengiyle, bugünkü onay diyaloğu aynen.
  Kaydetme modeli, ayarların etkisi, hesap ve gizlilik akışları değişmedi.
- **11A Kütüphane (`ui.v2.kutuphane`):** Belgelerim, Yanlışlarım, Çalışma grupları, Geçmiş konuşmalar: kartlar kenarsız,
  arama kutusu 48 px hap ve 16 px yazı, odak halkası. Listeler, eylemler, silme onayları aynen. Geçmiş konuşmalarda
  sarmalayıcı sayfanın içinde (rotanın `loading.tsx`'i var; Suspense kuralı gereği düzen eklenmedi).
- **11B Laboratuvarlar ve araçlar (`ui.v2.araclar2`):** periyodik tablo hücresi en az 40 px, tablo kendi kabında yana
  kayar (bugün de `overflow-x: auto`), hücre içi atom numarası 11 px; girişler 44 px; sonuç bloğu kenarsız `bg-1`;
  hareket azaltmada hücre büyümesi yok. Çizim motoru ve matematik değişmedi.
- **11C Büyüme (`ui.v2.buyume`):** ortak kurallar `src/lib/growth/` (günde en çok bir öneri, kapatınca 30 gün susma,
  depo okunamazsa gösterilmez, İstanbul günü; `share_prompt_shown` yerleşim başına günde bir kez, kişisel veri yok).
  Yerleşim 7 (ana ekran davet şeridi) kodlandı: ilk ders tamamlanınca, metin bloğunun altında, masaüstünde; telefonda
  gizli (ana ekran kaydırmasız, "Kalan haklar" ile aynı kural). Ödül cümlesi bugünkü mekanizmadan
  (`grant_referral_gift`, sayı `REFERRAL_GIFT_LESSONS` = 3). Tek eylem "Bağlantıyı kopyala"; bağlantı /davet ile aynı
  kaynaktan (`loadInviteLink`).

## 2. 11.0 inceleme
- **Ayarlar:** tek sayfa `/ayarlar` (8 Kasım "tek merkez"); düzenleme penceresi `?dialog=profile`. Kaydetme anında
  (pencere içinde "Kaydet"). Ses / titreşim anahtarı yok (`useFeedbackPrefs` tüketen yer yok): çizilmedi.
- **/davet:** kod ve bağlantı `loadInviteLink`, QR sunucuda (`qrDataUri`). Ödül mekanizması VAR: doğrulanmış davetli
  ilk işinde iki tarafa 90 kredi, davet eden en çok 3 davetten (AGENTS.md "Kredi v3").
- **Rota kapsamı:** `/siniflar` Kütüphane'de (bu faz), `/takvimim`, `/krediler`, `/gunluk`, `/yardim`,
  `/mobil-uygulama` bu fazın bayraklarına bağlanmadı (Faz 1 PageShell'iyle zaten yeni iskelette); `/krediler` davet
  hediyesinin durumunu gösteriyor.
- **Büyüme verisi:** ders sonu "Öğrendiğin 3 şey" verisi yok; test sonucu, günlük seri (`streak`), DNA ve veli
  özeti için kart şablonu tahtada yok; podcast / video "bitti" olayı var.

## 6. Promptan ayrılan yerler ve bekleyen yerleşimler
| # | Yerleşim | Durum | Neden |
|---|---|---|---|
| 1 | Ders sonu meydan | bekliyor | Faz 10 soru kartı park; "Öğrendiğin 3 şey" verisi yok |
| 2 | Test sonucu | bekliyor | şablon tahtada yok |
| 3 | Seri kilometre taşı | bekliyor | şablon tahtada yok |
| 4 | DNA | bekliyor | şablon tahtada yok |
| 5 | Podcast / video kapanışı | bekliyor | "Sen de yap → kurulum" kendi hazırlığının içindeki öğrenciye anlamsız; paylaşılan içerik (Faz 10) gelince |
| 6 | Sınav sabahı altbilgisi | bekliyor | yazdırma düzeni değişmez kuralı için önce / sonra `page.pdf()` karşılaştırması hesaplı sınav sabahı verisi istiyor; bu turda yapılmadı |
| 7 | Ana ekran davet şeridi | **kodlandı** | yalnız masaüstünde (telefon ana ekranı kaydırmasız) |
| 8 | Veli özeti | bekliyor | şablon tahtada yok |

- Ayarlarda anahtarların `role="switch"` dönüşümü ve Belgelerim'in eylem menüsü (`Popover`) yazılmadı: davranış
  değişikliği; bugünkü düğmeler ve onaylar korunuyor.

## 10. Burhan'ın yapacakları
- Telefonda davet şeridini de istiyorsan: yer kararı (ana ekran kaydırmasız; şerit yalnız masaüstünde).
