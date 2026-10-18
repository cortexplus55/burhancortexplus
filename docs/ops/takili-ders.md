# Takılı ders / oturum

## Belirti
- Öğrenci "Ders hazırlanıyor…" ekranında bekliyor; sayfayı yenileyince aynı.
- "Ders oluşturulamadı" ya da bitişte "Bu bölüm hazırlanamadı: …" (eksik kavram).
- Test / podcast / sözlü "hazırlanıyor"da kalıyor.

## Bakılacak yer
- `/admin/ders-hatalari`: `lesson_generation_failures` — `kind` (ders, test, podcast…), `stage`, `reason`
  (`slow_generation`, `concept_dropped`, `source_unavailable`, …), `reasons` (denetçi itirazları).
- Vercel → Logs: `lesson_generation_failure` satırı (prepId, topicId, stage, reason).
- `exam_prep_generation_jobs`: `status` `creating` / `ready` / `failed` / `completed`; `creating`de 10 dk'dan
  eski kayıt takılı demektir. `exam_prep_node_attempts`: öğrencinin oturumu; `exam_prep_prefetch`: önceden
  yazılan içerik (`status`, `updated_at`).
- `credit_reservations`: aynı işin `pending` rezervasyonu duruyor mu (bkz. [yanlis-kredi.md](yanlis-kredi.md)).

## İşlem
1. **Kendi kendine toparlanır mı?** Yazım 120 sn ilerlemezse ders olduğu kadarıyla kapanır ve kredi iade
   edilir (`BUILD_STALE_MS`, `src/lib/learning/lesson-build.ts`). Öğrenciye: sayfayı yenile, "Farklı anlat"
   ya da "Dersi tekrarla".
2. **Kredi**: 10 dk'dan eski `pending` rezervasyon öğrencinin bir sonraki isteğinde ya da günlük cron'da
   kendiliğinden iade edilir (`refundStalePendingReservations`). İade görünmüyorsa `/admin/kullanicilar` →
   krediyi elle ekle, nedenini yaz.
3. **Hâlâ takılıysa** (yönetici düğmesi gelene kadar — plan 4.3): SQL ekranında yalnız o kaydı kapat:
   `exam_prep_generation_jobs` → `status = 'failed'`; `exam_prep_prefetch`'te aynı düğümün `building`
   satırını sil. Öğrenci yeniden açınca sıfırdan yazılır.
4. Aynı belgede her ders düşüyorsa **içerik sorunu**dur: `reasons` sütununu oku; kodla "onarma",
   istemi/denetçiyi düzelt (AGENTS.md "Öğretmen ders motoru"). Çekirdek sayfası bulunamayan belge
   `source_unavailable` verir, kredi düşmez.

## Önleme
- Haftada bir `/admin/ders-hatalari`: hedef atılan kavram 0, başarısız < %2 (plan 1.7).
- Önceden yazım açık kaldıkça öğrenci soğuk üretimi az görür; "Sıradaki" hazır değilse hazırlık sayfası
  açılışı tetikler (`requestPrepPrefetch`).
