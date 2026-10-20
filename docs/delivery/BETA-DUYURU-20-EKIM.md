# Kapalı beta duyurusu — 20 Ekim 2026

Ürün sahibinin kararları (20 Ekim 2026): beta öğrencisi **sosyal medyadan** gelir (Instagram,
WhatsApp / Telegram grubu); duyuruda **tek ortak kod, ilk 50 kişi, 14 gün Plus**. Kod
`/admin/promosyonlar` → "Ortak beta kodu" kartında açılır (`AGENTS.md` → "Kapalı beta kodları").

- Kod: **CORTEXBETA** · 50 kişi · 14 gün Plus
- Bağlantı: `https://cortexplus.app/pay?kod=CORTEXBETA`

Bağlantının yolu: oturumsuz öğrenci kayda düşer (`next` kodu taşır) → kayıt → e-posta onayı (başka
tarayıcıda açılsa da adres hesapta durur, `signup_next`) → Abonelik sayfası kod dolu açılır → "Kodu
kullan". Instagram'ın tarayıcısında Google girişi çalışmaz; sayfa bunu kendisi söyler ve e-postayla
kayda yönlendirir.

## Instagram gönderisi

Gönderi metninde bağlantı tıklanmaz: bağlantı profile (biyografi) konur.

```text
Notunu yükle, sınava hazır bir yol çıksın.

Cortex Plus kapalı betaya başlıyor: ilk 50 kişiye 14 gün Plus hediye.

Nasıl çalışıyor?
• Ders notunu yüklersin (PDF, Word ya da fotoğraf)
• Notun konulara ayrılır, sırayla yoluna dizilir
• Her konu için ders, test ve kartlar; Plus'ta podcast, video ders, yazılı ve sözlü deneme
• Hepsi senin notundan; notunda olmayan bilgi "Genel bilgi" etiketiyle gelir

Plus denemesi:
✓ Kart istemiyoruz
✓ 14 gün bitince ücretsiz hesapla devam edersin, ücret alınmaz
✓ Kendiliğinden yenilenmez

Kod: CORTEXBETA
Bağlantı profilde. Kayıt olunca kod kutuda hazır gelir, "Kodu kullan"a basman yeter.

Betada haftada bir 4 soruluk kısa anket soruyoruz; yazdıklarını okuyup düzeltiyoruz.

#KPSS #YKS #TUS #sınavahazırlık
```

## Instagram hikâyesi

Bağlantı çıkartmasıyla (`cortexplus.app/pay?kod=CORTEXBETA`).

```text
İlk 50 kişiye 14 gün Plus
Notunu yükle: ders, test, podcast senin notundan
Kart yok · kendiliğinden yenilenmez
Kod: CORTEXBETA
```

## WhatsApp / Telegram grubu

```text
Merhaba! Cortex Plus'ın kapalı betasına ilk 50 kişiyi alıyoruz: 14 gün Plus ücretsiz.

Ders notunu (PDF, Word ya da fotoğraf) yüklüyorsun; notun konulara ayrılıyor ve her konu için ders, test ve kartlar hazırlanıyor. Plus'ta podcast, video ders, yazılı ve sözlü deneme de açık. Hepsi kendi notundan; notunda olmayan bilgi "Genel bilgi" etiketiyle geliyor.

Kart istemiyoruz. 14 gün bitince ücretsiz hesapla devam edersin, ücret alınmaz.

1) Bağlantıyı aç: https://cortexplus.app/pay?kod=CORTEXBETA
2) Kayıt ol (e-postayla kayıt olduysan gelen onay e-postasındaki bağlantıyı aç)
3) Kod kutuda hazır gelir; "Kodu kullan"a bas

Kutuyu boş görürsen bağlantıyı bir kez daha aç ya da kodu elle yaz: CORTEXBETA

Haftada bir 4 soruluk kısa anket soruyoruz; yazdıklarını okuyup düzeltiyoruz.
```

## Her söz nerede doğru

| Söz | Dayanak |
|---|---|
| Notunu yükle, sınava hazır bir yol çıksın | Ana sayfanın başlığı (`landing-content.ts` `HERO`) |
| PDF, Word ya da fotoğraf | `DOCUMENT_UPLOAD_ACCEPT` (`upload-accept.ts`) |
| Konulara ayrılır, sırayla yoluna dizilir | `STEPS` "Yolun çıksın"; kurulum kurs haritasından (`AGENTS.md` → "Sınav seti") |
| Ders, test, kartlar her planda; podcast, video, yazılı ve sözlü deneme Plus'ta | `FEATURES` `plusOnly`; ücretsiz günlük hak 6 kredi (`AGENTS.md` → "Misafire gösterilen her söz") |
| "Genel bilgi" etiketi | `PROOF`; ders `note` bloğu `tone: general` |
| Kart istemiyoruz | Kod ödeme istemez; `redeem_promo_code` ödeme kaydı yazmaz |
| 14 gün bitince ücretsize döner, ücret alınmaz, kendiliğinden yenilenmez | `trial_until = current_period_end`; `AUTO_RENEW_SUPPORTED = false`; `trialNotice` |
| İlk 50 kişi | `max_redemptions = 50`, sayaç kilitli satırda (`FOR UPDATE`); 51. kişi "Bu kodun kullanım hakkı doldu" |
| Haftada bir 4 soruluk anket | `/api/feedback/weekly`, Sınavlar sayfasındaki kart (o hafta etkinlik açan, hesabı iki günden eski öğrenci) |

Yazılmayanlar: rakip adı, "gelişmiş model", sayılı hak ("ayda 1.200 ders" aylık Plus içindir;
14 günlük deneme hakkı gün sayısıyla orantılıdır), sahte aciliyet.
