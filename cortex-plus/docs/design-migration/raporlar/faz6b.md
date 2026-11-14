# Faz 6B · Fotoğraf, Başla, el yazısı, duygu koçu (`ui.v2.ogretmen`)

## 1. Özet
- Sohbetteki "Görsel ekle" düğmesi bayrak açıkken `<Gate action="photo.solve">` içinde: hak bittiyse yükleme penceresi
  açılmaz, "Bugünkü fotoğraf hakkın bitti" penceresi çıkar; 1 hak kaldıysa "1 kaldı". Kapalıyken düğme bugünkü gibi.
- "Başla", el yazısı sonucu, "⚠️ Akıllı Hoca Uyarısı" ve duygu koçu: bugünkü bileşenler korunur; yeni işaret çizilmedi.

## 3. Değişen dosyalar
`src/components/chat/chat-panel.tsx` (yalnız `followUser` dalında Gate), `tests/unit/ui-v2-ogretmen.test.ts`.

## 6. Promptan ayrılan yerler
- Düğmenin adı bugünkü "Görsel ekle" (metin değişmez kuralı; prompt "Fotoğraf ekle" diyordu).
- Matristeki öğretmen sohbeti hücreleri (anlama göstergesi, oturum özeti) bugün yok: çizilmedi ("Sonraki karar").

## 10. Burhan'ın yapacakları
- Gerçek cihazda fotoğraf seçimi.
