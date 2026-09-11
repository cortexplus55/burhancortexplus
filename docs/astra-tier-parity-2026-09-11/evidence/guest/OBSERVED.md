# Misafir katmanı — Astra (gözlenen)

Tarih: 2026-09-11. Tarayıcı: uygulama içi panel, Astra oturumu YOK (gerçek misafir).

## 1. Uygulama misafire kapalı
- `app.astra-ai.co` → doğrudan giriş ekranı.
- Ekranda: "Giriş yap veya yeni bir hesap oluştur. Ücretsiz." + Google / Apple / E-posta.
- **Anonim deneme YOK.** Misafir ürünün hiçbir işlevini çalıştıramıyor.

## 2. Pazarlama sitesi ayrı alan adında
- `astra-ai.co` → tanıtım. Bizdeki `cortexplus.app` pazarlama sayfalarının karşılığı.
- Üst çağrılar: "Ücretsiz dene" → `/tr-TR/onboarding`, "Astra AI satın al" → `/tr-TR/pay`.
- **"Ücretsiz dene" giriş ekranına DEĞİL, onboarding'e gidiyor.**

## 3. Misafir hesapsız onboarding'e girebiliyor  ← ASIL FARK
`/tr-TR/onboarding/steps?step=...` ile yürüyen sihirbaz. Hesap istemeden başlıyor.

Gözlenen adım sırası (girilerek doğrulandı):
1. `welcome` — "2 kat daha hızlı öğren" + "Başla" + "Hesabın var mı? Giriş yap"
2. `role-select` — "Rolünü seç": Öğrenci / Öğretmen / Ebeveyn / Diğer
3. `voice` — "Nasıl ses çıkarmamı istersin?" ses seçimi (Neil…), "Ses kullanma" seçeneği
4. `onboarding-intent` — "Şu an en çok neye ihtiyacın var?": 🧨 Yaklaşan bir sınavım var / 📈 Daha iyi notlar istiyorum
5. `basic-profile-info` — "Adın ne?"
6. `age` — "Kaç yaşındasın?" + ebeveyn/vasi izni onay kutusu

## Nerede durdum ve neden
`age` adımındaki **ebeveyn/vasi izni onay kutusunda durdum** — rıza/onay kutusu işaretlemek
denetim sınırları dışında. Bu adımdan sonrasını ve hesap açma duvarının tam yerini görmedim.
Bu satırlar raporda BLOCKED.

Ad alanına kullanıcının kişisel bilgisi girilmedi; "Deneme" yer tutucusu kullanıldı, hesap açılmadı.
