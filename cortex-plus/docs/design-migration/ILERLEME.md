# İlerleme defteri (tasarım geçişi)

Kaynaklar: `ANA-PROMPT.md` ve `OTONOM-PROMPT.md` (ikisi de 14 Kasım 2026; çakışmada OTONOM kazanır). Her PR sonunda
güncellenir; oturum başında ve bağlam sıkışmasından sonra ilk bu dosya okunur.

**Yetki (OTONOM §2):** kapılar + CI yeşil + diff incelemesi temiz + rapor güncelse PR'ı Claude birleştirir (alttan yukarı),
deploy'u izler, production duman testini (`scripts/smoke-prod.mjs`) koşar, bayrakları §5 sırasıyla açar, düello göçünü §6
koşullarıyla uygular. Kırmızı çizgiler OTONOM §3; durak koşulları yalnız OTONOM §8 (D1–D5).

**Önceden verilmiş kararlar (OTONOM §9):** sunucu gerçektir, tablo hedeftir; `getGate` bugünkü sunucuyu birebir taşır,
farklar `10-entitlements.md` "Tablo–sunucu farkları" + `bilinen-sunucu-sapmalari.md` + `KNOWN_DEVIATION` testleri. Plus
%100 + ek paket = açık; Sınav Haftası dönem boşluğu sunucuya dokunmadan testle sabit, %90/%100 sheet'i açılmaz; ücretsiz
ilk ders kesin değilse açık, kilit 402 ile; `is_admin` = Kurucu görünümü; eksik ret nedenleri `GateReason`'a, `spend_cap`'te
teklif yok; sayaç "önce artır, hata olursa iade" kabul; sohbette 402 sonrası metin korunur (yalnız 402 yolu).

