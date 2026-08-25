# Cortex Plus — Rol ayrımı, kayıt ve ilk ekranlar (Astra parity)

**Durum:** Kullanıcı onaylı tasarım (2026-08-25)  
**Kaynak:** Kayıt/onboarding soru seti (öğrenci / veli / okul öğretmeni)

---

## 1. Özet kararlar

| Konu | Karar |
|------|--------|
| Kayıt girişi | **Önce rol seç** → adım adım onboarding → **en sonda** e-posta/şifre veya Google |
| Çoklu rol | **Tek rol kayıtta**; sonra ayarlardan öğretmen başvurusu vb. ile ikinci rol |
| Veli ↔ öğrenci | **Kod + e-posta davet + sadece ödeme** modları |
| Öğretmen kaydı | **Üç yol:** Öğrenciyim / Veliyim / Okul öğretmeniyim (ayrı onboarding) |
| Öğrenci ana rota | **`/ogretmen`** (Sor ekranı, Astra `/` gibi) |
| Öğrenci alt menü | **Sor \| Sınavlar \| Uygulamalar** + menü grid (mevcut shell) |
| Öğrenci onboarding | Sınıf, okul, odak ders, sınav hedefi, avatar, seri/rozet modalları |
| Öğrenci AI açılış | **İsim + zaman selamı + “Başla” pill** |
| Veli ana rota | **`/veli`** — veliye özel shell |
| Veli ana içerik | **Bağlı çocuklar listesi** + **veli AI** (“Çocuğuma nasıl destek olurum?”) |
| Okul öğretmeni ana rota | **`/ogretmen-paneli`** (sınıf özeti önce) |
| Öğrenci vs öğretmen URL | **`/ogretmen` = öğrenci AI**; **`/ogretmen-paneli` = okul öğretmeni** |

---

## 2. Kayıt ekranı (Astra `/onboarding` + pay öncesi akış)

### 2.1 Görsel dil

- Koyu tam ekran (`astra-marketing` / `astra-app` token’ları)
- Büyük başlık, tek odaklı adım, altta **Devam** pill (mavi)
- Üstte ince **ilerleme çubuğu** (adım 1/N)
- Geri ok + atla yok (Astra: zorunlu adımlar); yasal onay son adımda

### 2.2 Adım sırası (tüm roller)

```
[1] Rol seçimi
      ┌─────────────┬─────────────┬──────────────────┐
      │  Öğrenciyim │   Veliyim   │ Okul öğretmeniyim │
      └─────────────┴─────────────┴──────────────────┘

[2] Rol bazlı onboarding (aşağıda)

[3] Hesap oluştur
      - E-posta + şifre VEYA Google
      - KVKK / kullanım koşulları onayı

[4] (Opsiyonel) E-posta doğrulama → devam

[5] İlk giriş hedefi (role redirect)
```

**Not:** Oturum açmış kullanıcı `/kayit`’e giremez; `/giris` sonrası rol onboarding eksikse ilgili onboarding’e yönlendirilir.

---

## 3. Rol bazlı onboarding adımları

### 3.1 Öğrenci

| # | Ekran | İçerik | DB alanı |
|---|--------|--------|----------|
| 1 | Sınıf | 9–12 / Mezun | `profiles.grade_level` |
| 2 | Okul | Arama veya “Okul ekle” (Astra: Hangi okula gidiyorsun?) | `profiles.school_name` (yeni) veya `schools` FK |
| 3 | Odak ders | Matematik, Fizik, … | `profiles.focus_subject` (yeni) veya onboarding JSON |
| 4 | Hedef | YKS / LGS / Okul sınavları / Konu pekiştirme | `learning_goals` |
| 5 | Avatar | Harf avatar veya foto (opsiyonel upload) | `profiles.avatar_url` |
| 6 | Hesap | E-posta/şifre/Google | Supabase Auth |
| 7 | İlk giriş | Gamification: seri + İlk Roket modalları | localStorage + streak |

**Bitince:** `onboarding_completed_at` + redirect **`/ogretmen`**.

### 3.2 Veli

| # | Ekran | İçerik |
|---|--------|--------|
| 1 | Tanıtım | “Çocuğunun ilerlemesini takip et, Plus yönet” |
| 2 | Bağlantı modu | **(A)** Davet kodu gir **(B)** E-posta ile davet **(C)** Şimdilik atla — sadece Plus/ödeme |
| 3 | (A/B) Onay bekleyen / bağlı çocuk özeti |
| 4 | Hesap | E-posta/şifre/Google |
| 5 | İlk giriş | **`/veli`** — çocuk listesi (boşsa CTA: kod/davet) + veli AI composer |

**DB:** `user_roles.role = 'parent'` (migration gerekli), `parent_student_links` tablosu.

### 3.3 Okul öğretmeni

| # | Ekran | İçerik |
|---|--------|--------|
| 1 | Kurum | Okul adı, branş (opsiyonel) |
| 2 | Sınıf | “İlk sınıfını oluştur” veya sonra |
| 3 | Hesap | E-posta/şifre/Google |
| 4 | Onay | Bilgi: `verified_teacher` admin onayı (mevcut başvuru akışı) |
| 5 | İlk giriş | **`/ogretmen-paneli`** — sınıf/öğrenci özeti |

