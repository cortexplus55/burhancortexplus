# Yerel envanter — Cortex Plus

Tarih: 2026-09-11. Bu dosya "bizde yok" diyen her satırın karşısına konur.

## Sayfalar (91)
```
/
/admin
/admin/ai-kullanimi
/admin/audit-log
/admin/feature-flags
/admin/kotuye-kullanim
/admin/kredi-kurallari
/admin/kullanicilar
/admin/maliyetler
/admin/odemeler
/admin/ogretmen-basvurulari
/admin/paketler
/admin/promosyonlar
/admin/promptlar
/admin/sistem
/admin/yanit-oylari
/araclar
/araclar/[id]
/auth/auth-code-error
/ayarlar
/bildirimler
/calisma-plani
/dashboard
/davet
/deneme-sinavlari
/deneme-sinavlari/[prepId]
/deneme-sinavlari/[prepId]/calis
/deneme-sinavlari/[prepId]/degerlendirme
/deneme-sinavlari/[prepId]/deneme/[examId]
/deneme-sinavlari/[prepId]/deneme/[examId]/incele
/deneme-sinavlari/[prepId]/ders/[lessonId]
/deneme-sinavlari/[prepId]/dugum/[nodeId]
/deneme-sinavlari/[prepId]/konu
/deneme-sinavlari/[prepId]/sohbet
/deneme-sinavlari/[prepId]/sonuc
/deneme-sinavlari/[prepId]/tanisma
/deneme-sinavlari/[prepId]/tekrarlar
/deneme-sinavlari/olustur
/destek
/dokumanlar
/dokumanlar/[documentId]
/email-dogrula
/fiyatlandirma
/flashcardlar
/giris
/gizlilik
/gunluk
/hakkimizda
/ilerleme
/iletisim
/kayit
/kayit/tamamla
/krediler
/kullanim-kosullari
/kvkk
/limitler
/mobil-uygulama
/odeme/basarili
/odeme/basarisiz
/odemeler
/ogretmen
/ogretmenler-ve-profesorler-icin
/onboarding
/ornek
/ozellikler
/paketler
/pay
/profil
/profil/duzenle
/quizler
/sifre-yenile
/sifremi-unuttum
/sinav-hazirligi
/sinav-hazirligi/app
/siniflar
/siniflar/[id]
/sohbetler
/soru-coz
/studio/anlat
/studio/dogru-yanlis
/studio/flashcard
/studio/podcast
/studio/quiz
/studio/sozlu
/studio/yazili
/takvimim
/uygulamalar
/yanlislarim
/yaratici-program
/yardim
/yukle/[token]
```

## API uçları (60)
```
/api/ai/chat
/api/ai/chat/feedback
/api/ai/solve-image
/api/auth/signout
/api/calendar
/api/cron/study-reminders
/api/cron/subscription-renewal
/api/documents
/api/documents/[documentId]/topic-map
/api/documents/process
/api/documents/upload
/api/health
/api/learning/exam-prep/coach
/api/learning/exam-prep/create
/api/learning/exam-prep/feedback
/api/learning/exam-prep/goal
/api/learning/exam-prep/intake
/api/learning/exam-prep/intro
/api/learning/exam-prep/lesson
/api/learning/exam-prep/lesson-podcast
/api/learning/exam-prep/mock-exam
/api/learning/exam-prep/node
/api/learning/exam-prep/reschedule
/api/learning/exam-prep/select-topic
/api/learning/exam-prep/settings
/api/learning/exam-prep/topic
/api/learning/exam-prep/voice
/api/learning/exam/generate
/api/learning/exam/grade
/api/learning/exam/review-like
/api/learning/explain
/api/learning/flashcards/generate
/api/learning/mistakes/review
/api/learning/oral/generate
/api/learning/oral/grade
/api/learning/oral/transcribe
/api/learning/podcast/audio
/api/learning/podcast/generate
/api/learning/quiz/generate
/api/learning/speech
/api/learning/study-plan/generate
/api/learning/true-false/generate
/api/payments/paytr/callback
/api/payments/paytr/create-token
/api/payments/subscription
/api/profile/me
/api/profile/study-reminder
/api/school
/api/schools/search
/api/streak
/api/student/classroom-post
/api/student/classroom-share-prep
/api/student/create-class
/api/student/join-class
/api/support
/api/uploads/phone-session
/api/uploads/phone-session/[token]
/api/uploads/phone/[token]
```

## Bugün premium'a bağlı olanlar (koddan)

`isPremium` okuyan 25 API ucu var. Premium OLMADAN tamamen kapalı olanlar (402 premium_required):

- /api/learning/exam-prep/lesson-podcast
- /api/learning/exam-prep/node
- /api/learning/oral/transcribe
- /api/learning/podcast/audio
- /api/learning/speech

Geri kalanında premium bir KAPI değil, bir KALİTE farkı: `model-router.ts` premium kullanıcıya
gelişmiş modeli veriyor, ücretsiz kullanıcı standart modeli alıyor. Yani ücretsiz kullanıcı aynı
işi yapabiliyor, daha zayıf modelle.

## Limit modeli — bizde kredi, Astra'da günlük hak

- `credit_rules` tablosu işlem başına kredi düşürüyor (`src/lib/credits/service.ts`).
- Kredi biterse 402 `insufficient_credits`.
- GÜNLÜK sıfırlanan bir hak kavramı YOK. `src/lib/credits/period.ts` abonelik dönemine bakıyor.

## Misafir (çıkış yapmış) ne görüyor

- `src/middleware.ts` bütün yolları Supabase oturum tazelemesinden geçiriyor.
- Pazarlama sayfaları herkese açık: /, /ozellikler, /fiyatlandirma, /yardim, /sinav-hazirligi,
  /mobil-uygulama, /yaratici-program, /ornek, /gizlilik, /kvkk, /kullanim-kosullari, /iletisim, /hakkimizda
- Uygulama sayfaları oturum istiyor; misafir /giris'e düşüyor.
- Misafirin ÜRÜNÜ DENEYEBİLECEĞİ bir yol yok (anonim oturum kavramı yok).
