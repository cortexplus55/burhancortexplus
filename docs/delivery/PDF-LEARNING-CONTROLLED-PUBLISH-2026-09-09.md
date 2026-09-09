# PDF öğrenme v2 — kontrollü yayın (9 Eylül 2026)

Amaç: Aşama 1–10 sonrası `pdf_learning_v2` bayrağını production’da açmak; yedek durumunu kaydetmek; smoke + rollback + 24–48s izleme notu.

**Hedefler:** GitHub `cortexplus55/burhancortexplus` · Vercel `burhancortexplus-app` → `cortexplus.app` · Supabase `dgjfyewgrukglsehyntc` · ops `cortexplus@cortexplus.app`.

---

## Özet

| Madde | Durum |
|---|---|
| Production Ready SHA | **`320ad30`** (Stage 10 kodu `a4caed6` + Stage 10 docs; redeploy gerekmedi) |
| `pdf_learning_v2` | **ON** (smoke PASS sonrası bırakıldı) |
| `enabled_at` (UTC) | **2026-09-09 14:51:34** |
| Supabase daily backup / PITR | **Blocked** — org plan **Free** |
| Kill-switch | Tercih edilen geri dönüş (deploy rollback’ten önce) |

---

## Part A — Yedek doğrulama

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| Proje | `dgjfyewgrukglsehyntc` · Cortex Plus · `ACTIVE_HEALTHY` · `eu-central-1` · PG 17 | Supabase MCP `get_project` |
| Org plan | **`free`** (`jyyksppawhechqznqjcg` / cortexplus55's Org) | MCP `get_organization` |
| Daily backups | **Yok / açılamaz** | [Supabase Backups](https://supabase.com/docs/guides/platform/backups): günlük yedek yalnızca Pro / Team / Enterprise |
| PITR | **Yok / açılamaz** | PITR Pro+ add-on (+ Small compute); Free’de yok |
| MCP ile enable | **Mümkün değil** | Backup/PITR toggle tool yok; plan yükseltmesi gerekir |
| Risk notu | Kontrollü yayın **bilinçli risk** ile yapıldı (additive şema + bayrak kill-switch; veri dönüştüren migration yok) | Stage 1/10 borç kaydı |

### Yedeği açmak için (ödeme kararı — kullanıcıya)

1. [Supabase Dashboard](https://supabase.com/dashboard/project/dgjfyewgrukglsehyntc) → Organization → **Upgrade to Pro** (~$25/ay + compute).
2. Pro sonrası: **Database → Backups** otomatik günlük yedek (Pro: 7 gün).
3. İsteğe bağlı: **Settings → Add-ons → PITR** (7/14/28 gün; ek ücret, Spend Cap dışı).
4. Free iken geçici: `supabase db dump` / off-site export (otomasyon değil; manuel).

Bu turda ödeme onayı istenmedi; yayın bayrakla sürdürüldü.

---

## Part B — Kontrollü yayın

### 1. Production deploy

| Deploy | SHA | Not |
|---|---|---|
| **Current Ready** | `320ad30` | `docs: record Stage 10…` · `dpl_7MsJKdZLZXfKg3nDyYfKWYUkCToE` · rollback candidate |
| Stage 10 kod Ready | `a4caed6` | `test: Stage 10 PDF learning…` · `dpl_7tsbCaSoUMgQ9MYn69YyEJqbAxEU` · rollback candidate |
| GH Production deployment | `320ad30` @ 2026-09-09T04:38:03Z | `gh api .../deployments` |

`a4caed6...320ad30` = 1 docs commit ahead; Stage 10 runtime `320ad30` içinde. Yeni redeploy yapılmadı.

### 2. Bayrak

```sql
-- enable (uygulandı)
update public.feature_flags
set enabled = true, updated_at = now()
where key = 'pdf_learning_v2';
```

Doğrulama: `enabled=true`, `updated_at=2026-09-09 14:51:34.180571+00`.

Admin UI: `/admin/feature-flags` → `pdf_learning_v2` kapat.

### 3. Browser smoke (öğrenci oturumu)

Hesap: öğrenci test hesabı (şifre commit edilmez). URL: `https://cortexplus.app`.

| Senaryo | Sonuç | Kanıt |
|---|---|---|
| `/dokumanlar` Konu haritası CTA | **PASS** | `trigonometri_20…` · “Harita hazır” · linkler görünür |
| Konu haritası sayfası | **PASS** | `/dokumanlar/71cd76fd-…` · “PDF öğrenme v2” · 20/20 kapsam · 7 konu |
| Prep yolu (mevcut) | **PASS** | `/deneme-sinavlari/e6bfcc0f-…` Stage4 Trigonometri Plan |
| Üç metre | **PASS** | Program / konu ölçümü / hazırlık (anti-%100 metin) |
| Bugünün yolu | **PASS** | “Bugünün yolu” + günlük etkinlik listesi |
| Ana rotalar boş/500 yok | **PASS** | `/dokumanlar`, konu haritası, prep, `/ogretmen`, `/araclar` |
| Gmail yeni Vercel/CI fail (flag sonrası) | **Yok** | Son fail’ler Stage 7/8 (`900a8b3` / `da0e167`) — eski |

### 4. İzleme okunabilirliği

| Kaynak | Durum |
|---|---|
| `feature_flags.pdf_learning_v2` | SELECT okunur (public read policy) |
| `ai_validation_events` | Tablo var; satır sayısı düşük (2) — Stage 7 metrik yolu canlı |
| Admin | `/admin/feature-flags` kill-switch |

---

## Kill-switch / rollback

**1) Tercih — bayrağı kapat (anında legacy UI):**

```sql
update public.feature_flags
set enabled = false, updated_at = now()
where key = 'pdf_learning_v2';
```

veya `/admin/feature-flags`.

**2) Deploy rollback (kod sorunuysa):** panelden önceki Ready  
`https://vercel.com/cortexplus55/burhancortexplus-app/7tsbCaSoUMgQ9MYn69YyEJqbAxEU` (`a4caed6`)  
veya Current docs deploy `…/7MsJKdZLZXfKg3nDyYfKWYUkCToE` (`320ad30`).

---

## Part C — 24–48 saat ne izlenir

1. **Bayrak hâlâ ON mı?** — beklenmeyen OFF / admin audit.
2. **Vercel runtime** — `/deneme-sinavlari/*`, `/dokumanlar/*`, `/api/learning/*` 5xx artışı.
3. **Gmail** (`cortexplus@cortexplus.app`) — yeni “Production deployment failed” / CI fail.
4. **`ai_validation_events`** — `fail` / fail-closed oran artışı; boş ders/quiz spike.
5. **Öğrenci şikâyeti sinyalleri** — boş sayfa, “Konu haritası” yok (bayrak cache?), kilitli günlük yol.
6. **Yedek borcu** — Pro’ya geçmeden veri dönüştüren migration **yapma**.

Bilinçli limitler (değişmedi): OCR/vision yok; tek `document_id` / prep; Free’de otomatik DB yedek yok.

---

## Karar

Smoke **PASS** → bayrak **ON bırakıldı**. Yedek **blocked (Free)** risk notuyla kayda geçti; ödeme kararı kullanıcıya bırakıldı.
