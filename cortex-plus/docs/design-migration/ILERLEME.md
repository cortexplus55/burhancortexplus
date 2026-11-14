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
| Faz 0 · Envanter, test hesapları, görsel taban, denetim, performans tabanı | `design/faz0-envanter` | **birleşti** (a8bd6967), production duman 11/11 | #647 | — | CI için `E2E_USERS_JSON` sırrı (05) | Görsel taban yerel, manifest commit'li |
| 3A · `lib/entitlements` | `design/hak-sistemi` | PR açık, CI koşuyor | #648 | — | — | Karakterizasyon PGlite'ta SQL ile; 402'ye `gate`; `assertGate` rotalara eklenmedi (gerekçe 10-entitlements) |
| 3B · Gate, UpgradeSheet, ana ekran | `design/hak-arayuzu` | PR açık (3A üstüne) | #649 | — | — | Sağlayıcı kabukta; fiyat tarayıcıdan; görsel taban 17 görüntü bilinçli güncellendi |
| 4A · Heyecan kiti | `design/heyecan-kiti` | PR açık (3B üstüne) | #650 | — | — | Görünür değişiklik yok; galeri `/arena` |
| 4B · Ders ekranı | `design/ders-ekrani` | PR açık (4A üstüne) | #651 | `ui.v2.ders` | — | Bayrak altyapısı `src/lib/ui-v2/flags.ts`; `data-ui` sarmalayıcısı + yalnız CSS |
| 5A+5B · Tekrar ekranları (tek PR) | `design/tekrar-test` | PR açık (4B üstüne) | #652 | `ui.v2.tekrar` | — | 5B ayrı dal yerine aynı PR |
| 6A · Sohbet kabuğu | `design/ogretmen-sohbet` | PR açık (5 üstüne) | #653 | `ui.v2.ogretmen` | Gerçek cihazda klavye | `ChatPanel followUser` bayrağa bağlı |
| 6B · Fotoğraf hak kapısı | `design/ogretmen-foto` | PR açık (6A üstüne) | #654 | `ui.v2.ogretmen` | Gerçek cihazda fotoğraf | |
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

## Sıradaki adımlar (bağlam sıkışırsa buradan)

1. #648 → #654 yığını alttan birleştir: CI yeşil + diff temiz → `gh pr merge N --merge` (dal silinmez) → bir üstün
   tabanını main'e çevir (`gh pr edit M --base main`), yerelde `git rebase --autostash` + push, CI'ı bekle.
2. Her birleştirmeden sonra Vercel durumu (`gh api repos/cortexplus55/burhancortexplus/commits/<sha>/status`) ve
   `node scripts/smoke-prod.mjs --auth`.
3. Sonra Faz 7 (7.0 inceleme → 7A giriş/kayıt, 7B kurulum, 7C /pay: `ui.v2.giris|kurulum|pay`), aynı yöntem: sayfa bayrak
   açıkken `<div class="cx-ui-scope" data-ui="...">` ile sarar, görünüm yalnız CSS (`src/styles/ui-v2-*.css`).
4. Yerel kapılar: `npx tsc --noEmit`, `npm run lint`, `npx vitest run --exclude "tests/unit/_tmp/**"`, üretim derlemesi
   (`E2E_FIXTURE=1 SENTRY_AUTH_TOKEN="" npx next build`), sunucu `preview_start cortex-plus-test-guvenli` (3006),
   `npm run test:visual`, `npm run design:audit -- --skip-login`, yeni e2e `E2E_BASE_URL=http://localhost:3006 npx playwright test <spec> --project=chromium`.

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
