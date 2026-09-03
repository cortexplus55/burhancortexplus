# Astra onboarding funnel — guest (2026-09-03, gözlemlenmiş)
Base: https://app.astra-ai.co/tr-TR/onboarding → /onboarding/steps?step=<id>

Kritik: **Tüm funnel hesap AÇMADAN çalışıyor.** Hesap yalnızca en sonda,
plan gösterilmeden hemen önce isteniyor ("Hesabını kaydet — Çalışma planına
devam etmek için kaydol"). Klasik "value-first, signup-last" dönüşüm kalıbı.

| # | step | İçerik |
|---|------|--------|
| 1 | `welcome` | Telefon mockup animasyonu + "2 kat daha hızlı öğren lider AI öğretmen ile" · CTA "Başla" |
| 2 | `role-select` | **Öğrenci · Öğretmen · Ebeveyn · Diğer** (astronot illüstrasyonlu 2x2 kart) |
| 3 | voice | **"Nasıl ses çıkarmamı istersin?"** — ses karuseli (slider, default "Neil"), "Her sesi duymak için kaydır", **"Ses kullanma"** switch (yalnızca metin) |
| 4 | intent | "Yaklaşan bir sınavım var" / "Daha iyi notlar istiyorum" → funnel dallanır |
| 5 | name | "Adın ne?" tek input |
| 6 | age | "Kaç yaşındasın?" + **ebeveyn/vasi izni onay kutusu** |
| 7 | attribution | "Astra AI'ı nereden duydunuz?" — Diğer/Facebook/Instagram/YouTube/Google/Çevrimiçi içerik/TikTok/Arkadaşlar-Aile |
| 8 | exam-date | "Sınavın ne zaman?" — Yarın / 2 gün / 3 gün / Önümüzdeki günlerde + takvim date-picker |
| 9 | create-or-join | **"Sınav hazırlığı oluştur"** (kendi materyalin) vs **"Okulundaki sınav hazırlıklarına katıl"** (ÖNERİLEN — başkalarının oluşturduğu sınavlar) |
| 10 | subject | Arama + **"Dersini ekle"** (özel ders) + 14 hazır ders (Matematik, Fizik, Kimya, Bilişim, İngilizce, Almanca, İspanyolca, Fransızca, Biyoloji, Coğrafya, Tarih, Ekonomi, Felsefe, Psikoloji) |
| 11 | goal | Sadece geçmek (%60) / İyi not (%80) / En yüksek not (%90) / **Özel hedef belirle** |
| 12 | pain | "Seni en çok ne endişelendiriyor?" — Nereden başlayacağımı bilmiyorum / Çok fazla materyal var / Açıklamaları anlamıyorum / Yeterli zamanım yok / Geçemeyeceğimden endişeleniyorum |
| 13 | material | **ZORUNLU.** Drag&drop (Görseller, PDF, Word, PowerPoint, TXT) · "Dosya seç" · **"Telefonundan yükle" → QR kod** ("Kamera veya fotoğraf galerisine erişmek için tara") · **"Kopyalanan metni yapıştır"** |
| — | validation | Kısa metinde: "En az bir sayfa metin ekle." + toast "Yeterli içerik yok" |
| — | motivasyon | "Materyallerini eklemen neden bu kadar önemli? Ne kadar çok eklersen, Astra o kadar keskinleşir." |
| 14 | signup gate | "Hesabını kaydet" — Google / Apple / E-posta |

## UX detayları
- Üstte ince **progress bar**, sol üstte geri oku
- Adımlar arası **yatay slide/crossfade** geçişi (iki form DOM'da eşzamanlı)
- Sağ üstte dil seçici (TR)
- Her adımda emoji'li üst başlık ("Hadi başlayalım 🚀", "Bu çözülebilir 🧠")
