# 05 · Test hesapları

Ürün sahibinin kararı (14 Kasım 2026, **A seçeneği**): kodda değişiklik yok; hesaplar "sessiz" açılır, e-posta tetikleyen her
alan baştan kapalı ya da "gönderildi" işaretli. Veritabanı canlıyla ortak (`dgjfyewgrukglsehyntc`).

Betikler: `scripts/seed-e2e-users.mjs` (aç, güncelle, kaldır), `scripts/e2e-login.mjs` (giriş durumları),
`scripts/design/measure-screens.mjs` (ölçüm). **Parola bu belgede, depoda ve kayıtlarda yok.**

## Hesaplar

Adres: `<ad>@e2e.cortexplus.test`. `.test` alan adı hiçbir posta kutusuna gidemez (RFC 2606). Her hesap `app_metadata.e2e = true`
ve `app_metadata.e2e_user = <ad>` taşır; betik yalnız bu işareti taşıyan hesaba dokunur.

| Ad | Plan | Durum | Görünen (yerelde doğrulandı, `data/test-hesaplari-plan.json`) |
|---|---|---|---|
| `e2e-free-fresh` | Ücretsiz | İlk ders açık, sayaçlar boş | Kapsül "Ücretsiz"; Kullanım limitleri'nde "İlk dersin: Açık" |
| `e2e-free-used` | Ücretsiz | İlk ders tamamlanmış; bugün 1/3 mesaj, 0/1 fotoğraf | "İlk dersin: Tamamlandı", mesaj 1/3 |
| `e2e-free-exhausted` | Ücretsiz | Bugün 3/3 mesaj, 1/1 fotoğraf | Mesaj 3/3, fotoğraf 1/1 |
| `e2e-plus` | Plus aylık | Dönem kotası %0 kullanılmış | "Plus plan", %0 kullanıldı |
| `e2e-plus-90` | Plus aylık | %90 | %90 kullanıldı |
| `e2e-plus-100` | Plus aylık | %100 | %100 kullanıldı |
| `e2e-week` | Sınav Haftası (`plus-haftalik`) | 3 gün kalmış | "Plus, 3 gün kaldı" |
| `e2e-sigma` | Sigma aylık | %0 | "Sigma plan" |
| `e2e-founder` | — | **Gerçek hesap yok** | Kurucu ekranları fikstürle: `/e2e/kurucu?ekran=krediler\|ayarlar\|pay`, `/e2e/ana-ekran?plan=kurucu`, `/e2e/profil?plan=kurucu` |

**e2e-founder neden yok:** kurucu yetkisi tek yoldan gelir: canlı `user_roles` tablosunda `role = 'founder'` satırı
(`supabase/migrations/20261106150000_founder_role.sql:20,31`; ortam değişkeni ya da e-posta izin listesi yok). Bu satır
yönetim panelini (PIN arkasında), fiyat ve özellik anahtarlarını ve **kredi sınırı olmayan** üretimi açar; test hesabının
parolası sızarsa gerçek model harcaması olur. Kurucu görünümü (`plan-identity.ts:36`) fikstürde aynı kodla çizilir.

Her hesabın bir hazırlığı var: **"E2E Hazırlık · TYT Matematik"**. Bu hazırlıkta 3 konu (Sayı Kümeleri, Üslü Sayılar, Köklü
Sayılar) ve 7 adım bulunur: her konu için ders ve konu testi, sonda yazılı deneme. Sınav tarihi her koşuda bugün + 45 gün.
Hazırlık ürünün kendi işleviyle (`create_exam_prep_graph`, tek işlem) açılır; model çağrısı yok.

## Yazılan tablo ve alanlar

