<!-- Ürün sahibinin otonom tamamlama promptu (14 Kasım 2026), birebir. ANA-PROMPT.md ile çakışmada bu kazanır. -->

# CORTEX PLUS · TASARIM GEÇİŞİ · OTONOM TAMAMLAMA VE CANLIYA ALMA (TEK PROMPT)
Yetki veren: Burhan (kurucu), 14.11.2026. Bu prompt ANA-PROMPT.md'yi (Parça 1 + 2) ve ILERLEME.md'yi geçersiz kılmaz, devam ettirir ve yetkiyi genişletir. Çakışmada BU prompt kazanır.

## 0. Önce
1. `docs/design-migration/ANA-PROMPT.md` ve `ILERLEME.md`'yi oku, git ve PR durumunu tespit et, kaldığın yerden devam et.
2. Bu promptu `docs/design-migration/OTONOM-PROMPT.md` olarak kaydet (bağlam sıkışırsa buradan devam edeceksin).
3. Tek satır yaz: "Otonom tamamlama prompt'u alındı." Sonra çalış.

## 1. Görev ve bitiş şartı
Faz 0'dan Faz 12'ye kadar BÜTÜN işi bitir, ana dala birleştir, production'a çıkar, bayrakları aç ve kapanış raporunu ver. Bu rapor teslim edilene kadar "devam edeyim mi", "birleştireyim mi", "bayrağı açayım mı" diye SORMA ve onay BEKLEME. Ara raporlar yalnızca bilgidir. Kalite çıtası aynen geçerli: hata ve sorun kabul edilmez, §6 kapıları gevşemez, test sayısı düşemez (birim ≥ 728 dosya / 6.869 test, e2e ≥ 220).

## 2. Burhan'ın verdiği yetkiler
- **Birleştirme:** "BİRLEŞTİR" komutu şartı kalktı. Bir PR'ı şu koşulların HEPSİ sağlanınca kendin birleştir: §6 kapıları yeşil, CI yeşil, kendi diff incelemen temiz, ILERLEME ve rapor güncel. Yığını alttan başlayarak sırayla birleştir; her birleşmeden sonra üstteki PR'ın tabanını main'e çevir, rebase et, CI'ı yeniden koştur. Repo'nun normal birleştirme yolunu kullan (`gh pr merge`, repo kuralına uygun yöntem).
- **Production:** main'e birleşme production'a deploy ediyorsa deploy'u izle. Deploy durumunu mevcut araçla (Vercel CLI ya da GitHub deployment durumu) oku. Araç yoksa production adresine HTTP 200 + sürüm işareti (commit sha varsa) ile doğrula.
- **Bayraklar:** `ui.v2.*`, `duel.enabled` bayraklarını §5'e göre production'da aç.
- **Veritabanı:** düello migration'ını §6'daki koşullarla canlıya uygula.

## 3. Kırmızı çizgiler (yetki olsa bile ASLA)
- Sır, anahtar, token, `.env` içeriğini okuma, yazma, raporlama ya da arama. Yalnızca projede ZATEN yapılandırılmış CLI oturumlarını kullan; yetkin yoksa çıkar, bulmaya çalışma.
- Gerçek ödeme yapma, gerçek hesap oluşturma, production'da gerçek model / ses / video çağrısı (maliyet) tetikleme.
- Koruma kurallarını atlatma: `--admin`, force-push, `--no-verify`, CI'ı ya da testi atlama / silme / gevşetme, dal koruma kurallarını kapatma.
- Yıkıcı veritabanı işlemi: DROP, DELETE, TRUNCATE, mevcut tablo ya da sütunu değiştirme, veri güncelleme.
- Kimlik doğrulama, oturum, PayTR, ödeme token'ı, plan aktivasyonu, kota ve sayaç sunucu mantığını değiştirme (ANA-PROMPT'ta açıkça yazılan yerler hariç).
- Eski kodu §7'deki 7 günlük sürenin dolmasından önce silme.
- Kötüye kullanım koruması (hız sınırı vb.) işi başka bir dalda ya da sohbette yapılmışsa onu yeniden kullan, ikinci bir mekanizma yazma ve ona dokunma.

