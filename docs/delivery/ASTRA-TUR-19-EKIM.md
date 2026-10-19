# Astra ekran ekran tur — 19 Ekim 2026 (adım 4)

Aynı durumda iki hazırlık: Astra 10109966 (KPSS, 6 konu, 1 ders bitti) × Cortex 9516e9cb (KPSS, 16 konu,
1 düğüm / 4 deneme bitti). Astra Plus hesabı, Cortex kurucu hesabı. Kanıt: ekran görüntüleri ve sayfa metni
(bu oturumda), kod yolu her bulguda.

## 1. Hazırlık sayfası (Çalışma yolu)
| Ekran öğesi | Astra | Cortex | Durum |
|---|---|---|---|
| Üst çubuk | Geri · "Sohbet" (ipucu balonu: "nasıl öğrenmeyi sevdiğini öğretmenine söyle") | Geri · sohbet simgesi · "+" | eşdeğer (ipucu balonu yok — küçük) |
| Başlık kartı | ders · hazırlık % · "1 ders tamamlandı" · Çalışma yolu / İlerleme · Ders · Düello · Paylaş · Daha fazla | aynı + "Etkinlikler sırayla açılır" açıklaması | eşdeğer |
| Hazırlık yüzdesi 1 dersten sonra | **%2** | **%0** | **düzeltildi** (bu PR: ilerleme varsa en az %1; ölçüm modeli aynı) |
| Sıradaki | bir sonraki konunun **testi** | aynı konunun **podcast'i** | yol tasarımı farkı (17 Ekim kararı: konu içi ders → podcast → test); değiştirilmedi |
| Yol düğümleri | biten %100 yeşil, sıradaki mavi 3B, kilitli gri | aynı | eşdeğer |

## 2. İlerleme sekmesi (1 dersten sonra)
| Öğe | Astra | Cortex | Durum |
|---|---|---|---|
| Hazırlık puanı kartı | 2% · "BU HAFTA +%2" · hedef %75 · 0/6 konu · 6 gün · 1 ders | 0% · "bu hafta 4 etkinlik" · hedef %75 · 7 gün · 0/16 · 1 ders · temel açıklaması | eşdeğer; %0 → en az %1 |
| Sınav günü tahmini | 1 dersten sonra: "Bu tempoyla sınav günü yaklaşık %2" + grafik | "ilk iki dersten sonra görünür" | **düzeltildi:** ilk dersten sonra tahmin (grafik yok) |
| Tempo kartı | "her ders ≈ +%2 · 37 ders daha · bugün 1 ders · günde ≈ 7" + gün kutucukları | yok | **eklendi:** aynı dört sayı (kutucuksuz) |
| Bilgi eksikleri | "0 eksik · Bilgi eksiğin yok!" | "Henüz eksik belirlenmedi" (puanlanmış etkinlik olsa da) | **düzeltildi:** puanlanmış etkinlik varsa "0 eksik" |
| Konular ve dersler | 6 konu, "Beceri ağacı" düğmesi, konu başına % + çubuk + hedef çizgisi + "1 çözüldü · 1 ders · bugün" | 16 konu, konu başına % + çubuk + "13 çözüldü · 4 ders" + "… için ders oluştur" | Beceri ağacı görünümü bizde yok (ayrı görünüm, öğretmiyor — soru) |
| Haftalara göre konular | var | var | eşdeğer |

## Devam edecek ekranlar
Ana sayfa · Sınavlar listesi · test (quiz) ekranı · ders sonu testi · podcast oynatıcı · araçlar · profil/ayarlar · fiyat.

## 3. Ana sayfa
Astra "Deneme, günaydın!" · BAŞLA · ders çipi · yazı kutusu + ses düğmesi × Cortex "burhan, günaydın!" · aynı. Eşdeğer.

