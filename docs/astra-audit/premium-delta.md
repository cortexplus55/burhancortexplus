# Faz C — Premium delta (Cortex Plus)

**Astra kaynağı:** `premium-app-ui-spec.md`, plan §6  
**Not:** Gerçek Astra Plus hesabında tıklama audit’i handoff gerektirir; aşağıdaki farklar Cortex implementasyonuna dayanır.

## Free → Premium farkları (Cortex)

| Yüzey | Free | Plus / Sigma |
|-------|------|----------------|
| AI sohbet kotası | `credit_wallets` + ücretsiz hak | Paket kredisi / premium flag |
| Gelişmiş model | Kilit veya sınırlı | `isPremiumUser` → advanced model |
| Görsel soru | Upload + vision (kredi) | Aynı akış, daha yüksek kota |
| Paywall sheet | 402 sonrası | Ödeme sonrası sheet kapanır |
| Abonelik yönetimi | `/odemeler`, `/paketler` | PayTR iframe — **iptal UI observe only** |

## Veli / öğrenci Plus

| Aksiyon | Cortex |
|---------|--------|
| Veli satın alma | `/veli/plus` → `AstraSubscriptionCards` |
| Öğrenci ebeveynden iste | `/paketler` → `parent_payment_requests` |
| Veli istek listesi | `/veli/plus` → `ParentPaymentRequests` |

## Lab / sim

Premium gate yok; tüm `/uygulamalar/lab/*` sim’ler free erişilebilir (Astra’da Plus kısıtı varsa audit handoff ile doğrulanacak).

## Kanıt

- `evidence/phase-c/cortex-premium-interactions.jsonl`
- `evidence/phase-a/app-pay/interaction.jsonl` (misafir pay UI referans)

## Sonraki adım

Plus Astra hesabı açıkken: paywall kapalı menü öğeleri, sigma toggle, stream limit — `premium-delta-astra.jsonl` doldurulacak.
