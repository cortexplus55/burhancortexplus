# Faz 9 · Düello (`ui.v2.duello`)

Teknik tasarım ve kararlar: `docs/design-migration/09-duello-tasarim.md`.

## 1. Özet
- Bugünkü düello sistemi (prep_duels, hesapsız oyun, sunucuda puan, tohumlu bot) korundu; yeni görünüm onun üstünde.
- Bayrak açıkken: rakip bilgi sızdırmaz (botun bu sorudaki doğru / yanlışı, puanı ve nokta rengi öğrenci cevaplayana
  kadar "cevapladı"), bot "BOT" etiketli, düello kurma düğmeleri `<Gate action="duel.start">` içinde (kilitliyken
  istek atılmadan yükseltme penceresi). Kartlar kenarsız, birincil düğme marka, ikincil cam, şıklar 56 px hap.
- Bayrak kapalıyken bugünkü akış (bot sonucu süresi gelince görünür, kapı 402 ile).

## 3. Değişen dosyalar
`src/components/duel/duel-play.tsx` (`neutralBot`), `src/components/duel/new-duel-button.tsx` (`gated`),
`src/app/duello/[code]/page.tsx`, `src/app/deneme-sinavlari/[prepId]/duello/page.tsx`, `src/styles/ui-v2-duello.css`,
`tests/unit/ui-v2-duello.test.tsx`.

## 6. Promptan ayrılan yerler
- Yeni `duels` tablosu ve yeni üretim akışı yazılmadı: bugünkü tablolar ve üretim kullanıldı (gerekçe tasarım belgesi A).
- 9A'nın sahte verili yeni kurulum ve VS ekranları, 9B sunucusu, 9C bağlama ve Faz 10 park (tasarım belgesi H, I).
- Bot turu oyunun başında tek yanıtta geliyor (soru başına süre ve doğru / yanlış; şık yok): arayüz nötr gösteriyor,
  sunucunun soru soru vermesi 9B'nin işi.

## 10. Burhan'ın yapacakları
- Yeni düello üretim istemi (tür karışımı, kademeli zorluk) için karar.
- Düello göçü yazılınca SQL ekranında uygulamak.
