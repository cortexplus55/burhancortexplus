# CLI bağlantıları — tek hedef

5 Eylül 2026'da canlı istemci paketi, Vercel production dağıtımı ve panel kimlikleriyle doğrulandı.

| Bileşen | Tek hedef |
|---|---|
| GitHub | `cortexplus55/burhancortexplus`, production dalı `main` |
| Vercel takım | `cortexplus55` / `team_7fZJmWjbQtKXSDwCZCA4s7Ym` |
| Vercel proje | `burhancortexplus-app` / `prj_fBxyWhMERs4pZUq9sJMaVa9Gt29A` |
| Root Directory | `cortex-plus` |
| Production domain | `https://cortexplus.app` |
| Supabase | `dgjfyewgrukglsehyntc` |

`burhancortexplus` GitHub reposunun adıdır; Vercel proje adı **`burhancortexplus-app`** olmalıdır. Eski Vercel `prj_xd0PYMnQZnaz0Ksh0ksqIR8a9NEm` hedefini kullanmayın.

## Oturum ve proje bağlantısı ayrı şeylerdir

Chrome'da doğru hesap açık olması, CLI veya Codex bağlayıcısının aynı hesapta olduğu anlamına gelmez. 5 Eylül incelemesinde Vercel bağlayıcısı yalnızca eski `burhan55600-5553s-projects` takımını gördü; doğru projeye erişimi 403 verdi. Supabase bağlayıcısı da yetki hatası verdi. İki doğru proje Chrome'dan erişilebilir durumdaydı.

Yerel `.vercel/project.json` yalnızca hedefi seçer; erişim yetkisi sağlamaz ve ortam değişkenlerini indirmez. Dosya yereldir; tekrar oluşturmak için aşağıdaki kurulum betiğini kullanın.

## Vercel

Doğru hesaba giriş ve hedef kontrolü:

```powershell
cd cortex-plus
npx vercel login
.\scripts\setup-vercel-link.ps1
```

Oturum doğru takımda doğrulanmadan CLI üzerinden deploy veya env değişikliği yapmayın. Normal yayın akışı, incelenmiş değişikliklerin `main` dalına gönderilmesidir. Diğer dallardaki Ready dağıtımları preview olabilir; canlı sitenin güncellendiğini göstermez.

[Production paneli](https://vercel.com/cortexplus55/burhancortexplus-app/deployments) üzerinde Current Domains içinde `cortexplus.app`, Source içinde beklenen commit ve `main` görünmelidir.

## Supabase

```powershell
cd cortex-plus
npx supabase login
npx supabase link --project-ref dgjfyewgrukglsehyntc
npx supabase migration list --linked
```

**Migration geçmişi hizalanana kadar `supabase db push` çalıştırmayın.** Repo dosyaları ve uzak migration kayıtları birebir eşleşmiyor. Kayıt yokluğu tek başına şema yokluğunu da kanıtlamaz; tablo, sütun ve fonksiyonlar ayrıca doğrulanmalıdır.

5 Eylül incelemesinde yereldeki abonelik değişikliklerinin beklediği `plans.billing_period`, `subscriptions.current_period_start` ve `abuse_events` canlı şemada yoktu. Kod yayınından önce ilgili değişikliklerin bütünü incelenmeli, şema uygulanmalı ve doğrulanmalıdır.

Supabase panelinde GitHub ve Vercel entegrasyonları bağlı görünmüyor. Uygulama doğru URL ve anahtarlarla çalışabiliyor. Migration geçmişi incelenmeden otomatik veritabanı dağıtımını açmayın.

## GitHub

```powershell
gh auth status
git remote -v
git ls-remote origin refs/heads/main
```

Beklenen hesap `cortexplus55`, repo `cortexplus55/burhancortexplus`. Git kimliği, CLI oturumu ve bağlayıcı oturumu ayrı ayrı doğrulanmalıdır.

## Kurulum ve kontrol

Repo kökünden `scripts/setup-cli.ps1` giriş/bağlama adımlarını çalıştırır. `scripts/verify-cli.ps1` yerel hedefleri denetler. Şema değişikliği veya production yayını yapmaz. Operasyon e-postası yalnızca `cortexplus@cortexplus.app`.

## 6 Eylül 2026 güncellemesi

İnceleme sırasında main b42230f'e ilerledi. abuse_events artık mevcut; abonelik sütunları hâlâ eksik. Güncel durum ve tamamlanmamış kapsam: [SYSTEM-AUDIT-2026-09-06.md](SYSTEM-AUDIT-2026-09-06.md). İlk gözlemdeki eksik tablo ve eski commit kayıtları tarihsel kanıttır.
