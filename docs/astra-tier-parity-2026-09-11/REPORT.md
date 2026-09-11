# Astra katman denetimi — rapor

**Tarih:** 11–12 Eylül 2026. **Amaç:** Astra'nın misafir / ücretsiz / premium ayrımlarını
Cortex Plus'a birebir uyarlamak. **Karar:** yalnızca özellik ayrımı alınır; paket adları ve
fiyatlar bizde kalır. Ücretsizde günlük hak modeli. Ödeme kapalı kalır.

## 1. Gerçekten test edilen

| Katman | Nasıl doğrulandı |
|---|---|
| Misafir | Oturumsuz tarayıcı. `app.astra-ai.co` giriş duvarı, `astra-ai.co` pazarlama sitesi, hesapsız onboarding 6 adım yürütüldü. |
| Ücretsiz | `burhan55600@gmail.com`, Google hesap seçici (parola girilmedi). **Ekrandan doğrulandı:** "Astra AI Basic · Sonsuza dek ücretsiz · AKTİF PAKET", profil "İstanbul Üniversitesi". |
| Premium | `brhnondr55@gmail.com`. **Ekrandan doğrulandı:** "Astra AI Plus · geçerlilik 24.09.2026", profil "Giresun Ünv.tıp Fakültesi". |

Gezilen yüzeyler: giriş, onboarding (6 adım), pazarlama ana sayfa, `/pay` (iki paketin tam
avantaj listesi açıldı), `/showcase`, `/dashboard`, `/exam-preps`, bir hazırlığın çalışma yolu,
podcast oynatıcı, `/lab`, profil penceresi, Abonelikler, Kullanım limitleri.

## 2. Test EDİLMEYEN

- **Hak tükenme duvarı.** Ücretsiz hesabın günlük hakkı o sabah sıfırlanmıştı (%0 kullanıldı).
  Duvarın metni ve düğmeleri görülmedi.
- **Ödeme akışı.** "Satın al", "Plus'a yükselt", "Ek paket satın al" tıklanmadı — sınır.
- **Onboarding'in sonu.** `age` adımındaki ebeveyn/vasi izni onay kutusunda durdum; hesap açma
  duvarının tam yeri görülmedi. Ad alanına yer tutucu yazıldı, kişisel bilgi girilmedi.
- **Sözlü/deneme sınavı ve fotoğrafla çözüm** ücretsiz hesapta ayrıca denenmedi.

## 3. Asıl bulgu — pazarlama metni katman modelini yanlış anlatıyor

Astra'nın `/pay` sayfası "Testler, kartlar ve podcast'ler" ve "Deneme ve sözlü sınavlar"ı Plus
avantajı diye sayıyor. **Ücretsiz hesapta bunlar kilitli değil:** çalışma yolundaki podcast
adımı açıldı ve tam oynatıcı geldi; `/lab`'daki 34 simülasyon ve 11 oyun da açık.

Gerçek model: **her şey açık, tek bir kullanım hakkı var.** Ücretsizde GÜNLÜK (03:00'te
sıfırlanır), abonede AYLIK (fatura gününde). Plus'ın vaadi "1300 kat daha fazla günlük
kullanım" — aynı özellikler, yüksek tavan. Sigma da öyle: "8 kat fazla kullanım".

Bizim `/krediler` sayfamızın alt başlığı zaten bunu söylüyor:
*"Tüm özellikler açık; sınır yalnızca ne kadar üretebildiğinde."*

## 4. Sonuç: mekanizma zaten bizdeydi

Günlük/aylık hak, tek sayaç, davet çarpanı (3 kat / 400 kat), ücretsize özel satın alma
düğmesi ve kampanya bandı, abonede bunların gizlenmesi — hepsi kodda mevcuttu ve
doğrulandı (DELTA #3–#10). Eksik olan iki şey öğrencinin GÖRDÜĞÜ taraftaydı ve kapatıldı:

1. **Paket görünmüyordu.** Profil paneli yalnızca ayardı. Artık en üstte paket adı, hak birimi
   ve yenilenme zamanı var; ücretsize yükseltme çağrısı, abonede yok.
2. **Yenilenme saati yanlış yazılıyordu.** Sınır UTC gece yarısı = Türkiye'de 03:00, ama etiket
   sunucuda üretiliyor ve sunucu UTC'de; ekranda "00:00" yazıyordu. Hakkı biten öğrenci gece
   yarısını bekliyor, hiçbir şey olmuyor, üç saat daha bekliyordu. Saat dilimi sabitlendi.

## 5. Doğrulanmamış varsayım yok
Bu raporda "muhtemelen/genelde" yok. Görülmeyen her şey bölüm 2'de ve DELTA'da `BLOCKED`.
