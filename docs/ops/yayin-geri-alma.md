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
   Önce C'ye bakın: davranışı değiştiren bir göç uygulanmışsa eski kod onunla çalışmayabilir.
B. **Kalıcı:** `git revert -m 1 <merge sha>` → PR → main. Yayın otomatik çıkar; çıktığını A'daki yerden
   doğrula. Düzeltme hazır olunca revert'in revert'i değil, düzeltilmiş yeni PR.
C. **Göçler geri alınmaz:** yeni tablo/sütun/fonksiyon ekleyen göçler kod geri alınınca boş durur. Yıkıcı
   SQL ürün sahibinde. **İstisna, kredi v3 (24 Ekim 2026):** `20261024120000` (fiyatlar) ve
   `20261024123000` (ücretsiz günlük kredi 0) var olan `credit_rules` satırlarını ve `credit_reserve`'ü
   değiştiriyor. Bu ikisi canlıdayken kod v3 öncesine geri alınacaksa **önce**
   `cortex-plus/supabase/rollback/20261024_kredi_v3_geri_al.sql` SQL ekranında tek çalıştırmada, **sonra**
   A ya da B. Dosyasız geri alınan eski kod `credit_reserve`'ü doğrudan çağırır; v3 fiyatı (ders 30) ve 0
   günlük krediyle ücretsiz öğrenci hiçbir ders ya da test açamaz. Dosya hiçbir şey silmez (v2 fiyatları,
   v2 `credit_reserve`, günlük 6, eski varsayılanlar); sayaç tablosu ve `credit_reserve_metered` kalır, yeni
   kod da onunla çalışır. Yalnız `20261024121000` uygulanmışsa (kod yayından önceki adım) dosya gerekmez:
   o göç yalnız ekleme. Kabul edilen boşluk: (c) ile geri alma arasında yenilenen abone dönemi davet
   çarpansız kalır, çarpan sonraki yenilemede döner (24 Ekim 2026'da etkin ücretli abonelik yoktu). v3'e
   dönerken (c) yeniden çalışır; kayıt satırları zaten var, insert'ler `on conflict (version) do nothing`
   ile yazılır (düz insert duplicate key ile düşer, iki göç de uygulanmaz). Sıra, kayıt satırları ve
   ayrıntı: `docs/delivery/KREDI-SISTEMI.md` "Canlıya geçiş sırası".
D. Yayın hiç çıkmıyorsa: `vercel.json` — en fazla 2 cron, dakika/saat sabit rakam; bölge yalnız `fra1`
   (`uat-gate-guards.test.ts`). Düzeltip tekrar push.

## Önleme
- Suspense sınırı / `loading.tsx` ekleme (sayfa boş kalır, derleme ve testler yakalamaz — AGENTS.md).
- Her yayından sonra ilgili sayfayı canlıda aç; öğrenci akışına dokunan değişiklikte telefon boyutunda da
  (`mobile-audit-guards.test.ts`, 390 px e2e).
- Bekçi testleri koru: `npx vitest run --exclude "tests/unit/_tmp/**"` yeşil olmadan merge yok.
