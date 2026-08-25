# Astra misafir — `/tr-TR/pay` (Plus / Sigma)

**Durum:** guest (oturum yok / upgrade ekranı)  
**URL:** `https://app.astra-ai.co/tr-TR/pay`  
**Evidence:** Cursor browser screenshot `page-2026-08-25T18-36-56-873Z.png`

## Layout

- Tam ekran koyu modal / sayfa
- Sağ üst **X** kapat
- Başlık: **Daha iyi notlar al ve 2 kat hızlı öğren**
- Alt başlık: **Sınavları geçmek için ihtiyacın olan her şey**

## Kart 1 — Plus

| Öğe | Gözlem |
|-----|--------|
| İkon | Sarı/turuncu “+” kare |
| Toggle | **Yıllık • %58 tasarruf et** \| **Aylık** (varsayılan: Aylık seçili) |
| Fiyat (aylık) | **₺770 / ay** — “aylık faturalandırılır” |
| CTA | **Plus'a yükselt** (mavi, full-width pill) |
| Alt | **Tüm avantajları gör** (chevron, genişletilebilir) |

## Kart 2 — Sigma

| Öğe | Gözlem |
|-----|--------|
| İkon | Sigma (Σ) sarı |
| Badge | **10400X DAHA FAZLA KULLANIM** (gökkuşağı kenarlı pill) |
| Alt metin | Ciddi çalışma için |
| Fiyat | **₺2.567 / ay** — aylık faturalandırılır |
| CTA | **Sigma'ya yükselt** |
| Alt link | **Ebeveynden ödeme iste** |

## Tasarım token (Cortex parity hedefi)

- Arka plan: ~`#121212`
- Kart: ~`#1e1e1e`, radius 16–24px
- Primary CTA mavi: ~`#3b52d9`
- Tipografi: geometric sans (Inter benzeri)
- Fiyat vurgusu beyaz, ikincil metin gri

## Cortex mapping

- `/fiyatlandirma` + `/paketler` → **aynı iki kademe UI** (Plus / Sigma veya Cortex adlandırması)
- PayTR entegrasyonu mevcut backend’e bağlanır; **görsel katman bu ekranın kopyası**

## Pending interactions (audit)

- [ ] Yıllık ↔ Aylık fiyat değişimi
- [ ] Tüm avantajları gör expand
- [ ] X kapat → nereye döner
- [ ] Plus/Sigma CTA → ödeme adımı (UI only, charge yok)
- [ ] Ebeveynden ödeme iste akışı
