# Faz B — Ücretsiz kullanıcı (Cortex Plus eşlemesi)

**Astra kaynağı:** `parity-audit-plan.md` §5  
**Yöntem:** Astra **free oturum** (2025-08-26) + Cortex route eşlemesi.

## Route haritası (Free)

| Astra (tipik) | Cortex Plus | Durum |
|---------------|-------------|--------|
| Onboarding adımları | `/kayit` sihirbaz + `/onboarding` (legacy öğrenci) | matched |
| Ana hub / Sor | `/ogretmen` (Astra chrome) | matched |
| Sohbet geçmişi | `/sohbetler` | matched |
| Fotoğraf soru | `/soru-coz`, composer kamera/upload | matched |
| Doküman | `/dokumanlar` + RAG checkbox | matched |
| Quiz / flashcard / deneme | `/quizler`, `/flashcardlar`, `/deneme-sinavlari` | matched |
| Uygulamalar / lab | Menü → **Öğrenme uygulamaları** → `/lab` | matched (`/uygulamalar`, `/uygulamalar/lab/*`) |
| Sınav hazırlığı | `/exam-preps` + okul kapısı | matched (`/deneme-sinavlari`, okul arama) |
| Profil / ayarlar | `/profil`, `/ayarlar` | matched |
| Bildirimler | `/bildirimler` | matched |
| Kredi / Plus | Header **Satın al**, Plus banner | matched (`/paketler`) |
| Veli (free parent) | `/veli`, `/veli/sor`, `/veli/plus` | matched |
| Öğretmen paneli | Bottom tab **Öğretmenler için** (free nav) | partial (Cortex ayrı rol akışı) |

### Free vs Plus nav farkı

| | Free | Plus (önceki crawl) |
|---|------|---------------------|
| Alt nav 3. tab | Öğretmenler için | Uygulamalar |
| Lab erişimi | Menü → Öğrenme uygulamaları | Tab Uygulamalar + `/lab` |

## Paywall (free)

| Tetikleyici | Cortex davranışı |
|-------------|------------------|
| Yetersiz kredi (402) | `UpgradeSheet` + `returnPath` |
| Gelişmiş model | `AI_CHAT_ADVANCED` + premium gate |
| Plus CTA | `/paketler`, `/fiyatlandirma` (guest) |

## Kanıt dosyaları

- `evidence/phase-b/astra-free-interactions.jsonl` — Astra free tıklama/gözlem
- `evidence/phase-b/astra-free-session.json` — oturum özeti
- `evidence/phase-b/astra-lab-grid.json` — lab katalog sayımı
- `evidence/phase-b/cortex-free-interactions.jsonl` — Cortex UI
- Playwright: `tests/e2e/*` (38 test)

## Astra B crawl durumu

**Tamamlandı (free hesap):** Sor hub, `/exam-preps`, menü (lab linki dahil), lab grid envanter, paywall UI (önceki tur + header CTA gözlemi).

**Bekleyen:** Astra **Plus** hesap delta → `premium-delta.md` + `phase-c/astra-*` (kullanıcı “astra plus hazır”).
