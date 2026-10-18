# Yayını geri alma

## Belirti
- Yayından sonra bir sayfa boş açılıyor ya da hata veriyor; Sentry'de yeni hata dalgası; öğrenciler
  `/destek`ten yazıyor.
- Ya da tersi: push edildi ama **yayın hiç çıkmadı** (GitHub commit statüsünde Vercel "failure"/"pending").

## Bakılacak yer
- Vercel → `burhancortexplus-app` → Deployments: Production sütunu, en üstteki "Ready" mi, "Error" mu,
  "Queued" mu. Hobby planda yayınlar sırayla çıkar; üç merge arka arkaya 10-15 dk sürebilir.
- GitHub: `gh api repos/cortexplus55/burhancortexplus/commits/<sha>/status` — `Vercel` statüsü
  `failure` ise `target_url`'i aç (23 Eylül 2026: cron kotası aşımı yayını hiç oluşturmadı).
- Canlıda gözle gör: `curl -I https://cortexplus.app/<sayfa>` ve tarayıcıda açılış. "Yazıldı" yayında
  olmak değildir.

## İşlem
A. **En hızlısı (dakikalar):** Vercel → Deployments → önceki "Ready" Production sürümü → ⋯ →
   **Instant Rollback** (ya da "Promote to Production"). Kod değişmez, trafik eski sürüme döner.
B. **Kalıcı:** `git revert -m 1 <merge sha>` → PR → main. Yayın otomatik çıkar; çıktığını A'daki yerden
   doğrula. Düzeltme hazır olunca revert'in revert'i değil, düzeltilmiş yeni PR.
C. **Göçler geri alınmaz:** bütün göçler additive; kod geri alınınca yeni tablo/sütun boş durur. Yıkıcı
   SQL ürün sahibinde.
D. Yayın hiç çıkmıyorsa: `vercel.json` — en fazla 2 cron, dakika/saat sabit rakam; bölge yalnız `fra1`
   (`uat-gate-guards.test.ts`). Düzeltip tekrar push.

## Önleme
- Suspense sınırı / `loading.tsx` ekleme (sayfa boş kalır, derleme ve testler yakalamaz — AGENTS.md).
- Her yayından sonra ilgili sayfayı canlıda aç; öğrenci akışına dokunan değişiklikte telefon boyutunda da
  (`mobile-audit-guards.test.ts`, 390 px e2e).
- Bekçi testleri koru: `npx vitest run --exclude "tests/unit/_tmp/**"` yeşil olmadan merge yok.
