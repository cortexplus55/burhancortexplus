# İlerleme defteri (tasarım geçişi)

Kaynaklar: `ANA-PROMPT.md` ve `OTONOM-PROMPT.md` (ikisi de 14 Kasım 2026; çakışmada OTONOM kazanır). Her PR sonunda
güncellenir; oturum başında ve bağlam sıkışmasından sonra ilk bu dosya okunur.

**Yetki (OTONOM §2):** kapılar + CI yeşil + diff incelemesi temiz + rapor güncelse PR'ı Claude birleştirir (alttan yukarı),
deploy'u izler, production duman testini (`scripts/smoke-prod.mjs`) koşar, bayrakları §5 sırasıyla açar, düello göçünü §6
koşullarıyla uygular. Kırmızı çizgiler OTONOM §3; durak koşulları yalnız OTONOM §8 (D1–D5).

**Önceden verilmiş kararlar (OTONOM §9):** sunucu gerçektir, tablo hedeftir; `getGate` bugünkü sunucuyu birebir taşır,
farklar `10-entitlements.md` "Tablo–sunucu farkları" + `bilinen-sunucu-sapmalari.md` + `KNOWN_DEVIATION` testleri. Plus
%100 + ek paket = açık; Sınav Haftası dönem boşluğu sunucuya dokunmadan testle sabit, %90/%100 sheet'i açılmaz; ücretsiz
ilk ders kesin değilse açık, kilit 402 ile; `is_admin` = Kurucu görünümü; eksik ret nedenleri `GateReason`'a, `spend_cap`'te
teklif yok; sayaç "önce artır, hata olursa iade" kabul; sohbette 402 sonrası metin korunur (yalnız 402 yolu).

| PR | Dal | Durum | PR no | Bayrak | Bekleyen Burhan işi | Notlar |
|---|---|---|---|---|---|---|
| Faz 0 · Envanter, test hesapları, görsel taban, denetim, performans tabanı | `design/faz0-envanter` | sürüyor: 2.5, 1.3, 2.6 bitti; 2.7, 2.9, 2.10 kaldı | — | — | CI için `E2E_USERS_JSON` sırrı (05) | Görsel taban yerel, manifest commit'li |
| 3A · `lib/entitlements` | `design/hak-sistemi` | bekliyor | — | — | — | Karakterizasyon önce; fark çıkarsa DUR |
| 3B · Gate, UpgradeSheet, ana ekran | `design/hak-arayuzu` | bekliyor | — | — | — | |
| 4A · Heyecan kiti | `design/heyecan-kiti` | bekliyor | — | — | — | Görünür değişiklik yok |
| 4B · Ders ekranı | `design/ders-ekrani` | bekliyor | — | `ui.v2.ders` | Bayrağı önizlemede açmak | |
| 5A · Konu testi + Doğru/Yanlış | `design/tekrar-test` | bekliyor | — | `ui.v2.tekrar` | Bayrak | |
| 5B · Akıllı kartlar | `design/tekrar-kartlar` | bekliyor | — | `ui.v2.tekrar` | Bayrak | |
| 6A · Sohbet kabuğu | `design/ogretmen-sohbet` | bekliyor | — | `ui.v2.ogretmen` | Gerçek cihazda klavye | |
| 6B · Başla, fotoğraf, el yazısı | `design/ogretmen-foto` | bekliyor | — | `ui.v2.ogretmen` | | |
| 7A · Giriş + kayıt | `design/giris-kayit` | bekliyor | — | `ui.v2.giris` | | |
| 7B · Hazırlık kurulumu | `design/kurulum` | bekliyor | — | `ui.v2.kurulum` | | |
| 7C · /pay | `design/pay` | bekliyor | — | `ui.v2.pay` | Önizlemede gerçek ödeme denemesi | |
| 8A · Podcast + video | `design/studyo-medya` | bekliyor | — | `ui.v2.studyo` | | |
| 8B · Sözlü + Yazılı + Sabah kâğıdı | `design/studyo-sinav` | bekliyor | — | `ui.v2.studyo` | | |
| 8C · /araclar + DNA + net + İlerleme | `design/studyo-arac` | bekliyor | — | `ui.v2.studyo` | | |
| 9A · Düello arayüzü | `design/duello-arayuz` | bekliyor | — | `ui.v2.duello` | | |
| 9B · Düello sunucusu | `design/duello-sunucu` | bekliyor | — | `duel.enabled` | Migration'ı uygulamak | |
| 9C · Düello bağlama | `design/duello-bagla` | bekliyor | — | `ui.v2.duello` | | |
| 10A · Kart + Paylaş | `design/paylas-kart` | bekliyor | — | `ui.v2.paylas` | | |
| 10B · `/d/KOD`, meydan okuma | `design/meydan` | bekliyor | — | `ui.v2.paylas` | Hız sınırı eşikleri, cihaz denemeleri | |
| 11A · Ayarlar, Sınavlar, Kütüphane, /davet | `design/ekranlar-kalan` | bekliyor | — | `ui.v2.ayarlar`, `ui.v2.kutuphane` | | |
| 11B · Laboratuvarlar ve araçlar | `design/lab-araclar` | bekliyor | — | `ui.v2.araclar2` | | |
| 11C · Büyüme | `design/buyume` | bekliyor | — | `ui.v2.buyume` | Kart şablonları (tahta) | |
| 12A · Durumlar, hata sayfaları | `design/kapanis-durumlar` | bekliyor | — | — | | |
| 12B · Erişilebilirlik ve performans | `design/kapanis-olcum` | bekliyor | — | — | | |
| 12C · Temizlik ve kapanış | `design/kapanis-temizlik` | bekliyor | — | — | Bayrak temizliği onayı | |

## Park edilenler

(henüz yok)

## Burhan-only açık işler

1. CI'da hesaplı e2e için GitHub sırrı `E2E_USERS_JSON` (05, "CI").
2. Canlı duman testini zorunlu kontrol yapmak (06 §9; depo ayarı).

## Burhan kararı bekleyenler

1. **Hazırlık sayfasının ilk ziyareti "Seviye tespiti" adımını kaldırıyor** (06 §12): sıradaki düğümün önceden yüklenmesi
   tanıyı erteliyor. İstenmeyen yan etki gibi duruyor; düzeltme ürün kararı.
2. **Canlı duman testini zorunlu kontrol yapmak** ya da kırmızıyken bildirim (06 §9). Depo ayarı, Burhan'ın işi.
3. **CI'da e2e test hesapları:** GitHub sırrı `E2E_USERS_JSON` (05, "CI"). Görsel test CI'da koşmaz; bu sır yalnız
   ileride hesaplı e2e içindir.

## Sonraki karar (birleşik liste)

- `/krediler`'de iki marka düğmesi ("Bağlantıyı kopyala", "Ek paket al") ve `/sohbetler` boş durumunda iki "Yeni sohbet"
  (06 §11): ilgili fazlarda tek `brand` kuralına göre düzelecek.
- 375 px'te 40 px'lik hedefler (06 §11): ilgili fazlarda 44'e çıkacak; denetim çıtası bugünkü sayıları tutar.
