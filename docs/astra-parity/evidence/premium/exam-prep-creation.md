# Astra "Sınav Hazırlığı" oluşturma akışı (girişli, gözlemlenmiş 2026-09-03)

URL zinciri:
`/exam-preps/create?draft=true` → `/exam-preps/create/<id>?s=false&draft=true&chatId=<nanoid>`

## 1. Materyal işleme (2 aşamalı loading)
- "Yüklenen materyal inceleniyor... Bu birkaç saniye sürebilir."
- "Çalışma planın hazırlanıyor"

## 2. AI RÖPORTAJI — sohbet içinde, form değil
Astra: *"Materyallerini inceledim ve **5 konu buldum**. Birkaç kısa sorudan sonra
planını birlikte oluşturacağız."*

Yapıştırdığım metinden çıkarılan konular:
1. Limit ve Süreklilik Kavramı
2. Türev Tanımı ve Türev Alma Kuralları
3. Türevin Uygulamaları ve Optimizasyon
4. Belirli İntegral ve İntegral Alma Teknikleri
5. Analizin Temel Teoremi

### Soru 1 — Odak
"En çok neye odaklanalım?" · *"Hepsini ele alacağız, bunlara sadece biraz daha
fazla zaman ayıracağız."* → çoklu seçim checkbox + "Cevabını yaz" serbest metin
Butonlar: **"Sen karar ver"** | **"Gönder"**

### Soru 2 — Öğrenme stili
"Nasıl bir çalışma yöntemi tercih edersin?" · *"Çalışma stilini belirlemek,
materyalleri sana en uygun şekilde hazırlamamı sağlar."*
1. Daha fazla teori ve anlatım · 2. Daha fazla egzersiz ve problem çözümü
3. Daha fazla tanım ve anahtar terimler · 4. Dengeli bir karışım

### Soru 3 — RAG kapsamı (kullanıcıya açık grounding kontrolü)
"Yalnızca dosyalarına bağlı kalmamı ister misin?"
1. **Evet, yalnızca çalışma materyalim** (ÖNERİLEN) · 2. İnternetten de ekleyebilirsin

Güven kartı: *"Çalışma materyaline dayalı — Astra, yüklediklerini analiz eder ve
rastgele kaynaklar ya da **halüsinasyonlar olmadan** çalışma yolunu oluşturur."*

### Konu onayı
"Çalışma konuların hazır!" → her konu satırında **"1 kaynak"** rozeti +
**kalem (düzenle)** ve **çöp kutusu (sil)** ikonları → CTA "Sınav Hazırlığı Oluştur"

## 3. ÜRETİLEN PLAN — 7 fazlı öğrenme yolu

Üstte: **geri sayım kartı** — "SINAVA KADAR / **10** gün / 13 Eylül Pazar"
Başlık: "Günlük çalışma planın — Adım adım sınava hazırlan ⚡"

| Faz | İçerik |
|---|---|
| 1. **Bugün başla** | Yapay zeka ile Çalışma Yolu oluşturma · Giriş Dersi (5 dk) · **Tanı Testi** |
| 2. **Öğren ve Pratik Yap** | **Podcast Dinle** · Yapay zeka öğretmenle Soru-Cevap · Testler ve Doğru/Yanlış · **Yapay Zeka ile Sözlü Deneme Sınavı** |
| 3. **Aralıklı Tekrar** | "Öğrendiklerini tekrar et" (spaced repetition) |
| 4. **Bilgi boşluklarını kapat** | Zayıf nokta tespiti · Odaklı pratik |
| 5. **Yazılı Deneme Sınavı** | "Gerçek sınav simülasyonu, **yapay zeka yardımı yok**" |
| 6. **Sınav günü** | Kartlarla son tekrar · Son zayıf nokta kontrolü |
| 7. **Hazırsın 😎** | "Başaracaksın" |

**Hazırlık puanı** göstergesi: `80%` · emoji ölçek 😰 → 🥳 ·
"Bugün: Hazır değilsin" → "13 Eyl: Hazırsın" · "80% hedefine 13 Eyl tarihine kadar"

CTA: "10 günlük planımı başlat"

## 4. Sohbet UI detayları
- AI mesajlarının içinde **etkileşimli widget kartları** (checkbox listesi,
  numaralı seçenek listesi, güven kartı, konu listesi) — düz markdown değil
- Her AI mesajının altında **👍 / 👎** geri bildirim
- Composer: **kamera ikonu** (fotoğraf) + **mikrofon ikonu** (sesli giriş) +
  placeholder "Sınavında ne var söyle"
- Sürekli görünen **"Plana geç →"** atlama butonu
- Üstte ince progress bar + geri oku + kapat (X)
