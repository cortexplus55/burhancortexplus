# Misafir / Ücretsiz / Premium

Tarih: 2026-09-24. Kapı özellikte değil, kullanımda. Ayrıntı kodda: `src/lib/billing/entitlements.ts`.

| | Misafir | Ücretsiz (Temel) | Plus | Sigma |
|---|---|---|---|---|
| Pazarlama, giriş, hazır demo | Açık | Açık | Açık | Açık |
| Uygulama ve öğrenme stüdyoları | Yok | Açık | Açık | Açık |
| AI sohbet, sınav, quiz, kart, podcast, sözlü | Yok | Kota yer | Kota yer | Kota yer |
| Kota | — | Günlük (İstanbul 03:00) | Aylık | Daha yüksek aylık |
| Foto / PDF sayfa | — | 2 | 300 | 1000 |
| Model | — | Standart | Standart | Gelişmiş |
| Satın al, kampanya, sohbet kartı | — | Var | Yok | Yok |
| Ek paket | — | Yok | Var | Var |
| Hak bitince | — | Yükseltme duvarı, yenilenme saati | Ek paket | Ek paket |

Misafir model çağırmaz. Kayıtsız istek `401` ve `code: "AUTH_REQUIRED"`.

Plus vaadi **"Ücretsiz plandaki her şey ve:"** diye başlar: yüksek aylık kota, daha yüksek yükleme limiti, ek paket. Podcast ve sözlü ücretsizde de açıktır; Plus'a özel diye yazılmaz.

Bilerek yok: sahte geri sayım, ölçülemeyen kat iddiası, odaklanma modu, para iadesi garantisi.
