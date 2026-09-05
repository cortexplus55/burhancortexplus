# Kötüye kullanım koruması

**Karar tarihi: 5 Eylül 2026.** Sistem şu an **gözlem modunda**: kimse otomatik
olarak engellenmiyor ya da hesabı kapatılmıyor. Sınıra takılan her olay
`abuse_events` tablosuna yazılıyor ve `/admin/kotuye-kullanim` sayfasında
görünüyor. Amaç, eşikleri tahminle değil gerçek kullanımla belirlemek.

Tek istisna anlık ve dar kapsamlı olanlar: istek sınırına takılan çağrı 429
alıyor, içerik denetiminin engel dediği istek üretim yapmıyor. Bunlar hesabı
etkilemiyor, yalnızca o isteği durduruyor.

---

## Sayaç nerede: Upstash

**Durum (5 Eylül 2026): bağlı.** `cortexplus-ratelimit` adlı Upstash for Redis
(Free) veritabanı 1 Eylül'de Vercel Storage üzerinden projeye eklenmiş,
Production ve Preview'a bağlı. Panelde yapılacak bir iş kalmadı.

### Dört gün boyunca çalışmayan koruma

Redis bağlıydı ama hız sınırı hiç kullanmıyordu. Sebep: **iki taraf aynı şeye
farklı ad veriyordu.**

| Vercel'in enjekte ettiği | Kodun aradığı |
|---|---|
| `KV_REST_API_URL` | `UPSTASH_REDIS_REST_URL` |
| `KV_REST_API_TOKEN` | `UPSTASH_REDIS_REST_TOKEN` |

Hiçbir hata verilmedi. `rateLimit` aradığını bulamayınca sessizce bellek
yedeğine düştü, yani üretimde sınır yokmuş gibi davrandı. Üstüne
`/admin/sistem` sayfası da tek isme baktığı için "Upstash Redis: Tanımsız"
diyordu — doğru uyarı, ama kimse "zaten bağlamıştım" diye üzerine gitmedi.

Düzeltme panele ikinci bir kopya eklemek değil, **kodun iki adı da tanıması**
oldu (`redisConfig()`, `src/lib/rate-limit.ts`). Aynı anahtarı iki değişkende
tutmak, ileride anahtar yenilendiğinde birinin güncellenip diğerinin
unutulacağı bir tuzak olurdu. `UPSTASH_*` önce bakılıyor: biri elle o adı
verdiyse niyeti açıktır.

Bekçi test: `tests/unit/rate-limit.test.ts` → "Redis bağlantısı — isim
çözümlemesi". Sessiz arıza en pahalı arıza türü; kodun hangi adları tanıdığı
artık yazılı.

### Doğrulama

`/admin/sistem` → "Upstash Redis" satırı **Tanımlı** görünmeli. Görünmüyorsa
sayaç her sunucuda ayrı tutuluyor ve sınır fiilen yok demektir.

---

## Katmanlar

### 1. İstek sınırı — `src/lib/api/guards.ts`

| Aşama | Kime | Ne yapar |
|---|---|---|
| Oturum çerezi yoksa | adrese | dakikada 20; doğrulama sunucusuna hiç gidilmez |
| Dakikalık | kullanıcıya | uca göre 3–60 arası |
| Günlük | kullanıcıya | verilmezse dakikalık sınırın 20 katı |

Sayaç neden adrese değil kişiye bağlı: okuldan ya da yurttan giren otuz
öğrenci tek adresi paylaşıyor. Adrese göre sayınca birbirlerinin kotasını
yiyorlardı; modem kapatıp açan biri ise sayacı sıfırlıyordu.

Redis'e ulaşılamazsa kapı **kapatılmıyor**, bellek yedeğine düşülüyor. Bir
Redis kesintisi yüzünden öğrencinin dersi yarıda kalmasın.

### 2. İçerik denetimi — `src/lib/ai/moderation.ts`

OpenAI'nin ücretsiz moderation ucu; faturaya bir şey eklemiyor. Üç davranış:

- **engelle** — `sexual/minors`, `self-harm/instructions`, `illicit/violent`,
  `hate/threatening`, `harassment/threatening`. Dersle açıklanamaz olanlar.
