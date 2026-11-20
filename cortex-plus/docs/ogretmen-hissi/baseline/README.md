# Baseline (13.0)

15 Kasım 2026. Bu klasör bugünkü (teacher.v2 öncesi) davranışın kanıtlarını tutar.

## Durum: ekran görüntüleri bekliyor

Plan, G1–G6'nın giriş yapmış hesapla yeniden üretilip birebir metin ve ekran görüntüsüyle buraya kaydedilmesiydi. Bu oturumda
yapılamadı:

- Tarayıcıda cortexplus.app oturumu kapalı. Claude şifre giremez; giriş Burhan'ın işi.
- Üretim veritabanındaki sohbet mesajlarını okumak izin kontrolünde reddedildi (kişisel içerik). Aşılmaya çalışılmadı.

Burhan tarayıcıda giriş yapınca G1–G6 aynı cümlelerle çalıştırılır. Her biri için `gN.md` (birebir metin) ve `gN.png` buraya
eklenir. Model çağrısı küçük: tur başına 1-3 çağrı.

## Şimdiden kaydedilen kanıt (model çağrısı yok)

- `g1-g4-istem-satirlari.txt`: G1 sorusu için bugünkü kodun kurduğu tura özel istem satırları. Gerçek eşleştirici ve gerçek
  satır üreticileri kullanıldı (`matchChatMaterial`, `materialTurnLines`). Örnek dizin, Burhan'ın hesabındaki gibi bir
  "TYT Kimya" hazırlığıdır (Karışımlar, Mol Kavramı konuları).
  - Sonuç: "karıştırıyorum" sözcüğü "Karışımlar" konusuna eşleşiyor (`reason: named`).
  - Modele «TYT Kimya hazırlık · Karışımlar» adı ve "Bu tur için notunda eşleşen parça bulunamadı … bunu tek cümleyle söyle"
    talimatı gidiyor. G1'deki "hazırlık parçalarında … bulunamadı" ve G4'teki "TYT Kimya …" cümlesi buradan çıkıyor.

## Burhan'ın gözlemi (PROMPT.md §3, aynen)

G1–G8 metinleri `../PROMPT.md` §3'te. Yeniden üretim yapılınca birebir metin bu dosyanın yanına eklenir; fark varsa not
düşülür.
