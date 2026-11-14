# 00 · Taban noktaları

Faz 12'de "yeni tasarım eskisinden kötü değil" iddiasının karşılaştırma noktaları (görsel, denetim, performans).
Ürün sahibinin kararı (14 Kasım 2026): iki taban, güncel main üçüncü nokta.

| Ad | Commit | Tarih (main'e girdiği an) | Ne |
|---|---|---|---|
| **BASE_SHA_ESKI** (asıl "eski") | `1288c2544571dfe31121b081509f497997df24dd` | 12 Kasım 2026 12:12 (+03) | #643'ten önceki main (#642 birleşmesi). Tasarım geçişinin hiçbir parçası yok. |
| **BASE_SHA** | `b25a92291025bef58e074f87eb98bea85faa5d89` | 13 Kasım 2026 22:30 (+03) | #644'ten önceki main (#643, tasarım sistemi v1 + ana ekran birleşmesi). |
| Güncel main (Faz 0 başlangıcı) | `492e206e8d3a60c2c9e27c8e4ed67a040cc6fbeb` | 14 Kasım 2026 03:40 (+03) | #644 (Faz 1), #645 (Faz 2), #646 (Prompt 1 kararları ve canlı düzeltmeler) birleşmiş. |

Not: Prompt 1'in istediği gibi `BASE_SHA` birleştirmeden önce okunamadı; #644 ve #645 prompt gelmeden (13 Kasım 22:50)
birleşmişti. `b25a9229` = #644 birleşme commit'inin (`f7e01605`) ilk ebeveyni, yani birleştirmeden hemen önceki main.

## Görsel taban (2.6): görüntüler git'te değil

Ürün sahibinin kararı (14 Kasım 2026, seçenek 4):
- **Taban görüntüleri git'e girmez:** ne daraltma ne LFS. Nedenleri:
  - Görüntüler Windows'ta üretildi; Linux CI yazıları farklı çizer, karşılaştıramaz.
  - Her bilinçli güncelleme depoyu kalıcı büyütürdü.
  - Taban yeniden üretilebilir.
- **203 görüntünün hepsi yerelde kalır:** `tests/visual/__screenshots__/`, `.gitignore`'da.
- **Git'te yalnız kayıt durur:** `tests/visual/baseline-manifest.json`.

Manifestte:
- **BASELINE_SHA:** görüntüleri üreten kodun commit'i ve çalışma ağacının temiz olduğu.
- **Tarih ve ortam:** işletim sistemi, Node, Playwright ve Chromium sürümleri.
- **Ölçüler:** genişlikler, eşik (`maxDiffPixelRatio` 0,002), sabit saat.
- **Görüntü başına:** rota, genişlik, kullanıcı, bayt ve sha256.

Bugünkü kayıt: **203 görüntü, 26,46 MB**, BASELINE_SHA `675aec91`, Windows 10.0.26200 x64, Node 24.14.1, Playwright
1.62.1, Chromium 151.0.7922.34.

- `npm run test:visual` önce görüntüleri manifestle karşılaştırır (`scripts/visual-baseline.mjs`). Klasör yoksa ya da bir
  görüntünün özeti tutmuyorsa çalışmaz; Türkçe hata ve yeniden üretim komutlarını yazar.
- CI'da (`CI=true`) "atlandı: taban yalnızca Windows'ta" der ve 0 ile çıkar. Playwright CI'da doğrudan çağrılsa da sunucu
  kalkmaz, testler atlanır.

## Yeniden üretim

Ön koşullar:
- Bu klasörde `.env.local`, servis anahtarı dahil; değerler hiçbir yere yazılmaz.
- Test hesapları ve giriş durumları (05-test-hesaplari.md).
- 3006'da çalışan sunucu **yok**. Varsa Playwright onu yeniden kullanır ve üretim temiz worktree'den olmaz.

Elle:
1. `npm run e2e:seed`: hesaplar ve hazırlıklar tohumun bilinen hâline döner.
2. Temiz worktree: `git worktree add --detach <geçici klasör> <Faz 0 commit'i>`.
3. Bağımlılıklar:
   - Kilit dosyası aynıysa ana `node_modules`'e bağlantı: `mklink /J <worktree>\cortex-plus\node_modules <bu klasör>\node_modules`.
   - Değilse worktree'de `npm ci`.
4. `.env.local` dosyasını ve `tests/.auth/` klasörünü worktree'nin `cortex-plus` klasörüne kopyalayın.
5. Worktree'de `npm run test:visual:update`. Playwright üretim derlemesi alır (`E2E_FIXTURE=1`, model anahtarı, SMTP,
   Resend ve `SENTRY_AUTH_TOKEN` boş), 3006'da başlatır, her koşudan önce taze giriş yapar ve 203 görüntüyü yazar.
6. Üretilen görüntülerin sha256'larını commit'teki manifestle karşılaştırın. `test:visual:update` worktree'deki manifesti
   yeniden yazdığı için karşılaştırma commit'teki dosyayla yapılır.
7. Temizlik:
   - **önce** `rmdir <worktree>\cortex-plus\node_modules` (yalnız bağlantı; `git worktree remove` bağlantının içini,
     yani ana `node_modules`'ü silerdi);
   - `.env.local` ve `tests/.auth` silinir;
   - `git worktree remove --force <geçici klasör>`.

Tek komut, 2–7 adımlarını yapar ve sonucu `docs/design-migration/data/gorsel-yeniden-uretim.json`'a yazar:

```bash
node scripts/visual-reproduce.mjs --commit <Faz 0 commit'i>
```
