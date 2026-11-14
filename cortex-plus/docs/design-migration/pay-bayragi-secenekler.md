# `ui.v2.pay` · açmadan önce doğrulama seçenekleri

15 Kasım 2026. Bayrak **kapalı**. OTONOM §5: "açmadan önce önizlemede PayTR çerçevesinin YÜKLENDİĞİNİ doğrula". Önizlemede
PayTR yapılandırılmadığı için satın alma düğmeleri "Yakında" diyor ve çerçeve açılmıyor; bu doğrulama önizlemede yapılamıyor.

## Bayrak neyi değiştiriyor (kod)

- Yalnız görünüm: `src/styles/ui-v2-pay.css` (kartlar kenarsız, ekranda tek marka düğme, işaretli kart çerçevesi,
  `iframe { max-width: 100% }`). Satın alma düğmelerinin tıklama kodu, PayTR token isteği (`/api/payments/create-token`),
  çerçeve, dönüş ve aktivasyon **bayraktan bağımsız**, bugün canlıda çalışan kodla aynı.
- `?plan=plus|week|sigma` kart işareti ve Sigma'nın açık gelmesi bayraksız, #655'ten beri canlıda.

## Kişi bazlı açma: kod var, panel yok

- Bayrak okuyucusu (`isFeatureEnabled`) `feature_flags.metadata.pilot_user_ids` listesindeki kullanıcıya bayrağı açık
  sayar; `/pay` bayrağı kullanıcı kimliğiyle okuyor (`uiV2("pay", user.id)`). Yani genel anahtar kapalıyken yalnız seçilen
  hesapta yeni görünüm açılabilir.
- **Panelde bunu yapan arayüz yok:** pilot listesi yalnız 4 uyarlamalı öğrenme anahtarı için var
  (`/admin/adaptive`, `PILOT_FLAGS`). Özellik Anahtarları sayfası yalnız aç / kapat yapar.
- `ui.v2.pay` satırı veritabanında henüz yok (hiç açılıp kapatılmadı); pilot listesi var olan satırı günceller.

## Seçenekler

| # | Seçenek | Ne gerekir | Kime etki | Risk |
|---|---|---|---|---|
| A | **Pilot listesini `ui.v2.*` anahtarlarına açmak** (küçük kod PR'ı: Özellik Anahtarları satırına "Pilot hesaplar"; satır yoksa `enabled = false` ile oluşturulur) | Burhan PR'ı onaylar, sonra kendi hesabını pilota ekler | Yalnız pilot hesaplar | Düşük. Yalnız `metadata.pilot_user_ids` yazılır, genel anahtar kapalı kalır; kurucu yetkisi ve denetim kaydı istenir. "Aç → Kapat" ile satır oluşturmak **önerilmez**: o arada herkese açılır |
| B | **Kısa süreli genel açma, Burhan izlerken** | Panelde "Aç", Burhan /pay'de "Plus'a yükselt" → çerçeve açılıyor mu (ödemeyi tamamlamadan kapatır), sonra karar | Herkese, birkaç dakika | Düşük-orta. Görünüm değişir, ödeme kodu aynı; sorun görülürse "Kapat" 30 sn'de geri alır |
| C | **Önizlemeye PayTR test anahtarı** (Vercel önizleme ortamına `PAYTR_*` test değerleri + test modu) | Burhan Vercel'de önizleme ortam değişkeni ekler (sır, Claude yazmaz) | Kimseye (önizleme) | Düşük; test modu yanlışlıkla canlı anahtarla kurulursa gerçek ödeme alınabilir, dikkat |

**Salt-okur doğrulama yolu yok:** çerçeve ancak token isteğinden sonra açılıyor; token isteği `payments` tablosuna bekleyen
bir satır yazıyor ve PayTR'ye gerçek istek atıyor. Bu yüzden ödeme tamamlanmasa da "salt-okur" sayılmaz; Claude yapmaz.

**Öneri:** A (kalıcı araç; sonraki bayraklarda da işe yarar) ya da hızlı yol B. Karar Burhan'ın.

## B'nin adımları (Burhan)

1. `cortexplus.app/admin/feature-flags` → "Yeni görünüm · Abonelik sayfası" → **Aç**.
2. Kendi hesabınla `cortexplus.app/pay` (telefonda ve masaüstünde): kartlar yeni görünümde mi, tek marka düğme mi.
3. "Plus'a yükselt" → sözleşme kutuları → PayTR çerçevesi açılıyor mu, telefonda yana taşıyor mu. **Ödemeyi tamamlama**,
   çerçeveyi kapat.
4. Sorun yoksa açık bırak; varsa aynı satırdan **Kapat** (en geç 30 sn'de eski görünüm).
