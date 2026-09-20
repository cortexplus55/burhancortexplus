# E-posta deliverability (Cortex Plus)

Son güncelleme: 2026-09-20

## Mevcut durum

| Kontrol | Durum |
|--------|--------|
| SPF (`cortexplus.app`) | Var: `v=spf1 include:_spf.google.com ~all` |
| DKIM (`google._domainkey`) | Var (Google Workspace) |
| MX | `smtp.google.com` |
| DMARC (`_dmarc.cortexplus.app`) | **Eksik / çözülemedi — eklenmeli** |
| Supabase Auth SMTP | Workspace Gmail `smtp.gmail.com:587` |
| Uygulama transactional | Aynı Workspace SMTP (`SMTP_PASS` + `EMAIL_FROM`) |

Hotmail/Outlook doğrulama maillerinin gecikmesi veya Gereksiz’e düşmesi, DMARC
eksikliği + Gmail SMTP itibarı kombinasyonunda sık görülür.

## P0 — DNS’e DMARC ekle (Squarespace / domain paneli)

Kayıt tipi **TXT**, ad **`_dmarc`** (veya `_dmarc.cortexplus.app`):

```
v=DMARC1; p=none; rua=mailto:cortexplus@cortexplus.app; fo=1; pct=100
```

İlk 1–2 hafta `p=none` (yalnızca rapor). Raporlar temizse sonra
`p=quarantine` düşünülür.

Yayılma: genelde 5–60 dk, bazen 24 saat.

Doğrulama:

```bash
nslookup -type=TXT _dmarc.cortexplus.app
# veya https://dns.google/resolve?name=_dmarc.cortexplus.app&type=TXT
```

## P1 — Supabase Auth şablonları

Dashboard → Authentication → Email Templates:

- Confirm signup konu: `Cortex Plus e-posta doğrulama`
- Gönderen adı: `Cortex Plus` (SMTP ile aynı)
- Link süresini mümkünse uzat (Auth → Settings → OTP / link expiry)
- HTML’de sadece tek net CTA; kısa düz metin alternatifi açık kalsın

## P2 — Operasyon

1. `/admin/sistem` → Workspace SMTP test = OK
2. Yeni kayıt veya `/email-dogrula` yeniden gönder
3. Hotmail: Gelen + Gereksiz + Diğer; göndereni güvenilir yap
4. Hacim artınca Google SMTP yerine transactional (Resend/Postmark) yeniden değerlendir

## Kod tarafı (bu PR)

- Uygulama maillerinde `Reply-To` + `List-Unsubscribe` başlıkları
- `/email-dogrula`: Hotmail ipuçları + 60 sn yeniden gönder soğuma + rate hata metni