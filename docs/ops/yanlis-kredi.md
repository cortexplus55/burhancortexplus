# Yanlış kredi düşümü

## Belirti
- "Kredim düştü ama ders/test açılmadı", "aynı iş iki kez kesildi", "hakkım bitti diyor ama bugün hiç
  çalışmadım".
- Ücretsiz öğrencide günlük 6 kredi erken bitti.
- 409 "Geçersiz işlem tanımı" (`invalid_action`) → `/admin/sistem` "Kredi kuralı satırları": eylem kodunun
  `credit_rules` satırı yok ya da kapalı (göç atlanmış). Eksik satırı kod ilk istekte fiyat tablosundan ekler
  ve sayfa "Koddan eklenmiş kural" uyarısı gösterir; göç ve `schema_migrations` kayıt satırı yine yazılmalı.
  Kapalı satırı kod açmaz (29 Ekim 2026).

## Bakılacak yer
- `credit_wallets` (`balance`, `reserved`), `credit_ledger` (hareket satırları), `credit_reservations`
  (`status` `pending` / `committed` / `refunded`, `action_code`, `idempotency_key`), `ai_usage_events`
  (modelin gerçekten çağrılıp çağrılmadığı; `LESSON_PREFETCH` / `CONTENT_PREFETCH` öğrenciden düşmez).
- Öğrencinin kendi görünümü `/krediler`; yöneticide `/admin/kullanicilar` (Kredi sütunu) ve
  `/admin/audit-log` (kim ne zaman ekledi/düştü).
- Fiyatlar `/admin/kredi-kurallari` (`credit_rules`) ve `src/lib/credits/price-table.ts` — ikisi aynı olmalı.

## İşlem
1. `credit_reservations`'ta `pending` ve 10 dk'dan eski satır varsa iade kendiliğinden gelir
   (`refundStalePendingReservations`: öğrencinin sonraki isteği ya da günlük cron). Belge sayfa işlemleri
   24 saat bekler (`refundAbandonedDocumentReservations`).
2. Gelmediyse `/admin/kullanicilar` → kullanıcı satırı → **kredi ekle** (`grantCredits` / `adjustCredits`);
   nedenini yaz, denetim günlüğüne düşer. Bakiye eksiye indirilemez.
3. "İki kez kesildi" iddiasında `idempotency_key`'e bak: aynı anahtar bir kez düşer; iki ayrı anahtar varsa
   iki ayrı iş vardır (örn. "Farklı anlat" yeni üretimdir, "Dersi tekrarla" kredisizdir).
4. Kurucu hesabında kredi düşmez (`billingExempt`); "Ücretsiz gibi gör" önizlemesi ayrı sayaç kullanır,
   cüzdana dokunmaz.

## Önleme
- Bir işin bedelini değiştirirken önce `ai_usage_events`'ten yeniden ölç; göç ve `price-table.ts` birlikte
  değişir (`credit-system-v2.test.ts`). Fiyat yalnız göçle: kod var olan satırı ezmez, fark sayfada
  "Kredi bedeli kod ile canlı ayrışıyor" uyarısı olarak kalır.
- Yeni eylem kodu = `price-table.ts` + göç (`ON CONFLICT (action_code) DO UPDATE`) + Plus'taysa
  `plus_only_action` + kayıt satırı (KREDI-SISTEMI.md "Değişirse").
- Paralel parçalara aynı anahtar verme: krediyi bir kez ayır, parçalara `heldReservationId` ver
  (AGENTS.md "Paralel işler aynı ödeme anahtarını paylaşmaz").
