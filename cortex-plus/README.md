# Cortex Plus

AI destekli öğrenme platformu — Next.js App Router, Supabase, OpenAI.

## Geliştirme

```bash
cd cortex-plus
cp .env.example .env.local
npm install
npm run dev
```

## Supabase

```bash
npx supabase link
npx supabase migration list --linked
```

Migration dosyaları: `supabase/migrations/`

> **`db push` çalıştırmayın.** Uzak veritabanının migration geçmişi bu
> depodakiyle ayrışmış; şema panel üzerinden kurulmuş. Şema değişikliklerini
> Supabase SQL Editor’dan elle uygulayın ve dosyayı buraya kayıt için ekleyin.
> Ayrıntı: [deploy-checklist.md](docs/delivery/deploy-checklist.md#3-migrationlar)

## Test

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

## Dağıtım

- GitHub repo oluşturma ve Supabase proje oluşturma **onay** gerektirir.
- Production DNS (`cortexplus.app`) ve canlı PayTR **onay** gerektirir.

Ürün dokümantasyonu: `../docs/`
