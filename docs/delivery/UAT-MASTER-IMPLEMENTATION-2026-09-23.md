# UAT kritik sistemler — 23 Eylül 2026

Durum: **UAT onayı verilmedi; uygulama ve doğrulama sürüyor.**
Başlangıç commit'i `cc95ee5`; önceki UAT değişikliği `cb96562` ayrıca incelendi.
Çalışılan tek repo cortexplus55/burhancortexplus, uygulama cortex-plus/,
canlı cortexplus.app, Supabase dgjfyewgrukglsehyntc.

## Mimari ve kabul haritası

Next.js App Router + React; Supabase Auth/Postgres/private Storage;
OpenAI chat/embeddings/vision/speech; PayTR iFrame; Vercel; Upstash limitler.
API giriş kapısı `src/lib/api/guards.ts`, oturum `src/lib/supabase/middleware.ts`.
Yönetim anahtarı yalnız sunucuda. Çoğu route service istemcisi kullandığından
sahiplik filtresi ve gerçek RLS testi ayrı gerekliliklerdir.

| No | Alan / mevcut kaynak | Bu turdaki durum / kalan kabul |
|---|---|---|
| 1 | billing/entitlements.ts; plans, subscriptions | Merkezi katman mevcut; bozuk dönem tarihi artık ücretli erişim açmıyor. Bütün tüketicilerin ve canlı bitiş/iptal geçişinin denetimi açık. |
| 2 | lib/format.ts; plans, payments | TRY utility mevcut; sağlayıcı fiyatı değiştirilmedi. Bütün ödeme yüzeylerinin görsel karşılaştırması açık. |
| 3 | credits/service.ts; credit_wallets/reservations/ledger | Karma bakiye, mükerrer rezervasyon, dönemler arası iade SQL düzeltmesi ve gerçek PostgreSQL testleri eklendi. İşlem sonucu yeniden oynatma ve yarım kalan işlemlerin uzlaştırılması açık. |
| 4 | documents/store-upload, rag/pipeline, processing_jobs | Eksik embedding artık başarılı işleme sayılmıyor. Tüm dosya türü/ilerleme/yeniden başlatma uçtan uca kontrolü açık. |
| 5 | document_pages/chunks/embeddings | Fiziksel sayfa okuyucu kullanıcı sahipliği ve silinmemiş belge kontrolü yapıyor. Sürüm/başlık metadata denetimi açık. |
| 6 | ai/chat, chat-source-block, quality-gate | Retrieval arızası artık “belgede yok” diye sunulmuyor; doğrulayıcı arızası kapalı başarısız. Bağımsız answerability/iddia-kaynak kontrolü açık. |
| 7 | chat-source-block | Belgeden/genel bilgiden talimatı mevcut; yanıt düzeyinde ayrıştırma denetimi açık. |
| 8 | chat-panel; document viewer | Sayfa metadata mevcut. Tıklanabilir, kaydedilmiş, sunucuda doğrulanmış citation sözleşmesi açık. |
| 9 | documents/[id] DELETE | Soft delete mevcut; storage hata sonrası yeniden deneme ve belgeye bağlı türetilmiş içerik temizliği açık. |
| 10 | RLS + service role sorguları | Silinen hesaplar için API engeli ve RLS restrictive policy hazır. Canlı iki kullanıcı izolasyon matrisi henüz çalıştırılmadı. |
| 11 | ai/chat; chat-panel | Yanıt kaydı kontrol edilmeden başarılı içerik gösterilmiyor. Öğretmen davranışları/stop/retry/token sınırı tam UAT bekliyor. |
| 12 | quality-gate; validation-pipeline | Podcast'te anlamsal reddi yalnız biçim testleriyle geçirme yolu kapatıldı; negatif test eklendi. Tüm dersler için sağlayıcılı değerlendirme açık. |
| 13 | Supabase middleware, auth routes | Silinen profil tekrar uygulamaya giremez. Kayıt/reset/expired token UAT açık. |
| 14 | onboarding, learning_goals | Önceki commit kalıcılık eklemiş; sunucu tarih/plan yeniden hesaplama kabul testi açık. |
| 15 | exam-prep/node; attempt-lifecycle | started_at/expires_at canlı kolonları doğrulandı. Geç teslim, ağ kesilmesi, sürüm çakışması matrisi açık. |
| 16 | chat, studio, exam components | Mevcut tasarım korunuyor; 360/375/390/430/tablet ve klavye testleri açık. |
| 17 | async kullanıcı durumları | Eksik podcast “hazır” kabul edilmiyor; hesap silmede pending/completed ayrıldı. Tüm ekran matrisi açık. |
| 18 | privacy/account-deletion; data_deletion_requests | Hata yutan silme zinciri kontrol edilen adımlara dönüştürüldü; finansal kayıtları düşüren auth hard-delete kaldırıldı. Kuyruk sıralaması gerçek requested_at kolonuna düzeltildi. RLS migration canlı doğrulaması açık. |
| 19 | Sentry, usage/validation/abuse events | Kredi settlement hataları içerik/token yazmadan görünür. Alarm ve log kişisel veri taraması açık. |
| 20 | Vitest, Playwright, PGlite | Başlangıç 97 dosya/1.032 test; yeni olumsuz senaryolar ekleniyor. Tam son koşum sonuçları aşağıya işlenecek. |
| 21 | teslim kapısı | Tamamlandı iddiası yok. Kod/test/build/canlı ayrı raporlanır. |