| Tablo | Alanlar | Not |
|---|---|---|
| `auth.users` (yönetici API'si) | `email_confirm: true`, parola, `app_metadata {e2e, e2e_user}`, `user_metadata.full_name` | `createUser` / `updateUserById`; e-posta göndermez. Kimlik `admin_user_id_by_email` ile yalnız bu adres için sorulur |
| `profiles` | `full_name` ("E2E …"), `grade_level` "12", `primary_role` student, `study_reminder_email` **false**, `deleted_at` null, `onboarding_completed_at` (yalnız ilk koşuda) | |
| `email_events` | `once:welcome`, `once:referral_invite` (status `sent`) | Hoş geldin ve davet e-postası "gönderilmiş" sayılır |
| `weekly_surveys` | o haftanın `week_key`'i, `dismissed: true` | Haftalık anket kartı çıkmaz (görsel taban haftadan haftaya oynamasın) |
| `notifications`, `user_device_sessions` | **silinir** (her koşu) | Zildeki sayı 0 kalır; 2 cihaz sınırına takılmaz |
| `credit_wallets` | Ücretsiz: `balance 0`, `free_allowance_remaining 0`. Ücretli: `balance 0`, `free_allowance_remaining = hak × (1 − kullanım)`, `period_allowance` (`plans.monthly_allowance`: 7.200 / 2.700 / 60.000), `period_kind`, `period_ends_at` | |
| `subscriptions` | Ücretli: `plan_id` (slug'dan), `status active`, `billing_period`, `current_period_start/end` (aylık +30 gün; haftalık 3 gün − 1 dk), `trial_until null`, `auto_renew false`, `cancel_at_period_end false`, `renewal_reminder_sent_at` ve `expired_notified_at` = koşu anı. Ücretsiz: varsa `inactive` | İki işaret dolu olduğu için dönem sonu hatırlatması ve bitiş bildirimi gitmez |
| `free_usage` | Önce silinir; `e2e-free-used` için `chat 1`, `e2e-free-exhausted` için `chat 3` + `photo 1` (bugünün İstanbul günü) | |
| `exam_preps` (+ `study_plans`, `study_plan_tasks`, `exam_prep_topics`, `exam_prep_nodes`, `exam_prep_sessions`) | Yukarıdaki hazırlık; her koşuda `exam_date` ve adım durumları sıfırlanır (adımlar tür + başlıkla eşlenir, sayfanın eklediği adımlar kilitli), adımlar `session_meta {topicId, topicTitle}` ile konusuna bağlanır; `intro_deferred_at` dolu (seviye tespiti ertelenmiş) | `e2e-free-used`'da 1. ders `done`, konu testi `ready`; ötekilerde 1. ders `ready`. `intro_deferred_at` olmasa ilk ziyaretteki arka plan isteği onu kendiliğinden doldurur ve sayfa ilk ve ikinci ziyarette farklı görünür |
| `documents`, `document_pages`, depo (`documents/<kullanıcı>/<belge>/`) | Yalnız `e2e-plus`: "E2E Ders Notu.txt", tek sayfa (`/dokumanlar/:id` için) | `--remove` depo dosyasını da siler |
| `consent_records` | Giriş betiği, `auth.setup.ts` ile aynı yoldan yazar: `/api/consent/accept` okuma kanıtıyla | |

**Yazılmayanlar:**
- `payments`: ödeme kaydı yok, bu yüzden gelir ve "ilk kez ödeyen" sayıları etkilenmez.
- `user_roles`: kurucu ya da yönetici rolü yok.
- `email_preferences`: kampanya izni yok.
- `referred_by`: davet bağı yok.

## Sessiz hesap: otomatik işler

| İş | Neden göndermez |
|---|---|
| Akşam hatırlatması (`api/cron/study-reminders`) | `study_reminder_email = false`. Uygulama içi bildirim yine yazılır; betik her koşuda bildirimleri siler |
| Hoş geldin telafisi | `once:welcome` var |
| Davet ve davet hediyesi e-postası | Kampanya izni yok, anahtar kapalı, davet bağı yok; ayrıca `once:referral_invite` var |
| Plan bitiş hatırlatması ve bildirimi (`api/cron/subscription-renewal`) | `renewal_reminder_sent_at` ve `expired_notified_at` dolu |

**Ücretli çağrı yok:** görsel taban, denetim ve performans ölçümü sunucuyu `OPENAI_API_KEY`, SMTP ve Resend **boş**
başlatır (`tests/visual/visual.config.ts`, başlatma ayarı `cortex-plus-test-guvenli`, `scripts/perf-baseline.mjs`). Next
tanımlı bir değişkeni `.env.local` ile ezmez; OpenAI istemcisi boş anahtarla istek göndermeden hata verir. Hazırlık sayfası
açılınca sıradaki ders arka planda yazılmaya kalkar ve `no_api_key` ile düşer (ücret iade). 14 Kasım 2026'da 8 hesapta
`ai_usage_events` 0. **3005'teki geliştirme sunucusu gerçek anahtarla çalışır:** test hesaplarıyla hazırlık sayfasını ya da
ders düğümünü orada açmayın.

**Kabul edilen etki (A seçeneği):**
- **Yönetim sayıları:** kokpit, Kullanıcı Etkinlikleri, Kullanıcılar, beta ölçütleri, anket sonuçları ve günlük özet bu 8 hesabı sayar.
- **Ders hataları** (`/admin/ders-hatalari`, `lesson_generation_failures`): her görsel ya da denetim koşusu, test hesaplarının
  hazırlığı için birkaç `no_api_key` kaydı ekler.
- **Toplu hizmet duyurusu:** doğrulanmış herkese gider, yani bu 8 adrese de. Adresler teslim edilemez ve Resend'de geri dönme (bounce) olarak görünür. Duyuru göndermeden önce `--remove` ile hesaplar silinebilir, sonra yeniden açılır.

## Zamanla bayatlayan durumlar: testten önce yeniden çalıştırın

- `e2e-free-exhausted` ve `e2e-free-used` sayaçları gün değişince (İstanbul gece yarısı) sıfırlanır.
- `e2e-week` 24 saat sonra "2 gün kaldı" gösterir; 3 gün sonra dönem biter ve cron hesabı `inactive` yapar.
- Plus ve Sigma dönemleri 30 gün sonra biter.
- Yönetim panelinin elle açılması, öğrencinin "Hazırlığı sil"i ya da yeniden planlama hazırlığı değiştirebilir. Betik her koşuda hazırlığı aynı duruma döndürür.

```bash
npm run e2e:seed
```

```bash
npm run e2e:login
```

## Kullanım

| Komut | Ne yapar |
|---|---|
| `npm run e2e:seed` | 8 hesabı açar ya da günceller (idempotent: aynı koşu iki kez çalıştırıldı, satır çiftlenmedi) |
| `npm run e2e:seed -- --dry-run` | Yalnız ne yapacağını söyler |
| `npm run e2e:seed -- --only=e2e-plus,e2e-week` | Seçilen hesaplar |
| `npm run e2e:seed -- --remove` | Hesapları ve satırlarını siler (yukarıdaki tablolar + hesap silme işçisinin listesi), sonra `auth.users` kaydını; giriş dosyalarını ve yerel parolayı da siler. **Denendi** (14 Kasım 2026, `e2e-free-fresh`: silindi, yeniden açıldı) |
| `npm run e2e:login` | Her hesap için bir kez giriş yapar (varsayılan `http://127.0.0.1:3005`; başka adres için `E2E_BASE_URL`, dosyalar `tests/.auth/<host>/`) |
| `npm run design:measure` | 1.3 ölçümü (12 ekran × 768 ve 375, `e2e-plus`); `--plans` 8 hesabın planını denetler |

Yerel dosyalar (hepsi `/tests/.auth/` altında, `.gitignore`'da):
- `e2e-users.local.json`: adres ve parola; yalnız bu makinede.
- `e2e-state.json`: plan ve hazırlık kimliği; parola yok.
- `<ad>.json`: Playwright giriş durumu. Çerez tercihi ve ilk ziyaretteki "Seri" penceresinin görülmüş işareti de içinde; bu işaret olmazsa pencere her ölçümde sayfanın üstüne çıkıyordu.

Servis anahtarı yalnız `.env.local` dosyasındaki `SUPABASE_SECRET_KEY`'den okunur. Yoksa betik çalışmaz ve anahtarı ister.

## CI

GitHub sırrını ürün sahibi ekler. Öneri: tek sır `E2E_USERS_JSON` = yerel `tests/.auth/e2e-users.local.json` dosyasının
içeriği. İş akışı bunu dosyaya yazar ve CI'ın kendi sunucusuna karşı `npm run e2e:login` çalıştırır. Hesapları açmak
(`e2e:seed`) servis anahtarı ister, bu yüzden yalnız yerelde yapılır. Canlı duman testinin hesabı (`E2E_USER_*`) ayrıdır
ve değişmedi.

Bir hesapla en çok 2 cihaz açılabilir: yerel ve CI birlikte sığar. Üçüncü giriş en eskisini düşürür. Betik her koşuda
cihaz kayıtlarını siler.
