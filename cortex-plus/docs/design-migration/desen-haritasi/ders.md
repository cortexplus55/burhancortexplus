# Desen haritası · Ders ekranı (`ui.v2.ders`)

Mevcut öğe → hedef bileşen / token. Kurallar `src/styles/ui-v2-ders.css`, yalnız `[data-ui~="ders"]` altında.

| Mevcut öğe | Hedef |
|---|---|
| `.als` sütunu (42rem) | İçerik sütunu 768 px, dikey aralık 24 |
| `.als-top` (bulanık yarı saydam) | Üst çubuk 56 px, `bg0`, bulanıklık yok |
| `.als-progress-track` 4 px | 6 px hap, iz `bg1`, dolgu imza gradyanı, en çok 472 px, ortada |
| `.als-count` | `label-13`, ikincil metin ("1 / 7") |
| `.als-icon` (kenarlıklı) | `glass` ikon düğmesi 40 px (telefonda 44) |
| `.als-slide` | Kenarlıksız kart, `bg1`, köşe 24 |
| `.als-body` | Gövde 16/24, okuma metni |
| `.als-note--*` | Bilgi kutusu: tonun %8'i zemin + 1 px aynı ton kenarlık, köşe 16 (sınav/uyarı turuncu, akılda tut/ezber camgöbeği, bilgi indigo, genel nötr) |
| `.als-formula-card` | FormulaCard indigo zemin |
| `.als-visual--trap` | ExamTrapCard turuncu uyarı |
| `.als-visual--hook` | MemoryHookCard camgöbeği |
| `.als-check` | Hızlı sınav kartı: `bg0`, köşe 16, 1 px kenarlık |
| `.als-option` (+ `is-picked`, `is-right`, `is-wrong`) | Şık hapı 56 px: boşta `bg1`, seçili `bg2`, doğru `success-weak`, yanlış `danger-weak` |
| `.als-cta` | Tek brand hap 52 px + "↵" ipucu (klavyeli cihaz) |
| `.als-secondary`, `.als-reexplain-btn` ("🔄 Farklı anlat"), `.cp-two-chip` ("🤔 İki şık arasında kaldım") | HER ZAMAN `weak` |

## Desen yok

| Öğe | Neden |
|---|---|
| Alt eylemin "Açıkla" (`weak`) + "Devam et" (`brand`) ikilisi | Bugünkü akışta cevaptan sonra tek "Devam et" var; ikinci düğme davranış ekler (yeni öğe icat edilmez) |
| Giriş adımında "3 dk okuma · 7 adım" rozeti ve numaralı "Seni neler bekliyor" | Bugünkü giriş planı (`.als-intro-plan`) yapı olarak aynı; sayı metni yeni değil, görünüm token'a çevrildi |
| Açılışta konu başlıklarının tek tek gelmesi, "Öğrendiğin 3 şey", seri çipi | Davranış ekler; ders verisinde "öğrenilen 3 şey" alanı yok (yeni çağrı yasak). 5A ile birlikte değerlendirilecek |
| Hedef adım şeridi + kalan süre | Mevcut ilerleme çubuğu ve dakika etiketi aynı bilgiyi verir; ikinci şerit eklenmedi |
