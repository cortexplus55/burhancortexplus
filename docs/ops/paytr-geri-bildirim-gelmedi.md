# PayTR geri bildirimi gelmedi (ödeme yapıldı, Plus açılmadı)

## Belirti
- Öğrenci kartından para çekildiğini söylüyor; `/odemeler`'de kayıt "bekliyor" ya da yok; Plus açılmadı.
- `/admin/odemeler`'de ödeme `pending`, `payment_webhook_events`'te o `merchant_oid` için satır yok.

## Bakılacak yer
- `/admin/odemeler`: `payments` (durum, tutar, `merchant_oid`) ve `payment_webhook_events` (PayTR'den gelen
  her bildirim, ham gövde).
- PayTR Mağaza Paneli (mağaza 747272) → İşlemler: ödeme orada "başarılı" mı; Bildirim URL'si
  `https://cortexplus.app/api/payments/paytr/callback` mı.
- Akış: `POST /api/payments/paytr/callback` → hash doğrulanır → `finalize_paytr_payment` (veritabanı
  fonksiyonu, tek işlem) → Plus açılır, `payment.completed` denetim kaydı, davet yıldızı. Veritabanı
  hatasında uç `RETRY` döner ve PayTR yeniden dener; bozuk hash `INVALID`.

## İşlem
1. PayTR panelinde ödeme **başarısızsa**: öğrenciye söyle, para çekilmemiştir (bankanın "bloke"si 1-3 günde
   düşer).
2. PayTR'de **başarılı**, bizde bekliyorsa: `/admin/odemeler` → ödeme satırında **Mutabakat**
   (`reconcilePaymentWithPaytr`, `refund-button.tsx`): PayTR'nin kaydı sorgulanır, toplam eşleşirse ödeme
   tamamlanır ve Plus açılır; aynı tutar iki kez yazılmaz.
3. Mutabakat da boş dönüyorsa Bildirim URL'sini ve `PAYTR_MERCHANT_ID / KEY / SALT`, `PAYTR_TEST_MODE`
   değişkenlerini (`/admin/sistem`) kontrol et. Hash tutmayan bildirim **iz bırakmaz**: uç veritabanına
   dokunmadan `INVALID` döner, bu yüzden `payment_webhook_events` boş kalır ve PayTR panelinde bildirim
   "başarısız" görünür — anahtar/salt yanlış demektir.
4. İade gerekiyorsa `/admin/odemeler` → iade (`markPaymentRefunded`); PayTR panelinden yapılan iadeyi
   bizde kaydetmek için `recordExternalRefund`. Kredi düşümü ve Plus kapanışı iadeyle birlikte işlenir
   (`src/lib/payments/refund.ts`).

## Önleme
- Otomatik yenileme yok; sözleşme "otomatik yenilenmez" der (`AUTO_RENEW_SUPPORTED = false`). Süre
  dolunca hatırlatma e-postası gider; öğrenci elle yeniler.
- Canlı mod provası (plan 0.5) yapılmadan gerçek satış açılmaz: 1 TL ödeme → bildirim → iade.
