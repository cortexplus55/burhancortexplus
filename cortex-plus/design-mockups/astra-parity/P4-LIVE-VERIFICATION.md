# P4 — Canlı doğrulama (Cortex Plus + Astra handoff)

**Tarih:** 2026-08-29  
**Deploy:** `936c517` (`main` → Vercel `cortexplus.app`)

## Cortex Plus — otomatik / agent smoke

| Yüzey | Ortam | Sonuç | Not |
|--------|--------|--------|-----|
| Ana sayfa hero + nav | `https://cortexplus.app/` | **Geçti** | Tek birincil **Ücretsiz dene**; Plus metin linki; plan sekmeleri; sosyal kanıt + plan slider (P3 spacing) |
| Giriş kabuğu | `https://cortexplus.app/giris` | **Geçti** | Google birincil, e-posta ikincil |
| Sor (boş) | `localhost:3002/ogretmen` (oturum açık) | **Geçti** | Selamlama, minimal composer, Sor/Sınavlar/Uygulamalar, **Menü** → Çalış / Sınav / Hesap grupları |
| Pay (embedded) | `localhost:3002/pay` (oturum açık) | **Geçti** | Plus birincil CTA; **Diğer planlar · Sigma** → Sigma ikincil; “Ücretsiz planda devam et” |

> Prod’da öğrenci oturumu agent tarafından doldurulamadı (güvenlik onayı). Sor/Pay satırları yerel dev + aynı commit ile doğrulandı; prod auth smoke için `.cursor/rules/app-test-accounts.mdc` hesabıyla manuel 2 dk kontrol önerilir.

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

### Marketing (isteğe bağlı)

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
