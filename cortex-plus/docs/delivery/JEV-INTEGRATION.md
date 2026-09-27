# Jev karar motoru — entegrasyon rehberi

**Durum:** istemci resmi TypeSafe SystemOne API’sine hizalandı. Canlı doğrulama anahtar eklenince yapılacak.

## Mimari akış

```
/api/adaptive/session/{start|next|evidence}
  → learning-governor#nextAction
  → buildDecisionState (CompactDecisionState)
  → decideNextActions
       ├─ tryDeterministicFastPath?
       ├─ shouldAttemptJev? (env + flag + credential + circuit + allowed≥2)
       ├─ Aşama 1 gölge: OpenAI karar → after() ile Jev audit
       ├─ Aşama 2: Jev birincil → düşük güven → OpenAI → deterministik
       └─ audit → adaptive_jev_decisions.usage (jsonb)
```

Öğrenciye model/sağlayıcı sızdırılmaz (`toStudentActionPayload`).

## İki erişim yolu

| Yol | Base URL | Varsayılan model | Kimlik |
|---|---|---|---|
| `typesafe` | `https://api.typesafe.ai` | `jev-1.13.0` (pinned) | `TYPESAFE_API_KEY` |
| `gateway` | `https://ai-gateway.vercel.sh/typesafe` | `typesafe-ai/jev` | `AI_GATEWAY_API_KEY` veya Vercel OIDC |

`JEV_ACCESS=auto` sırası: TypeSafe anahtarı → Gateway anahtarı → OIDC (istek anında `@vercel/oidc`).

Gateway yolunda `providerOptions.gateway.zeroDataRetention: true` gönderilir. Doğrudan TypeSafe’e ekstra alan gitmez.

## Ortam değişkenleri (hepsi server-only)

| Değişken | Varsayılan | Not |
|---|---|---|
| `JEV_ENABLED` | false (explicit opt-in) | `true/1/yes/on` |
| `JEV_SHADOW_MODE` | false | Gölge aşaması |
| `JEV_ACCESS` | auto | typesafe \| gateway \| auto |
| `TYPESAFE_API_KEY` | — | Doğrudan TypeSafe |
| `AI_GATEWAY_API_KEY` | — | Vercel AI Gateway |
| `JEV_BASE_URL` | — | Override (test/proxy) |
| `JEV_MODEL` | erişime göre | Pin önerilir |
| `JEV_TIMEOUT_MS` | 2000 | Retry dahil bütçe |
| `JEV_MIN_CONFIDENCE` | 0.45 | Altında OpenAI’ye geç |
| `JEV_FALLBACK_ENABLED` | true | Gerçek arızada OpenAI |
| `DECISION_PROVIDER` | auto | openai → Jev hiç çağrılmaz |

## Soru seti ve eşikler

Modül: `src/lib/adaptive/jev/questions.ts` · `JEV_QUESTION_SET_VERSION` (audit’e yazılır).

| Soru | Tip | Not |
|---|---|---|
| `next_action` | choice | `allowed_actions` criteria; &lt;2 ise Jev çağrılmaz |
| `teaching_mode` | choice | 8 mod |
| `difficulty` | choice | 5 seviye (score yerine — enum sınır belirsizliği yok) |
| `misconception_severity` | score | 4 seviye; `Math.round` → 0–3 |
| `needs_*` / `ready_to_advance` | noul | |

Noul eşikleri: varsayılan **0.5**; `ready_to_advance` **0.7** (muhafazakâr). Politika korkulukları (`applyPolicyToDecision`) son sözü söyler.

Talimatlar İngilizce (Jev birincil dili). Konu/ders adına özel kural yok.

## Rollout aşamaları

0. Merge sonrası varsayılan: `JEV_ENABLED` kapalı → OpenAI birincil.
1. Gölge: `JEV_ENABLED=true` + `JEV_SHADOW_MODE=true` + kimlik + `jev_enabled` pilotu → öğrenci OpenAI görür; Jev `after()` ile audit `usage.jev_shadow`.
2. Pilot birincil: shadow kapalı → Jev birincil; düşük güven / arıza → OpenAI → deterministik.
3. Genişletme: yalnızca pilot UUID ekleyerek. Global `jev_enabled` açmak için `/admin/feature-flags` uyarılıdır; bu iş global açmaz.

Geri alma: `JEV_ENABLED=false` veya pilot listesinden çıkar → anında OpenAI.

## Admin ekranı (`/admin/adaptive`)

- Decision engine kartı: erişim, model, kimlik boolean, bayraklar, timeout, min confidence, circuit (instance-başına).
- “Jev bağlantısını test et” / “Modelleri listele” — gerçek API; anahtar gösterilmez.
- Pilot UUID ekle/çıkar / “Beni ekle” — satır yoksa oluşturmaz.
- Kullanıcı detayı: Jev p50/p95, OpenAI p50/p95, maliyet, düşük güven sayısı, gölge uyum, son 20 gölge karşılaştırması.

## Canlı test

```bash
# bash
RUN_JEV_LIVE=1 npm run test:jev-live
```

```powershell
# PowerShell
$env:RUN_JEV_LIVE='1'; npm run test:jev-live
```

`TYPESAFE_API_KEY` veya `AI_GATEWAY_API_KEY` + `RUN_JEV_LIVE=1` gerekir. CI’da anahtar yok → suite skip.

## Maliyet

Jev: **$0.042 / 1M input token**, output ücretsiz. Tipik karar ~500–1.500 input → yaklaşık **$0.00002–0.00006**. Gateway `provider_metadata.gateway.cost` varsa o esas alınır. Öğrenciden kredi düşülmez (`ADAPTIVE_JEV` telemetry).

## Bilinen sınırlamalar

- Circuit breaker **instance-başına** (Vercel in-memory); instance’lar paylaşmaz.
- Jev birincil dili İngilizce; talimatlar EN.
- Alias’lar (`jev-latest`) kayabilir → varsayılan **pinned** `jev-1.13.0`.
- 422 / 401 / 402 / 403 tekrar denenmez; circuit uzun açılır.
- Yeni migration gerekmedi; audit alanları mevcut `usage` jsonb’de.
