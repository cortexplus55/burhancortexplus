# Faz 3B · `Gate`, `UpgradeSheet`, ana ekran

## 1. Özet
- `useGate` / `<Gate>`: açık (işaret yok), sınırlı (günlük sayaç "N kaldı", 1'de uyarı tonu), kilitli (16 px kilit +
  `PLUS`, soluk değil; basınca yükseltme penceresi). Planı yalnız hak sistemi çözer.
- `UpgradeSheet`: altı neden, metinler ANA-PROMPT tablosundan, sayılar yapılandırmadan, fiyatlar veritabanından.
- Ana ekran: kilitli konu adımı (sunucunun `freeTopicLocks` kararı), "Ücretsiz ders", "Kalan haklar", "{N} mesaj kaldı",
  araç tepsisinde Plus özellikleri kapıyla; "Plus'a geç" 40/44 px.
- Sohbet: hak bitmişken gönderilen metin silinmez (yalnız 402 yolu); sunucunun `gate`'i pencereyi açar.
- Profil paneli: "Kullanım" satırı (Plus, Sınav Haftası, Sigma); Plus %90'da satırdan pencere.

## 2. PR
Bu PR (açıklama = bu rapor), taban 3A.

## 3. Değişen dosyalar
- Yeni: `src/components/entitlements/{entitlement-ui,gate,upgrade-sheet,message-quota,usage-row}.tsx`,
  `src/lib/entitlements/sheet-copy.ts`, `src/styles/entitlements.css`.
- Kabuk: `sor-shell.tsx` (sağlayıcı + `entitlements` özelliği).
- Ana ekran: `src/app/ogretmen/page.tsx`, `home-cockpit.tsx`, `home-cockpit.ts`, `home-cockpit-model.ts`.
- Sohbet: `chat-panel.tsx` (402 yolu, hak göstergesi, %90 bildirimi).
- Profil: `profile-identity.tsx` (`UsageRow`).
- `cx-shell.css`: `.cx-home-buy` 40 px, telefonda 44 px.
- Fikstür: `/e2e/ana-ekran?hak=taze|kullanildi|bitti&kota=90|100` (parametresiz görünüm aynı).
- Testler: `tests/unit/hak-arayuzu.test.tsx`, `tests/e2e/hak-arayuzu.spec.ts`.

Ortak bileşen dokunuşları ve kullanan rotalar: `ParitySorShell` (bütün öğrenci sayfaları; sağlayıcı yalnız bağlam
ekler, DOM'a pencere kapalıyken bir şey eklemez), `ProfileCard` (profil paneli, `/profil`), `ChatPanel` (`/ogretmen`,
hazırlık sohbeti).

## 4. Ölçümler
Görsel taban (yerel, 203 görüntü): 186 aynı, 17 farklı; farkların hepsi bu PR'ın dokunduğu yerlerde:
- ücretsiz hesabın ana ekranı (`e2e-free-fresh`, `e2e-free-exhausted` × 3 genişlik): "Ücretsiz ders", "Kalan haklar"
  (masaüstü ve tablet), "N mesaj kaldı", "Plus'a geç" 40 / 44 px;
- profil paneli ve `/profil` (Plus, Sigma: "Kullanım" satırı; ücretsizde üst çubuktaki 40 px "Plus'a geç").
Ders, test, kartlar ve bütün öbür rotalar birebir aynı. Görüntüler gözle incelendi; telefonda "Kalan haklar" kartı
yazma çubuğunun arkasında kaldığı için gizlendi (375 px ölçümü). Taban bu 17 görüntü için bilinçli güncellendi,
manifest commit'li.

## 5. Test sonuçları
- Yığının tepesinde (3A + 3B + 4A + 4B + 5) koşuldu: tip denetimi 0 hata; lint 0 hata (uyarılar dokunulmayan dosyalarda,
  önceden var); birim **734/734 dosya, 7.072 test** (referans 728 / 6.869); üretim derlemesi başarılı.
- e2e: CI (PR kontrolü).

## 6. Promptan ayrılan yerler
- **"Başla"da kilit:** bugünkü ana ekranda "Başla" yok; sıradaki adımın bağlantısı (`.cx-cockpit-next`) kapıyla
  sarıldı. Kilit sunucunun kararından (`freeTopicLocks`): 1. konunun adımı açık, öbür konular kilitli.
- **Konu dilimlerinde kilit:** halka SVG; kilit işareti seçili konunun metin bloğunda (dilimin üstünde değil).
- **"Türkçe" çipi:** bugünkü ana ekranda yok (13 Kasım'daki ana ekran yeniden kurulurken kalktı).
- **Fiyatlar:** ana ekran sayfası sunucuda okumaz (8 Kasım "ana ekranda Plus kartı yok" bekçisi); pencere tarayıcıdan,
  ana sayfanın kullandığı herkese açık plan satırlarından ve yalnız kilitli kapı görününce okur.
- **Sınav Haftası "Kullanım" satırı** "Bu hafta %N" der (dönem haftalık; "Bu ay" yanlış olurdu).
- **"Kalan haklar"** metin bloğunun altında (sağ altta ayrı yüzen kart yerine; telefonda çubuğun arkasına binmesin).
- **Ders sayacına düşen tepsi araçları** (test, kart, doğru/yanlış) eylem listesinde yok: bugünkü "Plus" rozeti korunur.
- **Pencere açmayan nedenler:** `spend_cap`, `quota_reset_wait`, `free_included_limit` (teklif yok): bugünkü metin.

## 7. Yapılandırma değerleri
`EXAM_WEEK_OFFER_THRESHOLD_DAYS = 14`, `PLUS_QUOTA_WARN_PERCENT = 90`, Plus ayda ~240 ders / 2.400 mesaj, Sigma ~2.000
ders (hepsi `config.ts` + fiyat tablosu).

## 8. Desen yok / Sonraki karar
- Ana ekranda iki brand ("Devam et" + öğretmen düğmesi): tahta yok, bugünkü hâl korundu.

## 9. Yapılamayanlar ve riskler
- Kapı kabuk hesabından kurulur; sayfa açıldıktan sonra değişen sayaçlar sunucu 402'siyle düzelir (sunucu kazanır).

## 10. Burhan'ın yapacakları
- Yok.