## 4. Birleştirme ve canlı doğrulama protokolü (her PR)
1. Birleştirmeden önce kapılar; birleştikten sonra deploy'un BAŞARILI olmasını bekle.
2. **Production duman testi** (`scripts/smoke-prod.mjs`, yeni bağımlılık yok, Playwright mevcut): yalnızca salt-okur. Anahtar rotalar beklenen durum koduyla açılıyor mu (ana sayfa, giriş, /pay, `/d/ZZZZZZZZ` → 404 bayrak kapalıyken, `robots.txt`); konsol hatası yok; `lang="tr"`; başarısız ağ isteği yok; gerekirse e2e hesabıyla giriş ve ana ekran. Ödeme, model çağrısı, hesap oluşturma YOK.
3. **Duman testi başarısızsa:** hemen `git revert` + deploy, kök nedeni bul, düzeltme PR'ı aç (en çok 2 deneme). Düzelmezse PR'ı "park" et (ILERLEME'de gerekçe), §8'e göre devam ya da dur.
4. Bayrak KAPALIYKEN birleşen kod, bugünkü canlı görünümle piksel-aynıdır (ANA-PROMPT kuralı). Görsel taban bunu zaten doğruluyor; fark çıkarsa birleştirme.

## 5. Bayrak açma protokolü (production)
Bir fazın bütün PR'ları birleşip duman testi geçtikten sonra o fazın bayraklarını aç. Sıra düşük riskten yükseğe: tekrar, öğretmen, ayarlar, kütüphane, araçlar, stüdyo, giriş, kurulum; ana ekran ve kilit bayrakları (ILERLEME'deki isimlerle) kendi fazlarının sırasında; EN SON ödeme ve düello.
Her açılış için:
1. Bayrak AÇIK halde aynı commit'in önizlemesinde Playwright + axe + üç genişlikte ekran görüntüsü; görüntüleri `Read` ile kendin incele (taşma, kontrast, kayma).
2. Production'da bayrağı aç (bayrak nasıl yönetiliyorsa o yetkili yolla). Erişimin yoksa bulmaya çalışma: "Burhan-only" listesine tam adımlarla yaz ve DEVAM ET.
3. 10 dakika izleme: duman testini tekrarla, hata günlüğüne erişimin varsa bak.
4. Sorun varsa bayrağı HEMEN kapat (kill-switch), kök neden, düzelt, yeniden dene (en çok 2 kez). Düzelmezse kapalı bırak, park listesine yaz, sonraki faza geç.
- **`ui.v2.pay`:** açmadan önce önizlemede PayTR çerçevesinin YÜKLENDİĞİNİ doğrula (token alınır, çerçeve görünür; ödeme TAMAMLANMAZ). Yüklenmiyorsa bayrak kapalı kalır.
- **Düello (`duel.enabled`, `ui.v2.duello`, `ui.v2.paylas`):** yalnızca §6 koşulları + 9C gerçek-veritabanı e2e yeşil + maliyet korumaları (günlük düello sınırı, eşzamanlı üretim sınırı) + hız sınırı eşikleri `09-duello-tasarim.md`'deki önerilen değerlerle devrede ise aç. Biri eksikse kapalı bırak ve raporla.

## 6. Veritabanı (düello migration'ı)
Canlıya yalnızca şu koşulların HEPSİ sağlanırsa uygula:
1. Migration yalnızca ekleyici (betikle tara: DROP, DELETE, TRUNCATE, UPDATE, mevcut nesneye ALTER yok), RLS açık, geri alma betiği yazılı ve test edilmiş.
2. Projenin zaten yapılandırılmış standart migration yolu var (örn. Supabase CLI oturumu); anahtar aramak yok.
3. Önce kuru çalıştırma / fark çıktısı, sonra uygula, sonra doğrula: tablo var, RLS açık, anon anahtarla okuma reddediliyor, sunucu rotasıyla okuma çalışıyor.
Koşullardan biri yoksa uygulama; düello bayrakları kapalı kalır, diğer fazlar devam eder; rapora tam komutla yaz.

## 7. Eski kod temizliği (Faz 12C) ve 7 günlük süre
Eski stil yolları ve `ui.v2.*` bayraklarını silmek, geri dönüş yolunu kaldırır. Bu yüzden ancak bayraklar production'da açık ve en az 7 gün sorunsuz kaldıktan sonra yapılır; bu süre atlanamaz.
- Faz 12C'nin bayrağa bağlı OLMAYAN kısımlarını şimdi yap (nihai görsel taban, `audit-baseline.json`, kapanış belgeleri, 0 referanslı ölü kod; her silmede kanıt ve silme sonrası sıfır görsel fark).
- Bayrak ve eski yol temizliği için ortamında zamanlayıcı varsa (loop, wakeup, cron) 7 gün sonrasına kendine kur. Yoksa kapanış raporuna tek cümlelik komut yaz: "7 gün sonra 'TEMİZLİĞİ BAŞLAT' yaz". Kapanış raporunu bu yüzden BEKLETME.

## 8. Gerçek durak koşulları (yalnızca bunlarda dur ve raporla; başka hiçbir şeyde dur ma)
- **D1:** Production olayı revert ve kill-switch ile de düzelmiyor.
- **D2:** Birleştirme dal koruma kuralı (zorunlu inceleme onayı vb.) yüzünden engelleniyor. Bu durumda tam PR adını yaz ve dur.
- **D3:** Yığındaki bir PR 3 denemede yeşile dönmüyor VE sonraki PR'lar ona bağlı. Bağımsız hale getirebiliyorsan getir, getiremiyorsan dur.
- **D4:** Bir sırrın rapora, depoya ya da günlüğe sızdığını fark ettin: tek satırlık "GÜVENLİK" uyarısı yaz ve dur.
- **D5:** Kullanıcı verisinde beklenmeyen kayıp ya da bozulma belirtisi.