- **destekle** — `self-harm`, `self-harm/intent`. Reddetmek yerine
  destekleyici bir yanıt ve yardım hattı (ALO 183, acil 112).
- **işaretle** — geri kalanı. Üretim yapılır, olay yalnızca kaydedilir.
  Tarih dersinde savaş, biyolojide üreme, edebiyatta intihar geçer; bunları
  engellemek en çok dersin kendisini vururdu.

Denetim kredi ayrılmadan önce çalışıyor: engellenen istek öğrencinin hakkını
yakmıyor. Denetim ucu hata verirse istek geçiyor (kapı açık kalıyor).

### 3. Çoklu hesap — `20260905170000_email_verification_gate.sql`

Sömürü şuydu: kendi davet kodunla üç hesap aç, çarpanın 3'e çıksın; açtığın
hesaplar da davet edilmiş sayılıp 3 kat alsın. Dört hesapla günde 6 yerine 72
ücretsiz işlem.

Düzeltme hesap açmayı engellemiyor, ödülü doğrulamaya bağlıyor:

- Doğrulanmamış hesap **davet olarak sayılmıyor** (`referral_counted`).
- Doğrulanmamış hesabın kendi hakkı tadımlık: günde 2 (`unverified_allowance`).
  Sıfır değil — e-posta gecikirse öğrenci ürünü hiç göremeden ayrılırdı.
- Doğrulanmamış hesaba davet çarpanı uygulanmıyor.
- Tek kullanımlık e-posta alan adları ödül kazanmıyor
  (`blocked_email_domains`); kayıt formunda da erken uyarı veriliyor.
- Google ile gelen kullanıcı doğrulanmış sayılıyor.
- **5 Eylül 2026'dan önce açılmış hesaplar kural dışı** — yayındaki kimsenin
  hakkı bir gecede düşmesin.

Gmail'in nokta ve `+` yazımları tek adrese indiriliyor
(`src/lib/auth/email-policy.ts`): `ali.veli+1@gmail.com` ile
`aliveli@gmail.com` aynı kutu.

### 4. Hesap paylaşımı

Pahalı uçlarda (`trackSharing: true`) hesabın gün içinde kaç farklı yerden
kullanıldığı sayılıyor. Sekiz ayrı yerden sonra kaydediliyor — **engellenmiyor**.
Eşik yüksek: bir öğrenci gün içinde evde wifi, yolda mobil veri, okulda başka
bir ağ kullanır.

### 5. Depolama ve yükleme

- Kullanıcı başına toplam alan: ücretsiz 150 MB, abone 1 GB
  (`src/lib/documents/storage-quota.ts`). Tek dosya sınırı (15 MB) zaten vardı
  ama toplamı sınırsızdı.
- Telefondan yükleme ucu (girişsiz tek kapı) adrese göre sınırlı.

### 6. Kod deneme

`join-class`'ta **yalnızca yanlış denemeler** sayılıyor: saatte 8 boş deneme.
Doğru kodu bilen öğrenci ikinci denemede içeride olduğu için kotasından
yemiyor. Yanıt her hâlükârda aynı 404 — hangi kodun var olduğu sızmıyor.

### 7. İade

`markPaymentRefunded` artık aboneliği de kapatıyor ve cüzdanın dönemini
geçmişe çekiyor. Eskiden kapatmıyordu: Plus al, aylık hakkı bir günde yak,
sonra iade iste — para geri gider, abonelik yerinde kalırdı.

---

## Adresler neden açık yazılmıyor

Ham IP kişisel veri. Sömürüyü yakalamak için "aynı yerden mi geliyor" bilgisi
yeterli, "nereden geliyor" gerekmiyor. `APP_SECRET` ile karılmış özet
saklanıyor: eşitlik karşılaştırılabiliyor, geriye çevrilemiyor.

---

## Sonraki adım — gözlemden otomatiğe

1–2 hafta gerçek veri biriktikten sonra `/admin/kotuye-kullanim` sayfasındaki
"tekrar eden hesaplar" listesine bak. Orada gerçek öğrenciler değil de belirgin
bir desen görünüyorsa, o sinyal için otomatik yavaşlatma açılabilir. Bu karar
verilmeden önce eşiklerin gerçek kullanımı kesmediğinden emin olunmalı.
