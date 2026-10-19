# İşletme el kitabı (runbook'lar) — 18 Ekim 2026

Bir şey bozulduğunda gece yarısı açılacak sayfalar. Her dosya aynı dört başlıkla yazıldı:
**Belirti → Bakılacak yer → İşlem → Önleme.** Satışa hazırlık planı 4.7 ("her biri 10 satır").
Kaynak koddan ve yönetim panelinden yazıldı; tahmin edilen hiçbir adım yok — bir adımın
çalışmadığını görürsen önce bu dosyayı düzelt.

| Durum | Dosya |
|---|---|
| Öğrenci "Ders hazırlanıyor"da kalıyor / "oluşturulamadı" | [takili-ders.md](takili-ders.md) |
| Kredi düştü ama içerik yok; iki kez kesildi | [yanlis-kredi.md](yanlis-kredi.md) |
| Podcast "Ses şu an üretilemedi" dedi ama kredi düştü | [podcast-ses.md](podcast-ses.md) |
| Ödeme yapıldı, Plus açılmadı | [paytr-geri-bildirim-gelmedi.md](paytr-geri-bildirim-gelmedi.md) |
| Üretimler art arda düşüyor, 429 | [openai-kota.md](openai-kota.md) |
| Site veritabanına ulaşamıyor, proje duraklamış | [supabase-duraklama.md](supabase-duraklama.md) |
| Yayından sonra sayfa boş / hata; geri almak gerek | [yayin-geri-alma.md](yayin-geri-alma.md) |
| Veri kayboldu / yedekten dönmek gerek | [veritabani-yedek.md](veritabani-yedek.md) |

## Nereden haber gelir

- **Sentry**: DSN canlıda tanımlı (`/admin/sistem` → Sentry "Tanımlı"). Panel ve e-posta uyarısı
  ürün sahibinin Sentry hesabında; tarayıcı ve sunucu hataları öğrenci verisi temizlenmiş olarak düşer
  (`src/lib/observability/sentry-shared.ts`).
- **Günlük özet e-postası** (plan 4.8): her sabah 09:00 TRT, `cortexplus@cortexplus.app`'a — son 24 saatin
  yeni kayıt, ödeme, üretim hatası (başarısız / yavaş ayrı) ve o anki takılı üretim sayısı; sorun varsa
  konu "Dikkat" ile başlar. Günlük cron'un sonunda gider (`subscription-renewal`), aynı gün iki kez gitmez
  (`audit_logs` → `ops.daily_digest`). Beklemeden görmek: `/admin/sistem` → "Özeti şimdi gönder".
  Kapatmak: Vercel'de `ADMIN_DIGEST_EMAIL=off`. Kod: `src/lib/admin/daily-digest.ts`.
- **`/admin` özeti**: son ödemeler, üretim hataları, kayıtlar. `/admin/ders-hatalari` üretim
  hatalarının listesi, `/admin/ai-kullanimi` ve `/admin/maliyetler` kullanım ve gider.
- **Vercel → Logs**: `lesson_generation_failure`, `stale_credit_reservations_refunded` gibi yapılandırılmış
  satırlar; `console.error` ile yazılır, içinde kişisel veri yok.
- **Öğrenci**: `/destek` formu → `support_requests` tablosu ve `cortexplus@cortexplus.app`.

## Her müdahalede

1. Önce ölç, sonra düzelt: ilgili tabloyu ve logu oku; "muhtemelen" ile müdahale etme.
2. Kullanıcı verisine dokunan her işlem `/admin` üzerinden (denetim günlüğüne yazar: `/admin/audit-log`).
   SQL ekranı yalnız okuma ve yönetici düğmesi olmayan istisnalar için; yıkıcı SQL ürün sahibinde.
3. Sonucu öğrenciye yaz (destek e-postası) ve bu dosyalara yeni öğrendiğini ekle.
