# Parity checklist (şablon)

Audit tamamlandıkça her satır `matched` / `gap` / `n/a` işaretlenecek.

| # | user_state | astra_url | element | action | expected_result | cortex_route | status | evidence |
|---|------------|-----------|---------|--------|-----------------|--------------|--------|----------|
| 1 | guest | /tr/ | HEMEN DENE | click | onboarding veya login | `/kayit` | matched | cortex marketing hero |
| 2 | guest | /tr/ | GİRİŞ YAP | click | login | `/giris` | matched | — |
| 3 | student | app | Plus paywall | click | paketler | `/paketler` | matched | astra-subscription-cards |
| 4 | student | app | Ebeveynden ödeme iste | click | veli bildirimi | `/paketler` + `parent_payment_requests` | matched | 2025-08-26 |
| 5 | student | app | Sor / lab | navigate | uygulamalar | `/uygulamalar`, `/uygulamalar/lab/*` | matched | 18 sim — `lab-apps.ts` |

> Detaylı satırlar `scope-matrix.csv` ve `evidence/*/interaction.jsonl` ile senkron tutulur.
