# Misafir / Ücretsiz / Premium

Tarih: 2026-09-24. Kapı özellikte değil, kullanımda. Ayrıntı kodda: `src/lib/billing/entitlements.ts`.

| | Misafir | Ücretsiz (Temel) | Plus | Sigma |
|---|---|---|---|---|
| Pazarlama, giriş, hazır demo | Açık | Açık | Açık | Açık |
| Uygulama ve öğrenme stüdyoları | Yok | Açık | Açık | Açık |
| AI sohbet, sınav, quiz, kart, podcast, sözlü | Yok | Kota yer | Kota yer | Kota yer |
| Kota | — | Günlük (İstanbul 03:00) | Haftalık planda 7 gün; aylık ve yıllıkta 30 gün | 30 günde bir, daha yüksek |
| Foto / PDF sayfa | — | 2 | 300 | 1000 |
| Model | — | Standart | Standart | Gelişmiş |
| Satın al, kampanya, sohbet kartı | — | Var | Yok | Yok |
| Ek paket | — | Yok | Var | Var |
| Hak bitince | — | Yükseltme duvarı, yenilenme saati | Ek paket | Ek paket |

Misafir model çağırmaz. Kayıtsız istek `401` ve `code: "AUTH_REQUIRED"`.

Plus vaadi **"Ücretsiz plandaki her şey ve:"** diye başlar: yüksek kota, daha yüksek yükleme limiti, ek paket. Podcast ve sözlü ücretsizde de açıktır; Plus'a özel diye yazılmaz.

Kota penceresinin tek kaynağı `plans.billing_period` → cüzdandaki `period_kind` (`credit_reserve` / ödeme kapanışı). Limitler ekranı bunu yazar:

- Haftalık Plus (`plus-haftalik`, 7 gün): **Haftalık limit**. Hak 7 günde bir yenilenir.
- Aylık Plus ve Sigma: **Aylık limit**. Hak 30 günde bir yenilenir.
- Yıllık abonelik 365 gün sürer; kullanım hakkı yine 30 günde bir yenilenir, etiket aylıktır.

Pencere UTC gün başına yapışır (`date_trunc('day', now())`). Bu sınır Türkiye'de 03:00'dır. Ücretsiz günlük hak da aynı saatte sıfırlanır.

Bilerek yok: sahte geri sayım, ölçülemeyen kat iddiası, odaklanma modu, para iadesi garantisi.
