# P4 — Canlı doğrulama (Cortex Plus + Astra handoff)

**Tarih:** 2026-08-29  
**Deploy:** `936c517` + `fee8f13` (`main` → Vercel `cortexplus.app`); pay başlık düzeltmesi deploy sonrası.

## Cortex Plus — otomatik / agent smoke

| Yüzey | Ortam | Sonuç | Not |
|--------|--------|--------|-----|
| Ana sayfa hero + nav | `https://cortexplus.app/` | **Geçti** | Tek birincil **Ücretsiz dene**; Plus metin linki; plan sekmeleri; sosyal kanıt + plan slider (P3 spacing) |
| Giriş kabuğu | `https://cortexplus.app/giris` | **Geçti** | Google birincil, e-posta ikincil |
| Sor (boş) | `https://cortexplus.app/ogretmen` (öğrenci oturumu) | **Geçti** | Selamlama, dock, Ekle, menü yapısı |
| Pay (embedded) | `https://cortexplus.app/pay` (öğrenci oturumu) | **Geçti** | Plus birincil; Diğer planlar · Sigma; ücretsiz devam linki |

> Prod öğrenci smoke (2026-08-29): `cortexplus.app/ogretmen` ve `/pay` doğrulandı. `/pay`’de AppShell + kart çift `h1` giderildi (`embedded` iken kart üst metni gizli — bir sonraki deploy).

## Astra TR — insan handoff (yan yana)

Astra hesabı agent’ta yok; aşağıdaki maddeler **senin** iki sekmeli kontrolünle kapanır (`astra-ai.co/tr` ↔ `cortexplus.app`).

### Sor

- [ ] Boş Sor: üst bar (streak / satın al / profil) hiyerarşisi Astra ile aynı mı?
- [ ] Alt dock: 3 sekme + menü karesi konumu ve etiketler
- [ ] Menü grupları ve sıra (Çalış / Sınav / Hesap)
- [ ] Composer: placeholder, ekle (+) menüsü, gönder durumu

### Pay

- [ ] Tek ana tier öne çıkıyor mu (Plus)?
- [ ] Üst plan / Sigma ikincil konum (bizde: “Diğer planlar”)
- [ ] Yıllık / aylık toggle davranışı
- [ ] “Ücretsiz devam” veya eşdeğer çıkış

### Marketing (Cortex prod — agent)

- [x] Hero + tek birincil CTA + Plus metin linki (`cortexplus.app/`)
- [x] Sosyal kanıt + plan slider (P3 spacing) ana sayfada görünür
- [ ] Mobil hamburger tıklama (prod, 390px) — isteğe bağlı hızlı kontrol

### Marketing (isteğe bağlı — Astra yan yana)

- [ ] Hero video + CTA sayısı
- [ ] Mobil hamburger içeriği
- [ ] Sosyal kanıt yoğunluğu (piksel değil pattern)

### Handoff nasıl kapatılır

1. Astra TR’de free/Plus hesabınla Sor ve Pay’i aç.
2. Aynı anda Cortex’te öğrenci test hesabıyla `/ogretmen` ve `/pay`.
3. Fark gördüğün maddeleri issue veya `SPEC-CHECKLIST.md` “Revize notları”na tek satır ekle.
4. Tüm Sor/Pay maddeleri **Evet** ise P4’ü checklist’te tamamla.

## Bilinen bilinçli farklar (kopya değil parity)

- Pattern parity hedefi; piksel eşleme yok (`README.md`).
- PayTR checkout Astra ödeme altyapısından bağımsız faz.
- DM Serif display başlıklar marketing’te; Astra font stack birebir değil.