## Somut düzeltmeler

- Podcast: 60 satır kesmesi kaldırıldı; 112 satır destekleniyor. Sunucuda en
  fazla sekiz paralel TTS isteği, bütün ses için tek rezervasyon. Geç parçanın
  ağ hatası tüm ses rezervasyonunu iade ediyor. İki oynatıcı tam satır, metin,
  konuşmacı, bölüm, süre ve URL kontrolü yapıyor. Konu değişince eski ses duruyor.
- Podcast doğrulaması: bağımsız biçim kontrolü anlamsal reddi geçersiz kılamaz.
  Doğrulama kaynağı dersin kendi içeriğidir. Genel garanti yerine ölçülen test var.
- Kredi: iki bakiye birlikte harcanabilir; önceden düşülmüş rezervasyon tekrar
  düşülmez. Cüzdan kilidinden sonra idempotency tekrar kontrol edilir. İade aynı
  ücretsiz hak dönemine döner; yeni dönemi şişirmez. Ledger önce/sonra ve iki
  bakiye hareketini ayırır. İşlevlerin istemci rolleri için çağrı yetkisi yoktur.
- Silme: hiçbir sorgu/storage/auth hatası tamamlanma sayılmaz. Belgeler sayfalı
  temizlenir, soft-deleted belgeler de kapsanır; auth soft-delete finansal anahtarı
  korur. Bekleyen talepler gerçek requested_at ile okunur, istemciye beklemede
  durumu açıkça döner. Gerçek kullanıcı hesabı silinerek test yapılmadı.

## Migration / dış servis durumu

- `20260923120001_uat_credit_atomicity.sql` ve
  `20260923120002_uat_deleted_account_barrier.sql` CLI ile oluşturuldu. Önceki
  migration ileri saatli olduğundan dosyalar onun arkasına sıralandı.
- Bu yeni migration'lar **henüz canlıya uygulanmadı**. MCP permission reddi,
  CLI Unauthorized ve in-app Supabase giriş ekranı görüldü; yanlış hesaba veya
  emekli projeye geçilmedi. `db push` ile geçmiş zorlanmadı.
- Canlı read-only REST kontrolünde free_spent, started_at, expires_at,
  profiles.deleted_at ve documents.deleted_at alanları var.
- PayTR otomatik yenileme bilerek kapalı: yazılı sağlayıcı cevabı ve mevcut
  karar bekleniyor. Sağlayıcı fiyatları, kişisel satıcı bilgisi tercihleri,
  emekli paneller ve /lab değiştirilmedi.
- Supabase auth soft-delete referansı:
  https://supabase.com/docs/reference/javascript/auth-admin-deleteuser

## Doğrulama kaydı

- İlk podcast/entitlement grubu: 47 test geçti.
- PostgreSQL kredi işlevleri: 10 test geçti. PGlite tek bağlantılı olduğundan
  gerçek iki bağlantılı kilit yarışı ayrıca canlı olmayan Postgres üzerinde sınanmalı.
- İlk tam koşum: 1.056 geçti, 7 eski route fixture'ı yeni sahiplik sorgusunu
  modellemediği için düştü; fixture güncellendi, yeniden koşum bekliyor.
- Başlangıç lint/typecheck temiz. Son değişiklikler için yeniden koşum gerekiyor.
