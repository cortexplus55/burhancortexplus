# Canlı göç kayıtları

Kural değişmedi: göç canlıya **yalnız Burhan'ın açık onayıyla** uygulanır. Her uygulama buraya bir satır olarak yazılır.

## 20261115120000 · sinav_haftasi_cuzdan_donemi (PR #660)

| | |
|---|---|
| Onaylayan | Burhan (sohbette, 15 Kasım 2026: "PR #660 … ONAYLIYORUM. Veritabanı göçünü şimdi uygula") |
| Uygulama | 15 Kasım 2026, gece (TR ~02:35); Supabase SQL ekranı, tek çalıştırma (`begin … commit`) + kayıt satırı |
| Uygulayan | Claude, Burhan'ın onayıyla |
| Değişen | Yalnız aynı imzayla yeniden tanımlama; tablo, sütun ve veri değişmedi |

**Değişen iki fonksiyon:**

| Fonksiyon | Önceki tanım | Değişiklik |
|---|---|---|
| `public.credit_reserve(uuid, text, text, integer)` | `20261024123000_free_daily_zero.sql` | Yenilenen cüzdan dönemi aboneliğin bitişini geçmez; aboneliğin son 24 saatinde yeni dönem hakkı yazılmaz |
| `public.finalize_paytr_payment(text, text, text, jsonb)` | `20260923180000_paytr_subscription_tier_only.sql` | Cüzdan dönemi ödeme anından sayılır, aboneliğin bitişini geçmez (önce UTC gün başından sayılıyordu) |

**Uygulamadan önce yapılan kontrol (salt okuma):**
- `credit_reserve`: canlı gövdenin özeti (md5, satır sonları eşitlenmiş) depodaki `20261024123000` gövdesiyle birebir aynıydı.
- `finalize_paytr_payment`: canlı gövde depodaki `20260923180000` gövdesinden yalnız 4 yorum satırıyla ayrılıyordu; çalışan kod
  aynıydı.

**Uygulamadan sonra doğrulama:**
- İki fonksiyon yeni hâlinde.
- Türkçe bildirim metinleri sağlam ("aboneliğin açıldı").
- Kayıt satırı yazıldı.
- Yetkiler değişmedi (`authenticated` çalıştıramaz, `service_role` çalıştırır).

**Geri alma:** `supabase/rollback/20261115_sinav_haftasi_geri_al.sql` (göç değil). İki fonksiyonu göçten önceki gövdeleriyle
yeniden tanımlar; gövdeler göç dosyalarından birebir çıkarıldı. Yalnız Burhan'ın kararıyla, SQL ekranında tek çalıştırma.
Ardından PR #660'ın kodu (`quotaView`) geri alınmazsa ekran dönemi aboneliğin bitişiyle gösterir; sunucu eski davranışa
döner. İkisi birlikte geri alınmalı.
