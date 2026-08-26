# www.cortexplus.app — Squarespace DNS

**Durum:** `cortexplus.app` nameserver’ları Squarespace (`*.squarespacedns.com`). **`www` kaydı yok** (NXDOMAIN). Vercel’de `www` → **308** → `cortexplus.app` yönlendirmesi ayarlandı; DNS kaydı eklenince çalışır.

## Squarespace’te yapılacak

1. [Squarespace Domains](https://account.squarespace.com/domains) → **cortexplus.app** → DNS.
2. **Custom records** → **Add record**:
   - **Host:** `www`
   - **Type:** `CNAME`
   - **Data / Points to:** `30e3ed639132fa83.vercel-dns-017.com`
   - TTL: default
3. Kaydet; yayılım 5–60 dk (bazen 24 sa).

## Vercel (yapıldı)

Project **burhancortexplus-app** → Settings → Domains → **www.cortexplus.app** → **Redirect to Another Domain** → **cortexplus.app** (308 Permanent).

## Doğrulama

```bash
curl -sI https://www.cortexplus.app/ | findstr /i "HTTP Location"
```

Beklenen: `308` veya `301` ve `Location: https://cortexplus.app/`