| PR | Dal | Durum | PR no | Bayrak | Bekleyen Burhan işi | Notlar |
|---|---|---|---|---|---|---|
| Faz 0 · Envanter, test hesapları, görsel taban, denetim, performans tabanı | `design/faz0-envanter` | **birleşti** (a8bd6967), production duman 11/11 | #647 | — | CI için `E2E_USERS_JSON` sırrı (05) | Görsel taban yerel, manifest commit'li |
| 3A · `lib/entitlements` | `design/hak-sistemi` | **birleşti** (bb675c6a) | #648 | — | — | Karakterizasyon PGlite'ta SQL ile; 402'ye `gate`; `assertGate` rotalara eklenmedi (gerekçe 10-entitlements) |
| 3B · Gate, UpgradeSheet, ana ekran | `design/hak-arayuzu` | **birleşti** (b5a0042d) | #649 | — | — | Sağlayıcı kabukta; fiyat tarayıcıdan; görsel taban 17 görüntü bilinçli güncellendi |
| 4A · Heyecan kiti | `design/heyecan-kiti` | **birleşti** (507e8bb0) | #650 | — | — | Görünür değişiklik yok; galeri `/arena` |
| 4B · Ders ekranı | `design/ders-ekrani` | **birleşti** (3e06bab7) | #651 | `ui.v2.ders` | — | Bayrak altyapısı `src/lib/ui-v2/flags.ts`; `data-ui` sarmalayıcısı + yalnız CSS |
| 5A+5B · Tekrar ekranları (tek PR) | `design/tekrar-test` | **birleşti** (4bebc92a) | #652 | `ui.v2.tekrar` | — | 5B ayrı dal yerine aynı PR |
| 6A · Sohbet kabuğu | `design/ogretmen-sohbet` | **birleşti** (fe33cc21) | #653 | `ui.v2.ogretmen` | Gerçek cihazda klavye | `ChatPanel followUser` bayrağa bağlı |
| 6B · Fotoğraf hak kapısı | `design/ogretmen-foto` | **birleşti** (b9e26948), production duman 11/11 | #654 | `ui.v2.ogretmen` | Gerçek cihazda fotoğraf | |
| 7A+7B+7C · Giriş + kayıt, kurulum, /pay (tek PR) | `design/faz7` | **birleşti** (08df6fdc), production duman 11/11 | #655 | `ui.v2.giris`, `ui.v2.kurulum`, `ui.v2.pay` | Önizlemede gerçek ödeme denemesi (rapor §10) | `?plan=` kartı açıp işaretliyor (bayraktan bağımsız) |
| 8A+8B+8C · Stüdyo (tek PR) | `design/faz8` | **birleşti** (8c1bf91d), production duman 11/11 | #656 | `ui.v2.studyo` | — | /araclar Plus kartlarında `<Gate>`; podcast satırı, dikey video |
| 9 · Düello (9.0 + 9A'nın bugünkü ekranlara uygulanabilen kısmı) | `design/faz9` | **birleşti** (13ddb3d0), production duman 11/11 | #657 | `ui.v2.duello` (kapalı kalır) | Yeni üretim istemi kararı; göçü SQL ekranında uygulamak | Tasarım `09-duello-tasarim.md`; 9B, 9C, Faz 10 park |
| 9B · Düello sunucusu | — | **park** | — | `duel.enabled` | Üretim istemi onayı + göç | Gerekçe `09-duello-tasarim.md` I |
| 9C · Düello bağlama | — | **park** | — | — | 9B'ye bağlı | |
| 10A+10B · Paylaşım kartı, `/d/KOD` | — | **park** | — | `ui.v2.paylas` | 9B'ye bağlı | `/d/ZZZZZZZZ` 404 (duman testi) |
| 11A+11B+11C · Ayarlar, Kütüphane, araçlar, büyüme (tek PR) | `design/faz11` | **birleşti** (50889a28) | #658 | `ui.v2.ayarlar`, `ui.v2.kutuphane`, `ui.v2.araclar2`, `ui.v2.buyume` | Telefonda davet şeridi yeri | Yerleşim 7 kodlandı, öbürleri bekliyor |
| 12A+12B+12C · Durumlar, erişilebilirlik ve performans, kapanış | `design/faz12` | **birleşti** (bu PR; kapanış raporu `12-kapanis-raporu.md`) | #659 | — | 7 gün sonra bayrak temizliği | 404 / hata ekranları, axe düzeltmeleri |

## Kapanış sonrası (15 Kasım 2026)

**Bayraklar (canlı):** 10'u açık: `ui.v2.ders`, `tekrar`, `ogretmen`, `giris`, `kurulum`, `studyo`, `ayarlar`, `kutuphane`,
`araclar2`, `buyume`. Kapalı: `ui.v2.pay` (seçenekler `pay-bayragi-secenekler.md`), `ui.v2.duello`, `ui.v2.paylas`,
`duel.enabled` (9B onayı). Tablo ve 25 planın PR eşlemesi `12-kapanis-raporu.md` §3 ve §3b.

| İş | PR | Durum |
|---|---|---|
| Giriş ve kayıt sol paneli tasarım dilimizle (yazı ortada, altın yok) | #661 | **birleşti** (50327ff0), canlıda doğrulandı |
| `/ogretmen` canlı stres testi: şerit adları, materyal bağlama, stüdyo düğmeleri, 5 şık, usta hoca | #662 | CI'da |
| Playwright yalnız CI'da `retries: 1` + kararsız test raporu | #663 | CI'da |
| CSP "eval" rapor gürültüsü (kök düzenden zod çıktı) | #664 | CI'da |
| Sınav Haftası (ve aylık Plus) cüzdan dönemi boşluğu: test + önerilen düzeltme | #660 | **birleşti**, göç canlıda (Burhan onayı, 15 Kasım) |
| Düello 9B üretim istemi ve maliyet önerisi | — | `duello-9b-oneri.md`, Burhan onayı |

## Sıradaki adımlar (bağlam sıkışırsa buradan)

1. #657 (Faz 9) → #658 (Faz 11) → Faz 12 PR'ı sırayla: CI yeşil → `gh pr merge N --merge` → üstünün tabanını main'e
   çevir (`gh pr edit M --base main`) → ayrı çalışma kopyasında (`git worktree add $TEMP/wt-merge <dal>`) `git merge
   origin/main -m "main dala eşitlendi (#N birleşti)"` + push (derleme sürerken ana kopyada dal değiştirme).
2. Her birleşmeden sonra Vercel durumu ve `node scripts/smoke-prod.mjs --auth`.
3. Faz 12: axe (`node scripts/axe-scan.mjs --label <ad>`, `--v2` ile bayraklar açık; oturumlar
   `E2E_BASE_URL=http://127.0.0.1:3006 node scripts/e2e-login.mjs`, çerez alanı 127.0.0.1), perf
   (`npm run perf:measure -- --base http://127.0.0.1:3006 --label faz12-<sha>` + `perf:compare`), görsel taban
   (`npm run test:visual`, değişen rotalar bilinçli güncellenir), `design:audit`.
4. Bayraklar: canlıda Özellik Anahtarları (yönetim paneli, PIN kapısı) → Burhan-only; adımlar kapanış raporunda.
5. Kapanış raporu `docs/design-migration/12-kapanis-raporu.md` (OTONOM §11, 8 başlık), sonra dur.

## Park edilenler

- **9B · Düello sunucusu ve `duel.enabled`:** yeni üretim istemi (tür karışımı, kademeli zorluk) ANA-PROMPT B gereği Burhan onayı ister; göç SQL ekranından uygulanıyor, OTONOM §6.2 "yapılandırılmış standart migration yolu" şartı yok. Gerekçe `09-duello-tasarim.md`.
- **9C · Bağlama ve gerçek veritabanı e2e:** 9B'ye bağlı.
- **Faz 10 · Paylaşım kartı ve `/d/KOD`:** 9B'ye bağlı; `ui.v2.paylas` kapalı.
- **Düello bayrakları (`ui.v2.duello`, `duel.enabled`, `ui.v2.paylas`):** OTONOM §5 şartları (§6 göçü + 9C e2e) yok; açılmaz.
- **Büyüme yerleşimleri 1–6, 8:** şablon tahtada yok ya da yazdırma karşılaştırması bekliyor (`raporlar/faz11.md` tablo).

## Burhan-only açık işler

1. CI'da hesaplı e2e için GitHub sırrı `E2E_USERS_JSON` (05, "CI").
2. Canlı duman testini zorunlu kontrol yapmak (06 §9; depo ayarı).

## Burhan kararı bekleyenler

0. **15 Kasım 2026 eklenenler:**
   - ~~Sınav Haftası dönem boşluğu düzeltmesi~~: onaylandı, göç `20261115120000` canlıda, PR #660 birleşti.
   - `ui.v2.pay`: Burhan 15 Kasım'da güvenli önizlemeyle açmayı onayladı (ödeme kaydı yok; yalnız planlar görülür).
     Açma ve canlı bakış oturum gerektiriyor: `pay-bayragi-secenekler.md` "Karar".
   - Düello 9B: **ücret 20 kredi (`DUEL_GENERATE`) ve günlük sınırlar onaylandı** (15 Kasım). Hâlâ karar bekleyen:
     istem eki ve tür listesi, paylaşılan düelloda not alıntısı uyarısı, eklemeli göç (`duello-9b-oneri.md` §7, 1/4/5).
     Uygulama bunlar netleşince tek pakette (ücreti yeni üretim gelmeden değiştirmek bugünkü 9 soruluk seti 20 krediye
     çıkarırdı).
   - Kararsız test listesini ayrı yapıt olarak saklamak: `ci.yml`'e `upload-artifact` adımı. İş akışı dosyası bu
     oturumun yetkisiyle push edilemiyor; liste şimdilik iş özetinde.

1. **Hazırlık sayfasının ilk ziyareti "Seviye tespiti" adımını kaldırıyor** (06 §12): sıradaki düğümün önceden yüklenmesi
   tanıyı erteliyor. İstenmeyen yan etki gibi duruyor; düzeltme ürün kararı.
2. **Canlı duman testini zorunlu kontrol yapmak** ya da kırmızıyken bildirim (06 §9). Depo ayarı, Burhan'ın işi.
3. **CI'da e2e test hesapları:** GitHub sırrı `E2E_USERS_JSON` (05, "CI"). Görsel test CI'da koşmaz; bu sır yalnız
   ileride hesaplı e2e içindir.

## Sonraki karar (birleşik liste)

- `/krediler`'de iki marka düğmesi ("Bağlantıyı kopyala", "Ek paket al") ve `/sohbetler` boş durumunda iki "Yeni sohbet"
  (06 §11): ilgili fazlarda tek `brand` kuralına göre düzelecek.
- 375 px'te 40 px'lik hedefler (06 §11): ilgili fazlarda 44'e çıkacak; denetim çıtası bugünkü sayıları tutar.
