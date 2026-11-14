# Faz 12 · Kapanış (12A + 12B + 12C)

Yeni özellik yok; eksik durumlar, hata sayfaları, erişilebilirlik ve performans ölçümü, temizlik.

## 1. Özet
- **12A durumlar:** 404 ve hata ekranları ortak `StatusScreen` ile: gerçek logo dosyası, istenen metinler, tek brand
  eylem; sarı "404" ve üç boyutlu görsel kalktı (`not-found.css` 0 referansla silindi). `error.tsx` ve `global-error.tsx`
  "Bir şeyler ters gitti", "Yeniden dene" + zayıf "Ana sayfaya dön"; teknik ayrıntı yok, yalnız kısa hata kodu.
  `global-error` kendi `<html lang="tr">`'si ve token değerleriyle (altın yok).
- **Hareket azaltma:** 12 rotada (misafir sayfaları ve veritabanısız fikstürler) hareket azaltma açıkken boşta sonsuz
  animasyon 0 (`hareket-azaltma.spec.ts`). İlk ölçümdeki 14 "ihlal" testin hatasıydı: `test.use({ reducedMotion })`
  bu depoda uygulanmıyor; `page.emulateMedia` ile ölçüldü.
- **12B erişilebilirlik:** tam axe taraması (`scripts/axe-scan.mjs`, WCAG 2.1 A + AA, 70 ekran × 3 genişlik × misafir,
  ücretsiz, Plus, Sigma, kurucu fikstürü). İlk tarama 179 serious / critical düğüm buldu; dördü de düzeltildi:

| Bulgu | Etki | Ekran | Düzeltme |
|---|---|---|---|
| `aria-required-children` | critical | ana ekran (15), hücre laboratuvarı (3) | sınav şeridinde "Yeni sınav hazırlığı" bağlantısı sekme listesinin dışında (aynı kaydırma kabında, görünüm aynı); organel seçimi düğme grubu (`aria-pressed`) |
| `nested-interactive` | serious | hücre laboratuvarı (3) | yuva düğmeleri olan çizim `img` değil, etiketli grup |
| `aria-progressbar-name` | serious | kullanım limitleri (3) | ilerleme çubuklarına satırın adı |
| `color-contrast` | serious | 33 ekran, 152 düğüm | metin bağlantıları `--cs-primary` (2,98:1) yerine `--cx-text-brand`; sınav şeridi sayıları ve takvimin ay dışı günleri `--cx-text-tertiary`; periyodik tablo atom numarası `--cx-text-secondary` (kategori rengi kenarlıkta ve lejantta) |

Dokunulan rotalar (bayrak kapalıyken de görünen değişiklik, görsel taban bilinçli güncellendi): `/ogretmen` (şerit
sayıları), `/ilerleme`, `/ayarlar`, `/krediler`, `/pay`, profil paneli (metin bağlantıları), `/takvimim`,
`/araclar/periyodik`, `/araclar/hucre`, 404.

## 6. Promptan ayrılan yerler
- Durum matrisi (her rota × boş / yükleniyor / hata / çevrimdışı) baştan taranmadı; ortak `EmptyState` bugün de var,
  `ErrorState` olarak `StatusScreen` eklendi. Çevrimdışı: PWA / service worker yok, yeni eklenmedi.
- 12 kritik akışın klavye denemesi: bu turda eklenen e2e'ler (giriş Enter, yükseltme penceresi Tab döngüsü ve Esc,
  stüdyo kartı, büyüme şeridi kapatma) ve var olan klavye e2e'leri; düello kurulumu ve Paylaş sayfası park.
- Bayrak temizliği (eski yolların silinmesi) OTONOM §7 gereği bayraklar canlıda 7 gün açık kaldıktan sonra.