Diğer her sorunda: park et (ILERLEME'ye gerekçeyle), kapalı bırak, devam et. **Mevcut production kodunda güvenlik açığı** bulursan (örn. açık yönlendirme, doğru cevap sızıntısı) sohbette tek satır "GÜVENLİK: …" yaz, ilgili işi park et, kalan işe devam et.

## 9. Önceden verilmiş kararlar (SORMA)
İlke: sunucu gerçektir, tablo hedeftir. `getGate` bugünkü sunucu davranışını BİREBİR taşır; sunucuya dokunulmaz. Tablo–sunucu ayrışmaları `10-entitlements.md` "Tablo–sunucu farkları" bölümüne ve `bilinen-sunucu-sapmalari.md`'ye yazılır, karakterizasyon testi `KNOWN_DEVIATION` ile sabitler.
1. Plus %100 + ek paket bakiyesi: sunucu izin veriyorsa arayüz açık / sınırlı gösterir; Sigma teklifi yalnızca sunucu gerçekten reddedince.
2. Sınav Haftası cüzdan dönemi boşluğu (olası kota sızıntısı): SUNUCUYA DOKUNMA, test ile sabitle, raporun "Burhan kararı" bölümüne yaz. Sınav Haftası'nda %90 / %100 sheet'i açılmaz.
3. Ücretsiz ilk ders: kesin bilgi yoksa `lesson.create` açık döner; kilit yalnızca sunucu 402 verince (UpgradeSheet). Sunucu ret nedenleri ile çizili sheet nedenleri arasındaki eşleme belgede.
4. `is_admin` = Kurucu görünümü (sunucu davranışı aynen).
5. Eksik ret nedenleri (`spend_cap`, `free_topic_limit`, `free_prep_limit`, …) `GateReason`'a eklenir; çizili olmayanlar en yakın sheet'e eşlenir, yeni pazarlama metni yazılmaz; `spend_cap`'te yükseltme teklifi yok.
6. Sayaç "önce artır, hata olursa iade et" modeli net sonuç olarak KABUL; tüm hata yollarında iadeyi testle göster, olmayan yolu düzeltme, sapma listesine yaz. Arayüz sayacı asla kendisi artırmaz / azaltmaz.
7. Sohbette 402 sonrası metin korunur (3B/6A): en küçük değişiklik, yalnızca 402 yolu, diğer yollar karakterizasyon testli.
Diğer ürün varsayılanları ANA-PROMPT §3.11'dedir ve uygulanır.

## 10. Çalışma kuralları
- Her PR sonrası: rapor (`raporlar/`), `ILERLEME.md` güncel, sohbette ≤ 8 satır özet, ardından BEKLEMEDEN sıradaki iş.
- Windows'ta yalnızca Node betikleri; uzun işleri parçala; bağlam dolarsa ANA-PROMPT.md + OTONOM-PROMPT.md + ILERLEME.md'den devam et.
- Yeni bağımlılık ekleme, var olan paketi istemeden yükseltme.
- Rapor ve PR açıklamalarında sır yok.

## 11. KAPANIŞ RAPORU (bitiş şartı)
Her şey canlıya alındıktan (ya da §8/§9'a göre park edildikten) sonra `docs/design-migration/12-kapanis-raporu.md` dosyasını yaz ve sohbete şu başlıklarla NET özet ver:
1. **Durum:** TAMAMLANDI / KISMEN (kaç PR birleşti, kaç bayrak açık, neler park).
2. **PR tablosu:** PR, dal, birleşme SHA'sı, zamanı, production durumu.
3. **Bayrak tablosu:** bayrak, açık / kapalı, açılış zamanı, kapalıysa nedeni.
4. **Ölçümler:** test sayıları, axe sonucu, görsel fark, performans (eski taban 1288c254 ve b25a9229'a karşı tablo), production duman test sonuçları.
5. **Bilinen sapmalar ve sunucu sapmaları** (Sınav Haftası boşluğu dahil), "Sonraki karar" listesi.
6. **Burhan-only açık işler:** tam komut ya da adımlarla (gerçek ödeme testi, iOS / Android gerçek cihaz klavye testi, uygulanamayan migration varsa komutu, erişilemeyen bayraklar).
7. **Geri alma kılavuzu:** her bayrağı kapatma adımı ve en son güvenli commit.
8. **7 gün sonra tek komut:** "TEMİZLİĞİ BAŞLAT".
Raporu verdikten sonra dur.

=== PROMPT SONU ===
