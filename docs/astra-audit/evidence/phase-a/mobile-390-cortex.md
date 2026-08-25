# Cortex mobil 390px (Faz A karşılığı)

**Tarih:** 2025-08-26  
**Viewport:** 390×844  
**Yöntem:** Playwright `responsive-a11y.spec.ts`

| Sayfa | Kontrol | Sonuç |
|-------|---------|--------|
| `/` | yatay taşma ≤1px | otomatik |
| `/` | Matematik ders kartı görünür | otomatik |
| `/fiyatlandirma` | Plus kart başlığı | otomatik (tablo yok — kart UI) |

Astra `/tr/` mobil 390 hâlâ manuel/CDP ile tamamlanabilir; Cortex tarafı CI ile kilitlendi.