**DB:** `user_roles`: `teacher` → onay sonrası `verified_teacher`.

---

## 4. İlk giriş — üç “AI / ana” ekran

### 4.1 Öğrenci — `/ogretmen` (Astra Sor)

- Shell: streak, avatar, alt 3 tab + menü
- Boş sohbet: `{ad}, iyi akşamlar! 🌙` + **Başla**
- Ders pill (dropdown), composer: Sor/konuş/dosya, +, kamera, mikrofon, Konuş
- Menü: quiz, deneme, paketler, profil…

### 4.2 Veli — `/veli`

- **Aynı koyu dil**; alt menü **veliye özel** (öneri):

| Tab | Rota | Açıklama |
|-----|------|----------|
| Çocuklarım | `/veli` | Liste, günlük özet kartı |
| Plus | `/veli/plus` veya `/paketler?veli=1` | Abonelik, ödeme iste |
| Destek | `/veli/ai` veya ana sayfada composer | Veli AI sohbeti |

- Veli AI sistem prompt’u: ebeveyn koçluğu, çocuk verisi RLS ile sadece bağlı öğrenciler
- Öğrenci Sor ekranı ile **aynı composer UX**, farklı karşılama metni

### 4.3 Okul öğretmeni — `/ogretmen-paneli`

- **Panel öncelikli** (sidebar veya sade kart dashboard — admin shell kalabilir)
- AI öğretmen: menüden `/ogretmen` **kapalı** veya “Kişisel asistan” linki (öğretmenin kendi çalışması için, sınıf verisi karışmaz)
- Öğrenci sohbetleri panelde **görünmez** (mevcut metin korunur)

---

## 5. Yönlendirme matrisi (middleware)

| Rol (birincil) | `/` ve `/giris` sonrası | Onboarding eksik |
|----------------|-------------------------|------------------|
| `student` | `/ogretmen` | `/kayit` akışındaki öğrenci adımları veya `/onboarding/ogrenci` |
| `parent` | `/veli` | `/kayit` veli adımları |
| `teacher` / `verified_teacher` | `/ogretmen-paneli` | `/kayit` öğretmen adımları |

`profiles.primary_role` veya `user_roles` içinde tek “active” rol önerilir.

---

## 6. Veritabanı (uygulandı)

Migration: `supabase/migrations/20250826090000_roles_and_parents.sql`

1. `user_roles.role` CHECK → `'parent'` eklendi  
2. `profiles` → `primary_role`, `school_name`, `focus_subject`, `invite_code` (6 haneli, benzersiz)  
3. `parent_student_links` → `parent_id`, `student_id`, `invite_email`, `status` (pending/active/revoked) + RLS  
4. `handle_new_user()` → kayıt sihirbazından gelen `primary_role`, sınıf, okul, ders, hedef yazılır  
5. `profile_link_exists()` → veli ↔ öğrenci karşılıklı ad görünürlüğü (RLS)  

---

## 7. Uygulama durumu

| Faz | İş | Durum |
|-----|-----|--------|
| P0 | `/kayit` çok adımlı sihirbaz (rol first) | **bitti** |
| P0 | Middleware rol redirect + student-only guard | **bitti** |
| P0 | `/veli` + `/veli/sor` + `/veli/plus` | **bitti** |
| P1 | Veli bağlantı: kod + e-posta daveti + atla | **bitti** (öğrenci onayı `/profil`) |
| P1 | Öğrenci onboarding sihirbazda (sınıf, okul, ders, hedef, avatar) | **bitti** |
| P2 | Veli AI system prompt (`audience: parent`) | **bitti** |
| P2 | E-posta davetinin gerçek gönderimi (Resend) | **bitti** |
| P2 | Veli paneline ilerleme/deneme özeti | **bitti** |
| P2 | Öğretmen kaydı → otomatik `teacher_applications` kaydı | **bitti** |

### Veli özeti — veri sınırı

`src/lib/parent/child-summary.ts` yalnızca **onaylanmış** (`status = 'active'`) bağlantıda ve
**son 30 gün** için toplu sayı döndürür: aktif gün, deneme sayısı + ortalama, quiz sayısı,
açık görev, en zayıf 3 konu. Sohbet içeriği, mesaj metni veya doküman **hiçbir koşulda**
veliye dönmez.

### E-posta akışı

| Tetik | Alıcı | İçerik |
|-------|-------|--------|
| Veli kod ile bağlanır | Öğrenci | Bildirim kaydı + "veli bağlantı isteği" e-postası |
| Veli e-posta ile davet eder | Davet edilen | "Cortex Plus daveti" + kayıt bağlantısı |
| Davet edilen kayıt olur | — | Bekleyen istek otomatik hesabına bağlanır (yine onay ister) |

---

## 8. Kapalı kararlar (2026-08-25)

1. Veli **Plus:** alt tab **Plus** (abonelik / ödeme veli ekranı).  
2. Okul öğretmeni **`/ogretmen` kapalı** — sadece `/ogretmen-paneli`.  
3. Okul alanı v1: **Arama + mock okul listesi** (Astra UI; sonra gerçek veri).

P0 implementasyona hazır.