## 4. Sınavlar listesi
| Öğe | Astra | Cortex | Durum |
|---|---|---|---|
| Üst: Ara · Yeni test; üç kutu OKULUM / MÜFREDAT / RESMÎ SINAVLAR | var | var ("Yeni hazırlık") | eşdeğer |
| Kart: ad · çubuk · % · "yarın / 6 gün sonra · 0/12 konu" · Devam et | var | var (+ Caveat "hedef puan" etiketi, 17 Ekim kararı) | eşdeğer |
| Hiç ders yapılmamış hazırlıkta % | **%2** (hepsinde taban) | %0 (PR #335'ten sonra ilerleme varsa ≥%1) | fark küçük; taban %2 istenirse tek satır |
| Taslaklar satırı (ad · Oluşturmayı tamamla · çöp) | var | var (bu hesapta taslak yok, görülmedi) | eşdeğer |

## 5. Test (quiz) açılışı — yarım kaldı
Astra: yoldaki Sıradaki = sonraki konunun testi; "Devam et" → kart: 3B ABCD simgesi · "Zorluk seviyesi belirle · Orta" kaydırıcı · düğme "Ders oluştur" (çeviri hatası, test başlatıyor). Düğmeye basınca kart kapandı, sayfa aynı kaldı (test açılmadı ya da arka planda hazırlanıyor — doğrulanamadı).
Cortex: Sıradaki = aynı konunun podcast'i; "Başka birini seç" → "Ders oluştur" penceresi: konu seçimi (16 konu), ÖĞREN / PRATİK YAP / SINAV sekmeleri; SINAV'da yalnız Yazılı deneme + Sözlü deneme — **Konu testi PRATİK YAP sekmesinde olmalı, bakılmadı**.
Kalan: iki tarafta test ekranını yan yana açmak (soru düzeni, şık, açıklama, sonuç ekranı), ders sonu testi, podcast oynatıcı, araçlar, profil/ayarlar, fiyat.

## 5 (devam). Test ekranı — yan yana açıldı (19 Ekim, öğle)
| Öğe | Astra | Cortex | Durum |
|---|---|---|---|
| Açılış kartı | tek kart: 3B simge · zorluk kaydırıcı · "Ders oluştur" (çeviri hatası) | **iki kart**: ruh hali → zorluk kaydırıcı · "Testi oluştur" | ruh hali kartı Astra'da yok (ürün sahibi 18 Ekim: sorulsun, yalnız kaydedilsin) — soru |
| Soğuk üretim süresi | ~15 sn (5 soru) | **36 sn** (`teacher_quiz`: kept 5, rejected 1, rounds 0, calls 2, ms 30165 — taslak + denetim ard arda) | **açık**: taslak akışla + öğe öğe denetim (ders motoru kalıbı) ya da denetimi paralel |
| Soru ekranı | üst ilerleme çubuğu "1 / 5" · × · "SORU 1" · "1 kaynak" · şıklar 1-4 (klavye) · "Kontrol et ↵" | "1 kaynak" · "Soru 1 / 5" · çubuk · şıklar A-D · "Kontrol et" · "Bilmiyorum, sen anlat" · "Eğitmene yaz" | eşdeğer; bizde ek olarak eğitmene yazma |
| Doğru cevap geri bildirimi | şık yeşil ✓ · AÇIKLAMA kutusu · "🎉 Doğru · Devam et ↵" | şık yeşil ✓ · Açıklama · "Doğru" · şık şık açıklamalar · Devam et | eşdeğer (bizde şık şık açıklama fazladan) |
| Yanlış cevap geri bildirimi | seçilen kırmızı ✕ **+ doğru şık yeşil ✓** | yalnız seçilen kırmızı; doğru şık işaretsiz | **düzeltildi** PR #337 |
| Çok cevaplı soru | (görülmedi) | "Birden fazla yanıt seçebilirsin" · kısmi puan "Kısmen doğru · %33" | 17 Ekim kararı, çalışıyor |
| Sonuç | "Doğru cevaplar 1/5 · 🤔 Az kaldı! · Doğruluk 30% · Harcanan zaman 4 dk · Dersi tekrarla · Eğitmeninden geri bildirim · sınıf arkadaşı paylaşımı · Devam et" | "+12 yıldız · 1/5 · 💪 Biraz daha pratikle oturacak · Doğruluk %20 · 4 dk · Tekrar edilecekler · Dersi tekrarla · Eğitmeninden geri bildirim · Bu dersi nasıl buldun? · Arkadaşına meydan oku · Devam et" | eşdeğer+ |
| Eğitmeninden geri bildirim | pencere: 💪 İyi bilgi · ⚡ Zayıf noktalar · 📚 Odaklan (maddeler) | düğme var (içeriği bu turda açılmadı) | kontrol edilecek |
| Sonuçtan sonra | 1) "Öğrenme sürecin dengeli görünüyor" zorluk kaydırıcısı (Çok kolay / Tam kararında / Çok zor) + "Bu dersi nasıl buldunuz?" 2) "+6% kazandın! · Konu hakimiyeti 18%" 3) yol sayfası | sonuç ekranından "Devam et" doğrudan **sonraki düğüme** (yol sayfası ve "+X%" ekranı yok); zorluk kaydırıcısı bizde iki düşük sonuçtan sonra bandda | fark: "+X% konu hakimiyeti" ekranı yok — soru |
| Yolda sonraki etkinlik | "AKILLI METİN" (Astra'nın yeni düğümü: 3 dk okuma · 8 adım, bölüm listesi, önce dene soruları, sonda test — bizim ekranlı dersin dengi) | podcast | yol tasarımı |

## 6. Podcast (aynı konu, Diyalog ~5 dk)
| Öğe | Astra | Cortex | Durum |
|---|---|---|---|
| Kurulum | Podcast kartı: tür ("Diyalog ~5 dk · Değiştir") → "Konu seç" listesi (konu başına seviye/%) | ruh hali → zorluk + tür (5 tür, "Önerilen") | eşdeğer (bizde ruh hali fazladan) |
| Soğuk üretim | ~47 sn (senaryo + ses) | senaryo önceden yazılmış: 5 sn; **ses "üretilemedi"** | **canlı hata, düzeltildi** PR #338: oynatıcı aynı sese iki istek attı, ikincisi "işlem sürüyor" alıp düştü, ilki krediyi düştü |
| Oynatıcı | küre · "1 kaynak" · kelime kelime akan transkript · Tam transkript · ◁ -15 ▶ +15 1x · 00:00 / 04:45 | küre · soru başlığı · bölüm çipleri · Tam transkript · İndir · aynı denetimler · süre | eşdeğer+ |

## 7. "Daha fazla" menüsü ve profil
Astra: Okulum · Aktivitelerim · Takvimim · Geçmiş konuşmalar. Cortex: Belgelerim · Sınıflar · Aktivitelerim · Takvimim · Limitler · Davet et · Geçmiş konuşmalar · Çıkış yap. Eşdeğer+.
Profil (Astra `?dialog=profile` × Cortex `/profil`): avatar · ad · okul · yaş · Ayarlar · davet kartı · streak + hafta · Aktivitelerim/Takvimim · Ayarlar/Kullanım/Abonelikler/Geçmiş konuşmalar · Görünüm · Yardım · Uygulamayı indir (bizde "Telefondan kullan") · Çıkış. Birebir.

## 8. Abonelik / fiyat
Astra (profil → Abonelikler): "Paketin geçerlilik süresi: 24.10.2026 · ASTRA AI PLUS · Yükseltme paketi · Aboneliği yönet · Faturalar". "Yükseltme paketi" doğrudan **Stripe onay sayfasına** gidiyor (Sigma ₺1.997/ay; bugün ₺1.856,13 fark) — onaylanmadı, geri dönüldü.
Cortex `/pay`: Plus ₺599/ay (yıllık %58 tasarruf) · "Bir hafta dene ₺349" · Misafir/Ücretsiz/Plus/Sigma karşılaştırma tablosu · Ön bilgilendirme + mesafeli satış onayı · PayTR. Eşdeğer; bizde karşılaştırma tablosu ve hukuki onay fazladan (zorunlu).

## 9. Test üretim hızı — ölçüm
`teacher_quiz` canlı: `kept 5, rejected 1, rounds 0, calls 2, ms 30165` (hızlı işlemde). Taslak çağrısı varsayılan düşünmeyle, denetim tek çağrı. Ders motorunda yazar `reasoning_effort: low` (18 Ekim kararı), testte değil. Soğuk test yalnız "Başka birini seç" ile kilitli adım açılınca (yolda sıradaki test önceden yazılıyor). Seçenek: taslağa `low` (tahmini 30 → ~20 sn; kalite denetimden geçtiği için korunur) — ürün sahibine soru.

## 10. Okulum
Astra `/exam-preps/school`: okul başlığı (defne), "Geçen haftanın en iyi okul arkadaşları" kürsü 1-2-3, "Yıldız sıralaması", **"Sınav hazırlıkları · 15"** — öğrencinin bütün hazırlıkları okul sayfasında kart olarak (yazar, ders, ad, görüntülenme, "Senin") — paylaşım varsayılan açık.
Cortex `/deneme-sinavlari/okulum`: aynı kürsü (tek kişi), "Yıldız sıralaması", okul satırı + Değiştir, "Okulunda henüz paylaşılan hazırlık yok" + "Okul yazılısı oluştur" — paylaşım **isteğe bağlı** (hazırlık menüsünden). Fark bir ürün kararı (gizlilik × keşfedilebilirlik) — soru.
Not: `/okulum` adresi 404 (sayfa `/deneme-sinavlari/okulum`); menüde bağlantı doğru, yalnız elle yazınca.

## Kararlar (19 Ekim 2026, ürün sahibi: "sırayla hallet, belirlediğin ölçüleri koy")
| Madde | Karar ve ölçü | PR |
|---|---|---|
| İlerleme sekmesi (tahmin, tempo, "0 eksik", ≥%1) | Astra'yla aynı dört sayı; tahmin ilk dersten sonra | #335, #336 |
| Testte yanlış cevap | Doğru şık yeşil işaretlenir | #337 |
| Podcast sesi "üretilemedi" | Aynı sese ikinci istek bekler; oynatıcı tek istek atar | #338 |
| "Üretilemedi / oluşturulamadı" | Parça düşer, istek düşmez: podcast satır kurtarma + ikinci taslak, ders ilk kavramı da atabilir, test ikinci taslak, ekran bir kez kendiliğinden yeniden dener | #339 |
| 1. Ruh hali kartı | Günde bir kez (Türkiye günü); aynı gün tekrar sorulmaz. Derste art arda iki onay kartı da böylece kalktı | #340 |
| 2. "+%X kazandın" | Kanıt üreten etkinlikte konu hâkimiyeti arttıysa sonuçtan sonra kart | #342 |
| 3. Soğuk test hızı | Taslak ve düzeltme `reasoning_effort: low`, denetçi varsayılan; ölçüt canlı `teacher_quiz` ms (önce 30.165) | #341 |
| 4. Okul paylaşımı | Bizde isteğe bağlı kalır (Astra'da varsayılan açık). Gerekçe: öğrencinin belgesinden çıkan hazırlık okul listesine kendiliğinden düşmemeli | — |
| 5a. 16 konu (#247) | Kalır. "Her sayfa tek konuya" kuralı gevşetilmez (28'e çıkmaz). Ölçü: 30 sayfa → 16 konu, sayfa/konu ≈ 1,9; bütün bölümler yolda; ilk ders kıyası Cortex 88 / Astra 78 | — |
| 5b. Beceri ağacı görünümü | Eklenmez: konu listesi aynı bilgiyi (konu başına %, çözülen, ders) gösteriyor; ayrı görünüm öğretmiyor (AGENTS: parite tek başına gerekçe değil) | — |
| 5c. Ders açılışında iki onay kartı | 1. maddeyle çözüldü: aynı gün ikinci açılışta yalnız "Önerilen ders" kartı | #340 |
